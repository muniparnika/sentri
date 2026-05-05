#!/usr/bin/env node
/**
 * promote-sprint-item.mjs — PROC-002
 *
 * Automates the NEXT.md / ROADMAP.md / docs/changelog.md hand-off after a PR
 * ships, per REVIEW.md § Sprint Tracker Hand-off. Given the shipped PR number
 * and the queue-slot-2 item id to promote, the script:
 *
 *   1. Parses NEXT.md to extract the Current PR block + recently-completed
 *      table.
 *   2. Moves the Current PR into the top row of "Recently completed" (cap 3)
 *      and rewrites the "Current PR" heading to point at the promoted item.
 *   3. Appends a one-line "promoted by script" marker to docs/changelog.md
 *      **inside the `## [Unreleased]` section** — NOT at the bottom of the
 *      file (which falls inside a released version and corrupts history).
 *   4. Updates the fast-path "Current sprint:" line in ROADMAP.md so the
 *      top-of-file pointer matches the newly-promoted item.
 *
 * By design this is a conservative transform: it preserves every existing
 * line it doesn't explicitly rewrite, so diffs are minimal and easy to
 * review. Pass `--root=<dir>` to operate on a sandbox (used by the
 * smoke-test fixture in scripts/promote-sprint-item.test.mjs).
 *
 * Usage:
 *   node scripts/promote-sprint-item.mjs <prNumber> <nextItemId> [--root=<dir>]
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
// Split only on the FIRST `=` so paths containing `=` aren't truncated.
// `--root=/path/with=equals` → `{ root: "/path/with=equals" }`, not
// `{ root: "/path/with" }` (which `.split("=")` + `Object.fromEntries`
// would produce by silently dropping the tail).
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => {
    const stripped = a.replace(/^--/, "");
    const eq = stripped.indexOf("=");
    return eq < 0 ? [stripped, true] : [stripped.slice(0, eq), stripped.slice(eq + 1)];
  })
);
const [prNumber, nextItemId] = positional;
const root = flags.root || process.cwd();

if (!prNumber || !nextItemId) {
  console.error(
    "Usage: node scripts/promote-sprint-item.mjs <prNumber> <nextItemId> [--root=<dir>]"
  );
  process.exit(1);
}

const NEXT_PATH = path.join(root, "NEXT.md");
const ROADMAP_PATH = path.join(root, "ROADMAP.md");
const CHANGELOG_PATH = path.join(root, "docs/changelog.md");

/**
 * Extracts the Current PR item id (e.g. "CAP-004 + MET-001 + PROC-002") and
 * title from a "## ▶ Current PR — <id>" heading.
 */
function parseCurrentPr(nextMd) {
  const heading = nextMd.match(/^##\s+▶\s+Current PR\s+—\s+(.+)$/m);
  const titleLine = nextMd.match(/^\*\*Title:\*\*\s+(.+)$/m);
  return {
    id: heading ? heading[1].trim() : "unknown",
    title: titleLine ? titleLine[1].trim() : "(title not found)",
  };
}

/**
 * Prepend a new "Recently completed" row, capped at 3 entries. Keeps the
 * table header + separator intact; drops the oldest row if we exceed the cap.
 */
function updateRecentlyCompleted(nextMd, prNum, shipped) {
  const marker = "## ✅ Recently completed";
  const idx = nextMd.indexOf(marker);
  if (idx < 0) return nextMd;

  const before = nextMd.slice(0, idx);
  const rest = nextMd.slice(idx);
  const lines = rest.split("\n");

  // Locate the header row (| ID | Title | PR |) and the separator just below it.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*ID\s*\|\s*Title\s*\|\s*PR\s*\|/.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return nextMd;

  const insertAt = headerIdx + 2; // after header + separator
  // Collect existing data rows until a blank line or non-row line.
  const existingRows = [];
  let end = insertAt;
  while (end < lines.length && /^\|/.test(lines[end])) {
    existingRows.push(lines[end]);
    end++;
  }

  const newRow = `| ${shipped.id} | ${shipped.title} | #${prNum} |`;
  const trimmed = [newRow, ...existingRows].slice(0, 3); // cap at 3

  const rebuilt = [
    ...lines.slice(0, insertAt),
    ...trimmed,
    ...lines.slice(end),
  ].join("\n");

  return before + rebuilt;
}

/** Rewrite the "## ▶ Current PR — …" heading to point at the new item id. */
function rewriteCurrentPrHeading(nextMd, newId) {
  return nextMd.replace(
    /^##\s+▶\s+Current PR\s+—\s+.+$/m,
    `## ▶ Current PR — ${newId}`
  );
}

/** Insert a bullet under `## [Unreleased]` — never at the file's end. */
function appendToUnreleased(changelogMd, prNum, shipped, newId) {
  const unreleasedIdx = changelogMd.indexOf("## [Unreleased]");
  if (unreleasedIdx < 0) {
    // No Unreleased section — prepend one so we never write into a released
    // version's section by accident.
    const note =
      `## [Unreleased]\n\n` +
      `- Promoted ${shipped.id} → ${newId} after PR #${prNum}.\n\n`;
    return note + changelogMd;
  }
  // Find the first "### " or next "## " after [Unreleased] — insert just above it.
  const afterHeader = unreleasedIdx + "## [Unreleased]".length;
  const tail = changelogMd.slice(afterHeader);
  const nextSectionRel = tail.search(/\n(### |## \[)/);
  const insertAt = nextSectionRel < 0 ? changelogMd.length : afterHeader + nextSectionRel + 1;
  const line = `\n- Sprint promotion: shipped ${shipped.id} in PR #${prNum}; promoted ${newId} to Current PR slot. (#${prNum})\n`;
  return changelogMd.slice(0, insertAt) + line + changelogMd.slice(insertAt);
}

/** Rewrite the top-of-file "**Current sprint:**" pointer in ROADMAP.md. */
function updateCurrentSprintLine(roadmapMd, newId) {
  return roadmapMd.replace(
    /(\*\*Current sprint:\*\*\s+)`[^`]+`/,
    `$1\`${newId}\``
  );
}

// ── Apply all three transforms ──────────────────────────────────────────────
let shipped = { id: "unknown", title: "(title not found)" };

if (fs.existsSync(NEXT_PATH)) {
  let next = fs.readFileSync(NEXT_PATH, "utf8");
  shipped = parseCurrentPr(next);
  next = updateRecentlyCompleted(next, prNumber, shipped);
  next = rewriteCurrentPrHeading(next, nextItemId);
  fs.writeFileSync(NEXT_PATH, next);
}

if (fs.existsSync(ROADMAP_PATH)) {
  let roadmap = fs.readFileSync(ROADMAP_PATH, "utf8");
  roadmap = updateCurrentSprintLine(roadmap, nextItemId);
  fs.writeFileSync(ROADMAP_PATH, roadmap);
}

if (fs.existsSync(CHANGELOG_PATH)) {
  let changelog = fs.readFileSync(CHANGELOG_PATH, "utf8");
  changelog = appendToUnreleased(changelog, prNumber, shipped, nextItemId);
  fs.writeFileSync(CHANGELOG_PATH, changelog);
}

console.log(
  `Promoted sprint tracker for PR #${prNumber}: shipped "${shipped.id}" → next="${nextItemId}"`
);
