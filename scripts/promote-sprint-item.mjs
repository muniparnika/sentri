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

/**
 * PROC-003 — split a possibly-bundled item id (e.g. `"AUTO-017.3 + PROC-001 + PROC-003"`)
 * into its constituent ids. Single-id strings round-trip unchanged.
 */
function splitBundledIds(id) {
  return String(id || "")
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * PROC-003 — infer the Summary table category for an ID. Falls through to
 * `null` for orphan prefixes (`MET-*`, `UI-REFACTOR-*`) so the caller can
 * skip the Summary-row decrement rather than guess wrong.
 */
function inferCategory(id) {
  if (id.startsWith("SEC-"))               return "Security & Compliance";
  if (id.startsWith("INF-"))               return "Infrastructure";
  if (id.startsWith("ACL-"))               return "Access Control";
  if (id.startsWith("FEA-"))               return "Platform Features";
  if (id.startsWith("DIF-") || id.startsWith("INT-")) return "Differentiators";
  if (id.startsWith("AUTO-"))              return "Autonomous Intelligence";
  if (id.startsWith("CAP-"))               return "Capabilities";
  if (id.startsWith("PROC-"))              return "Process automation";
  if (id.startsWith("MNT-") || id.startsWith("MAINT-")) return "Maintenance";
  return null;
}

/**
 * PROC-003 — append a row to ROADMAP.md's `## Completed Work Summary` table
 * for each shipped id. The shipped record's title is shared across bundle
 * members (the heading prose was authored once) so per-id rows reuse the
 * same title — this matches how `MET-001 + CAP-004 + PROC-002` ought to
 * have been recorded after PR #8 (each as its own row).
 *
 * Idempotent: skips rows whose `| ID |` cell already exists in the table
 * so re-running the script doesn't double-write.
 */
function appendCompletedWorkSummary(roadmapMd, shipped, prNum) {
  const marker = "## Completed Work Summary";
  const start = roadmapMd.indexOf(marker);
  if (start < 0) return roadmapMd;

  // Locate the table by walking forward from the marker until we find the
  // header row, then walk past existing data rows until the first non-`|`
  // line (the table's blank-line terminator). Insert above that boundary.
  const tail = roadmapMd.slice(start);
  const lines = tail.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*ID\s*\|\s*Title\s*\|/.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return roadmapMd;

  let insertAt = headerIdx + 2; // skip header + separator
  while (insertAt < lines.length && /^\|/.test(lines[insertAt])) insertAt++;

  const ids = splitBundledIds(shipped.id);
  const existing = lines.slice(headerIdx + 2, insertAt).join("\n");
  const newRows = ids
    .filter((id) => !new RegExp(`^\\|\\s*${id.replace(/[-/.]/g, "\\$&")}\\s*\\|`, "m").test(existing))
    .map((id) => `| ${id} | ${shipped.title} | PR #${prNum} |`);

  if (newRows.length === 0) return roadmapMd;

  const rebuilt = [
    ...lines.slice(0, insertAt),
    ...newRows,
    ...lines.slice(insertAt),
  ].join("\n");
  return roadmapMd.slice(0, start) + rebuilt;
}

/**
 * PROC-003 — for each shipped id, decrement its category's `Remaining`
 * count and bump `✅ Done` in the bottom-of-file `## Summary` table, then
 * recompute the `**Totals**` row. Best-effort — orphan prefixes (no
 * matching category) are skipped silently so the script never blows up
 * on `MET-*` / `UI-REFACTOR-*` style items.
 *
 * The table shape is:
 *   | Category | Total | ✅ Done | 🔄 In Progress | 🔲 Pending | Remaining |
 * We only mutate the `✅ Done` and `🔲 Pending` columns (Done +1, Pending
 * -1) per shipped id; `Total` is invariant. The `Remaining` column is a
 * free-text annotation — left unchanged because the script can't safely
 * rewrite prose without losing context.
 */
function decrementRemainingCounts(roadmapMd, shipped) {
  const ids = splitBundledIds(shipped.id);
  let out = roadmapMd;

  // Per-category row update.
  for (const id of ids) {
    const category = inferCategory(id);
    if (!category) {
      console.warn(`[promote] skipped Summary decrement for ${id} (orphan prefix)`);
      continue;
    }
    const rowRe = new RegExp(
      `^(\\|\\s*${category.replace(/[-&/.]/g, "\\$&")}\\s*\\|\\s*)(\\d+)(\\s*\\|\\s*)(\\d+)(\\s*\\|\\s*)(\\d+)(\\s*\\|\\s*)(\\d+)(\\s*\\|)`,
      "m"
    );
    out = out.replace(rowRe, (_m, p1, total, p3, done, p5, inProg, p7, pending, p9) => {
      const newDone    = String(Number(done) + 1);
      const newPending = String(Math.max(0, Number(pending) - 1));
      return `${p1}${total}${p3}${newDone}${p5}${inProg}${p7}${newPending}${p9}`;
    });
  }

  // Totals row recompute by summing every non-Totals data row above it.
  const summaryStart = out.indexOf("## Summary");
  if (summaryStart < 0) return out;
  const tail = out.slice(summaryStart);
  const lines = tail.split("\n");
  const dataRows = [];
  let totalsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*\*\*Totals\*\*/.test(lines[i])) { totalsIdx = i; break; }
    if (/^\|/.test(lines[i]) && !/^\|\s*-+/.test(lines[i]) && !/^\|\s*Category\s*\|/.test(lines[i])) {
      dataRows.push(lines[i]);
    }
  }
  if (totalsIdx < 0) return out;

  let total = 0, done = 0, inProg = 0, pending = 0;
  for (const row of dataRows) {
    const m = row.match(/^\|[^|]+\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
    if (!m) continue;
    total   += Number(m[1]);
    done    += Number(m[2]);
    inProg  += Number(m[3]);
    pending += Number(m[4]);
  }
  lines[totalsIdx] = lines[totalsIdx].replace(
    /^(\|\s*\*\*Totals\*\*\s*\|\s*\*\*)(\d+)(\*\*\s*\|\s*\*\*)(\d+)(\*\*\s*\|\s*\*\*)(\d+)(\*\*\s*\|\s*\*\*)(\d+)(\*\*\s*\|)/,
    (_m, p1, _t, p3, _d, p5, _i, p7, _p, p9) =>
      `${p1}${total}${p3}${done}${p5}${inProg}${p7}${pending}${p9}`
  );
  return out.slice(0, summaryStart) + lines.join("\n");
}

/**
 * PROC-003 — for each shipped id, delete its detailed `### <ID> — …` entry
 * (heading through the next `### ` or `## `), keeping only the row in the
 * Completed Work Summary table as the canonical record. Best-effort: items
 * without a detailed entry (like `PROC-*` items, which are spec'd in
 * NEXT.md and never fully detailed in ROADMAP.md) are skipped silently.
 *
 * Trailing `---` separators left orphaned by the prune are collapsed to
 * a single separator so the file's section structure stays clean.
 */
function pruneShippedRoadmapEntry(roadmapMd, shipped) {
  let out = roadmapMd;
  for (const id of splitBundledIds(shipped.id)) {
    const escaped = id.replace(/[-/.]/g, "\\$&");
    // Match `### <ID> — <title>` through to the next `### ` or `## ` heading.
    // The lookahead leaves the next heading in place so successive prunes
    // work against the post-prune buffer.
    const re = new RegExp(
      `\\n### ${escaped}\\s+—[\\s\\S]*?(?=\\n##(?:#)? )`,
      ""
    );
    out = out.replace(re, "\n");
  }
  // Collapse any `---\n\n---` runs the prune may have produced.
  out = out.replace(/\n---\s*\n+---\s*\n/g, "\n---\n");
  return out;
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
  // PROC-003 — three new transforms that fold the manual "Sprint Tracker
  // Hand-off" steps from REVIEW.md into the script. Each is best-effort and
  // idempotent: missing sections, orphan ID prefixes, and absent detailed
  // entries are skipped silently so the script never blows up the hand-off.
  roadmap = appendCompletedWorkSummary(roadmap, shipped, prNumber);
  roadmap = decrementRemainingCounts(roadmap, shipped);
  roadmap = pruneShippedRoadmapEntry(roadmap, shipped);
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
