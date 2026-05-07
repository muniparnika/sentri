#!/usr/bin/env node
/**
 * promote-sprint-item.mjs — PROC-002
 *
 * Automates the NEXT.md / ROADMAP.md / docs/changelog.md hand-off after a PR
 * ships, per REVIEW.md § Sprint Tracker Hand-off. Given the shipped PR number
 * and a queue-slot item id to promote, the script:
 *
 *   1. Parses NEXT.md to extract the Current PR id (stripping `(bundled)` /
 *      similar parenthetical suffixes from the heading so the canonical id
 *      flows into Recently-completed + Completed Work Summary).
 *   2. Moves the shipped Current PR into the top row of "Recently completed"
 *      (cap 3).
 *   3. Locates the matching `### N · <id> — <title>` slot in `## ⏭ Queue`
 *      and uses its body to rewrite the Current PR section in-place —
 *      heading, title, branch (slug-built from the id), effort/priority
 *      meta-line carried over verbatim, prose body, and a fresh
 *      `### PR checklist` template. Falls through to a heading-only rewrite
 *      with a `console.warn` when no matching queue slot exists (ad-hoc
 *      promotions or hand-edited NEXT.md files).
 *   4. Removes the now-promoted slot from the queue and renumbers the
 *      survivors so `### 1 · …`, `### 2 · …`, … stay contiguous; updates
 *      the `## ⏭ Queue (next N PRs after current)` header count.
 *   5. Appends a one-line "promoted by script" marker to docs/changelog.md
 *      **inside the `## [Unreleased]` section** — NOT at the bottom of the
 *      file (which falls inside a released version and corrupts history).
 *   6. Updates the fast-path "Current sprint:" line in ROADMAP.md so the
 *      top-of-file pointer matches the newly-promoted item.
 *   7. Appends per-id rows to ROADMAP.md `## Completed Work Summary`,
 *      decrements the `## Summary` per-category Pending count + bumps Done,
 *      recomputes the Totals row, and prunes detailed `### <ID> — …`
 *      sections for shipped items (PROC-003 transforms, all idempotent).
 *
 * By design this is a conservative transform: it preserves every existing
 * line it doesn't explicitly rewrite, so diffs are minimal and easy to
 * review. Pass `--root=<dir>` to operate on a sandbox (used by the
 * smoke-test fixture in scripts/promote-sprint-item.test.mjs).
 *
 * Usage:
 *   # Promote a single queue item to Current PR
 *   node scripts/promote-sprint-item.mjs <prNumber> <nextItemId> [--root=<dir>]
 *
 *   # Promote a bundle (multiple queue items merged into one Current PR)
 *   node scripts/promote-sprint-item.mjs <prNumber> "<id1>+<id2>" [--root=<dir>]
 *   node scripts/promote-sprint-item.mjs <prNumber> "<id1> + <id2>" [--root=<dir>]
 *
 * The second form accepts a `+`-joined id string (with or without spaces)
 * and:
 *   - Renders the Current PR heading as `## ▶ Current PR — <id1> + <id2> (bundled)`
 *   - Sources scope text from EACH queue slot, concatenated under the new
 *     heading with `### Scope 1 — <id1>` / `### Scope 2 — <id2>` sub-headings
 *     so reviewers can still see which spec drove which acceptance criterion
 *   - Removes ALL referenced slots from the queue and renumbers survivors
 *   - Adds a `**Do not split this PR.**` note matching the AUTO-003+003b
 *     bundling pattern
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
 *
 * Strips trailing parenthetical suffixes like `" (bundled)"` from the heading
 * — those are reader hints, not part of the canonical item id. Without this
 * the Recently-completed row + Completed Work Summary table end up with
 * `AUTO-003b (bundled)` style ids that drift from the rest of the ledger
 * (e.g. `splitBundledIds` would produce `["AUTO-003", "AUTO-003b (bundled)"]`
 * and `pruneShippedRoadmapEntry`'s regex never matches the suffixed form).
 */
function parseCurrentPr(nextMd) {
  const heading = nextMd.match(/^##\s+▶\s+Current PR\s+—\s+(.+)$/m);
  const titleLine = nextMd.match(/^\*\*Title:\*\*\s+(.+)$/m);
  const rawId = heading ? heading[1].trim() : "unknown";
  // Drop a trailing `(…)` suffix attached after a space — keeps the id
  // canonical while preserving inner-bundle `+` joins (e.g.
  // `"AUTO-003 + AUTO-003b (bundled)"` → `"AUTO-003 + AUTO-003b"`).
  const id = rawId.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return {
    id,
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

/**
 * Find the queue-slot block matching `nextItemId` and return:
 *   - `block`: the slot's body (everything between its `### N · <id> — <title>`
 *     heading and the next `### ` / `## ` heading), trimmed
 *   - `title`: the title text from the heading (e.g. "Change detection / …")
 *   - `start` / `end`: byte offsets covering the heading + body (used by
 *     `removeQueueSlot` so the slot can be excised after promotion)
 *   - `slotNumber`: the `N` from `### N · …` (used to drive renumbering)
 *
 * Returns `null` when the queue doesn't have a slot matching `nextItemId`,
 * which makes `replaceCurrentPrBody` fall through to a heading-only rewrite —
 * the previous behaviour, preserved as a safety net for ids that aren't in
 * the queue (e.g. ad-hoc promotions or hand-edited NEXT.md files).
 *
 * The `id` match is loose (`startsWith`) so a queue heading like
 * `### 1 · AUTO-002 — Change detection / diff-aware crawling` matches both
 * the bare `AUTO-002` id and a future bundled form like `AUTO-002 + …`.
 */
function findQueueSlot(nextMd, nextItemId) {
  const queueMarker = nextMd.indexOf("## ⏭ Queue");
  if (queueMarker < 0) return null;
  const queueRegion = nextMd.slice(queueMarker);
  // Match `### N · <id> — <title>` where <id> is the full target id.
  // Escape regex metachars in the id so the lookup is literal-safe.
  const escaped = nextItemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(`^### (\\d+) · (${escaped})\\s+—\\s+(.+)$`, "m");
  const match = queueRegion.match(headingRe);
  if (!match) return null;
  const headingStartInRegion = match.index;
  const slotNumber = Number(match[1]);
  const title = match[3].trim();
  // Body extends from the end of the heading line until the next `### ` /
  // `## ` heading or end-of-file.
  const headingEndInRegion = headingStartInRegion + match[0].length;
  const tail = queueRegion.slice(headingEndInRegion);
  const nextHeadingRel = tail.search(/\n##(?:#)? /);
  const bodyEndInRegion = nextHeadingRel < 0
    ? queueRegion.length
    : headingEndInRegion + nextHeadingRel + 1; // +1 keeps the trailing newline
  return {
    id: match[2],
    block: queueRegion.slice(headingStartInRegion + match[0].length, bodyEndInRegion).trim(),
    title,
    slotNumber,
    start: queueMarker + headingStartInRegion,
    end: queueMarker + bodyEndInRegion,
  };
}

/**
 * Replace everything between the `## ▶ Current PR …` heading and the next
 * `## ` section with a freshly-rendered scope block sourced from the queue
 * slot. Without this, the previous handler only flipped the heading and left
 * the prior PR's scope text in place — agents reading NEXT.md after a
 * promotion would see "Current PR — AUTO-002" with AUTO-003's files /
 * acceptance criteria below it.
 *
 * The rendered block keeps the same shape NEXT.md uses for hand-authored
 * Current PR sections (Title / Effort / Priority / dependencies, then prose,
 * then the spec body verbatim from the queue), so a human can still hand-edit
 * the result without re-templating.
 *
 * If `slot` is null (id not found in the queue — e.g. a hand-rolled
 * promotion), this is a no-op so the caller's heading rewrite still applies.
 */
/**
 * Bundle-aware wrapper around the single-slot `replaceCurrentPrBody`.
 *
 * Splits a `+`-joined `nextItemId` (e.g. `"AUTO-002 + AUTO-015"`) into its
 * component ids, looks up each in the queue, and renders ONE Current PR
 * section that concatenates the matched slots' bodies under per-scope
 * `### Scope N — <id>` sub-headings. Single-id calls round-trip unchanged
 * to the original single-slot path so existing fixtures + the smoke test
 * keep passing.
 *
 * Why a wrapper rather than re-shaping `replaceCurrentPrBody`: the
 * single-slot path is already exercised by an established smoke test;
 * widening its signature would force every other caller (and the existing
 * fixture) to migrate. The wrapper keeps single-id behaviour byte-identical
 * and only diverges when the caller asked for a bundle.
 */
function replaceCurrentPrBodyForIds(nextMd, ids, slots, prevShipped, prevPrNum) {
  const realSlots = slots.filter(Boolean);
  if (realSlots.length === 0) return nextMd;
  if (ids.length === 1) {
    // Single-id path: delegate to the original implementation untouched.
    return replaceCurrentPrBody(nextMd, ids[0], realSlots[0], prevShipped, prevPrNum);
  }
  // Bundle path: render a multi-scope section.
  const headingId = `${ids.join(" + ")} (bundled)`;
  const branchSlug = ids.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Pull the first resolved slot's meta line (Effort/Priority/Dependencies)
  // for the section header. Per-scope sub-blocks below carry their own meta
  // lines so reviewers see each scope's individual sizing.
  const firstMetaMatch = realSlots[0].block.match(/^\*\*Effort:\*\*[^\n]+/m);
  const firstMeta = firstMetaMatch ? firstMetaMatch[0] : "**Effort:** TBD | **Priority:** TBD";
  // Compose per-scope sub-blocks. Each preserves the queue body verbatim so
  // hand-edits to the queue's prose flow through to the bundle without
  // re-templating.
  const scopeBlocks = realSlots.map((s, i) =>
    `### Scope ${i + 1} — ${s.id} — ${s.title}\n\n${s.block}`,
  );
  // Surface any caller-requested ids that didn't resolve to a queue slot —
  // the script can't synthesise scope text for an id that doesn't exist,
  // but it can flag the gap so a human fills it in before review.
  const missingIds = ids.filter((id) => !realSlots.find((s) => s.id === id));
  const missingNote = missingIds.length > 0
    ? `> ⚠ **TODO:** the following ids weren't found in the queue and need hand-written scope blocks: ${missingIds.map((m) => "`" + m + "`").join(", ")}.\n\n`
    : "";
  const slotNumbers = realSlots.map((s) => s.slotNumber).join(", ");
  const breadcrumb = `> ${prevShipped.id} ✅ shipped in PR #${prevPrNum}. ${ids.join(" + ")} promoted as a bundle from queue slot${realSlots.length === 1 ? "" : "s"} ${slotNumbers} per \`NEXT.md\` rotation.`;
  const bundleNote = "**Do not split this PR.** Bundled promotions ship together by design — see the bundling-guidance note at the top of NEXT.md and the per-scope sub-headings below.";
  const rendered =
    `## ▶ Current PR — ${headingId}\n\n` +
    `**Title:** ${realSlots.map((s) => s.title).join(" + ")}\n` +
    `**Branch:** \`feat/${branchSlug}\`\n` +
    `${firstMeta}\n\n` +
    `${breadcrumb}\n\n` +
    `${bundleNote}\n\n` +
    missingNote +
    scopeBlocks.join("\n\n") + "\n\n" +
    `### PR checklist (${ids.join(" + ")})\n\n` +
    `- [ ] **Both scopes shipped in one PR — do not split**\n` +
    `- [ ] Acceptance criteria for every scope above are met\n` +
    `- [ ] Add entry to \`docs/changelog.md\` under \`## [Unreleased]\` (one per scope)\n` +
    `- [ ] Frontend consumer ships in the same PR for every new backend route (PROC-001 no-orphan-routes guard)\n\n`;
  // Splice the rendered block in place of the existing Current PR section.
  const currentStart = nextMd.indexOf("## ▶ Current PR");
  if (currentStart < 0) return nextMd;
  const tail = nextMd.slice(currentStart + "## ▶ Current PR".length);
  const nextSectionRel = tail.search(/\n## (?!▶)/);
  if (nextSectionRel < 0) return nextMd;
  const currentEnd = currentStart + "## ▶ Current PR".length + nextSectionRel + 1;
  return nextMd.slice(0, currentStart) + rendered + nextMd.slice(currentEnd);
}

function replaceCurrentPrBody(nextMd, newId, slot, prevShipped, prevPrNum) {
  if (!slot) return nextMd;

  // Pull the metadata line (e.g. `**Effort:** L | **Priority:** 🟢 …`) and
  // the dependencies / source line out of the queue body — those are the
  // only structured fields the queue carries that map cleanly to the
  // Current PR header. The remainder is the spec body and copies verbatim.
  // Queue heading lines look like:
  //   **Effort:** L | **Priority:** 🟢 Differentiator | **Dependencies:** none | **Source:** ROADMAP.md Phase 4 (AUTO-002)
  const metaMatch = slot.block.match(/^\*\*Effort:\*\*[^\n]+/m);
  const metaLine = metaMatch ? metaMatch[0] : "";
  // Body = everything *except* the meta line — drop it so we don't render it twice.
  const body = metaLine ? slot.block.replace(metaLine, "").trim() : slot.block;

  // Render the new Current PR section. The "promoted from queue slot N"
  // breadcrumb makes the hand-off auditable in `git log -p NEXT.md`.
  const rendered = [
    `## ▶ Current PR — ${newId}`,
    "",
    `**Title:** ${slot.title}`,
    `**Branch:** \`feat/${newId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\``,
    metaLine || "**Effort:** TBD | **Priority:** TBD",
    "",
    `> ${prevShipped.id} ✅ shipped in PR #${prevPrNum}. ${newId} promoted from queue slot ${slot.slotNumber} per \`NEXT.md\` rotation.`,
    "",
    body,
    "",
    `### PR checklist (${newId})`,
    "",
    "- [ ] Acceptance criteria above are all met",
    "- [ ] Add entry to `docs/changelog.md` under `## [Unreleased]`",
    "- [ ] Frontend consumer ships in the same PR for every new backend route (PROC-001 no-orphan-routes guard)",
    "",
  ].join("\n");

  // Replace the existing Current PR section: from `## ▶ Current PR` heading
  // up to (but not including) the next `## ` heading at column 0.
  const currentStart = nextMd.indexOf("## ▶ Current PR");
  if (currentStart < 0) return nextMd;
  const tail = nextMd.slice(currentStart + "## ▶ Current PR".length);
  const nextSectionRel = tail.search(/\n## (?!▶)/);
  if (nextSectionRel < 0) return nextMd;
  const currentEnd = currentStart + "## ▶ Current PR".length + nextSectionRel + 1;
  return nextMd.slice(0, currentStart) + rendered + nextMd.slice(currentEnd);
}

/**
 * Remove the promoted slot from the queue and renumber the surviving slots
 * so the queue header `## ⏭ Queue (next N PRs after current)` and slot
 * numbering stay accurate. Without this, `NEXT.md` ends up with the
 * promoted item duplicated (once as Current PR, once at slot N in the
 * queue) — exactly the failure mode that triggered this fix.
 *
 * Idempotent: if the slot doesn't exist (e.g. ad-hoc promotion not
 * sourced from the queue), this is a no-op.
 */
function removeQueueSlot(nextMd, slot) {
  if (!slot) return nextMd;
  const after = nextMd.slice(0, slot.start) + nextMd.slice(slot.end);
  // Renumber slots: any `### N · ` → `### (N-1) · ` for N > slot.slotNumber.
  // Walk all slot headings inside the queue region and rewrite in-order so
  // a slot-3 below the deletion becomes slot-2.
  const queueStart = after.indexOf("## ⏭ Queue");
  if (queueStart < 0) return after;
  const head = after.slice(0, queueStart);
  let queue = after.slice(queueStart);
  queue = queue.replace(
    /^### (\d+) · /gm,
    (_m, n) => {
      const num = Number(n);
      // Slots numbered above the deleted one shift down by 1; slots
      // numbered below it stay put. The deleted slot itself is already
      // gone, so we never see its `n` here.
      return `### ${num > slot.slotNumber ? num - 1 : num} · `;
    },
  );
  // Update the header count: count surviving `### N · ` headings.
  const slotCount = (queue.match(/^### \d+ · /gm) || []).length;
  queue = queue.replace(
    /^## ⏭ Queue \(next \d+ PRs? after current\)$/m,
    `## ⏭ Queue (next ${slotCount} PR${slotCount === 1 ? "" : "s"} after current)`,
  );
  return head + queue;
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

// Bundle-aware id parsing: a `+`-joined `nextItemId` (with or without spaces)
// promotes multiple queue slots into one bundled Current PR. Single-id
// values keep the original single-promotion shape — `splitBundledIds`
// returns a one-element array, every downstream loop runs once.
const promotedIds = splitBundledIds(nextItemId);
const headingId = promotedIds.length > 1
  ? `${promotedIds.join(" + ")} (bundled)`
  : promotedIds[0];

if (fs.existsSync(NEXT_PATH)) {
  let next = fs.readFileSync(NEXT_PATH, "utf8");
  shipped = parseCurrentPr(next);
  // Find each queue slot BEFORE we rewrite anything, so the offsets we
  // capture for `removeQueueSlot` still point at the unmutated buffer.
  // Slots are looked up in the order the user supplied them — which becomes
  // the `Scope 1 / Scope 2` ordering in the rendered bundle section.
  const slots = promotedIds.map((id) => {
    const slot = findQueueSlot(next, id);
    if (!slot) {
      console.warn(
        `[promote] queue slot for "${id}" not found — its scope block will be missing from the rendered Current PR section. ` +
        `Add a "### N · ${id} — <title>" entry under "## ⏭ Queue" before promoting, or hand-edit NEXT.md after.`,
      );
    }
    return slot;
  });
  next = updateRecentlyCompleted(next, prNumber, shipped);
  // `replaceCurrentPrBodyForIds` handles both single-id and bundled
  // promotions — single-id calls delegate to the legacy
  // `replaceCurrentPrBody` (preserving byte-identical output the smoke test
  // already locks down); bundled calls render `### Scope 1 — <id>` /
  // `### Scope 2 — <id>` sub-blocks under one Current PR heading.
  next = replaceCurrentPrBodyForIds(next, promotedIds, slots, shipped, prNumber);
  // Heading rewrite still runs for the all-slots-missing fall-through case;
  // when the body-replace already wrote the section the regex below simply
  // matches the freshly-written heading and re-writes it identically (the
  // `headingId` carries the `(bundled)` suffix for multi-id promotions so
  // round-tripping through `parseCurrentPr` on the next promotion strips
  // it back to the canonical id list).
  next = rewriteCurrentPrHeading(next, headingId);
  // Excise every promoted slot from the queue + renumber survivors. We
  // process in REVERSE slot-number order so each removal's offsets stay
  // valid against the buffer — removing a slot at offset X first would
  // shift every later slot's offsets upward, breaking the next removal.
  // `findQueueSlot` returns `slotNumber` from the heading, which gives a
  // stable sort key independent of buffer offsets.
  const slotsToRemove = slots
    .filter(Boolean)
    .sort((a, b) => b.slotNumber - a.slotNumber);
  for (const slot of slotsToRemove) {
    // Re-find by id against the in-progress buffer so offsets reflect any
    // prior removals in this loop. The sort above means each iteration
    // works on a buffer where higher-numbered slots have already been
    // excised, so the lookup is unambiguous.
    const fresh = findQueueSlot(next, slot.id);
    if (fresh) next = removeQueueSlot(next, fresh);
  }
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
