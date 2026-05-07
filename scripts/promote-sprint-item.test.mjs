/**
 * promote-sprint-item.test.mjs — PROC-002 smoke test
 *
 * Runs promote-sprint-item.mjs against a sandbox directory (never the real
 * tracker files) and asserts the four structural transforms:
 *   1. Current PR heading is rewritten to the promoted item id.
 *   2. Shipped item is prepended to the Recently completed table.
 *   3. docs/changelog.md gets a bullet inside `## [Unreleased]` — never at
 *      the bottom of the file (regression for the original append-to-EOF bug).
 *   4. ROADMAP.md "**Current sprint:**" line points at the new item.
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "promote-sprint-"));
const docs = path.join(sandbox, "docs");
fs.mkdirSync(docs, { recursive: true });

const NEXT_FIXTURE = `# NEXT.md

## ▶ Current PR — AUTO-099

**Title:** Do the foo thing
**Branch:** \`feat/auto-099\`

Scope details here.

## ⏭ Queue (next 4 PRs after current)

### 1 · AUTO-100 — Do the bar thing
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** none | **Source:** ROADMAP.md Phase 4

This entry will be promoted to Current PR — its body must show up under the
new "Current PR" heading verbatim, and the queue slot must be removed.

**Files:** backend/src/bar.js · backend/tests/bar.test.js

**Acceptance criteria:**
- Bar thing happens.
- Sibling AUTO-101 slot survives + renumbers from \`### 2\` to \`### 1\`.

### 2 · AUTO-101 — Sibling that should renumber
**Effort:** S | **Priority:** 🔵 Medium | **Dependencies:** none

Body of the sibling — must remain in the queue, but renumbered from slot 2 to slot 1.

## ✅ Recently completed

| ID | Title | PR |
|----|-------|----|
| OLD-A | Older shipped work | #10 |
| OLD-B | Even older work | #9 |
| OLD-C | Oldest work (will drop) | #8 |
`;

const ROADMAP_FIXTURE = `# ROADMAP.md

> **Current sprint:** \`AUTO-099\` — Do the foo thing · **Blockers:** none

## Completed Work Summary

| ID | Title | PR / Commit |
|----|-------|-------------|
| OLD-1 | An older shipped item | PR #50 |

---

## Phase 4 — Autonomous Intelligence

---

### AUTO-099 — Do the foo thing 🟢 Differentiator

**Status:** 🔄 In progress | **Effort:** S | **Source:** Audit

Detailed scope text that should be pruned after promotion.

**Files to change:**
- backend/src/foo.js

**Dependencies:** none

---

### AUTO-100 — Do the bar thing 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** M

This entry must survive the prune — only the shipped item is removed.

---

## Summary

| Category | Total | ✅ Done | 🔄 In Progress | 🔲 Pending | Remaining |
|----------|------:|--------:|---------------:|----------:|-----------|
| Autonomous Intelligence | 10 | 4 | 1 | 5 | AUTO-099 in-flight |
| Process automation | 3 | 1 | 1 | 1 | PROC-001 |
| **Totals** | **13** | **5** | **2** | **6** | |
`;

const CHANGELOG_FIXTURE = `# Changelog

## [Unreleased]

### Added
- Existing unreleased entry.

## [1.0.0] — 2026-01-01

### Added
- Old released entry — must NOT be modified.
`;

fs.writeFileSync(path.join(sandbox, "NEXT.md"), NEXT_FIXTURE);
fs.writeFileSync(path.join(sandbox, "ROADMAP.md"), ROADMAP_FIXTURE);
fs.writeFileSync(path.join(docs, "changelog.md"), CHANGELOG_FIXTURE);

execSync(`node scripts/promote-sprint-item.mjs 999 AUTO-100 --root="${sandbox}"`, {
  stdio: "pipe",
});

const next = fs.readFileSync(path.join(sandbox, "NEXT.md"), "utf8");
const roadmap = fs.readFileSync(path.join(sandbox, "ROADMAP.md"), "utf8");
const changelog = fs.readFileSync(path.join(docs, "changelog.md"), "utf8");

// 1. Current PR heading promoted.
assert.match(next, /^##\s+▶\s+Current PR\s+—\s+AUTO-100$/m, "Current PR heading must be rewritten");
assert.ok(!/##\s+▶\s+Current PR\s+—\s+AUTO-099/.test(next), "Old Current PR heading must be gone");

// 2. Shipped item prepended; table capped at 3; oldest dropped.
const tableMatch = next.match(/## ✅ Recently completed[\s\S]*/);
assert.ok(tableMatch, "Recently completed section must still exist");
const rows = tableMatch[0].split("\n").filter((l) => /^\|\s*[A-Z]/.test(l));
assert.equal(rows.length, 3, "Recently completed table must be capped at 3 rows");
assert.match(rows[0], /AUTO-099.*#999/, "Shipped item must be top row");
assert.match(rows[1], /OLD-A/, "Previous top row must shift down");
assert.ok(!/OLD-C/.test(tableMatch[0]), "Oldest row must be dropped past cap-3");

// 3. Changelog entry lands INSIDE [Unreleased], not at file end.
const unreleasedIdx = changelog.indexOf("## [Unreleased]");
const releasedIdx = changelog.indexOf("## [1.0.0]");
const promotionIdx = changelog.indexOf("Sprint promotion");
assert.ok(promotionIdx > unreleasedIdx, "Promotion note must be after [Unreleased] heading");
assert.ok(promotionIdx < releasedIdx, "Promotion note must be BEFORE the released section");
assert.match(changelog, /Old released entry — must NOT be modified\./, "Released section must be untouched");

// 4. ROADMAP.md current-sprint pointer updated.
assert.match(roadmap, /\*\*Current sprint:\*\*\s+`AUTO-100`/, "ROADMAP current-sprint pointer must update");
assert.ok(!/\*\*Current sprint:\*\*\s+`AUTO-099`/.test(roadmap), "Old sprint pointer must be gone");

// 5. PROC-003: shipped item appended to Completed Work Summary table.
const cwsMatch = roadmap.match(/## Completed Work Summary[\s\S]*?(?=\n## )/);
assert.ok(cwsMatch, "Completed Work Summary section must exist");
assert.match(cwsMatch[0], /\|\s*AUTO-099\s*\|.*\|\s*PR #999\s*\|/, "Shipped item must be appended to Completed Work Summary table");
assert.match(cwsMatch[0], /\|\s*OLD-1\s*\|/, "Pre-existing rows must be preserved");

// 6. PROC-003: Summary stats decremented (Done +1, Pending -1) for the
//    shipped item's category, and Totals row recomputed.
assert.match(
  roadmap,
  /\|\s*Autonomous Intelligence\s*\|\s*10\s*\|\s*5\s*\|\s*1\s*\|\s*4\s*\|/,
  "Autonomous Intelligence row: Done 4→5, Pending 5→4"
);
assert.match(
  roadmap,
  /\|\s*\*\*Totals\*\*\s*\|\s*\*\*13\*\*\s*\|\s*\*\*6\*\*\s*\|\s*\*\*2\*\*\s*\|\s*\*\*5\*\*\s*\|/,
  "Totals row must recompute: Done 5→6, Pending 6→5"
);

// 7. PROC-003: shipped item's detailed entry pruned; sibling entry survives.
assert.ok(
  !/### AUTO-099 — Do the foo thing/.test(roadmap),
  "Shipped item's detailed ### entry must be pruned"
);
assert.match(
  roadmap,
  /### AUTO-100 — Do the bar thing/,
  "Sibling ### entry must survive the prune"
);

// 8. New transform: Current PR body now reflects the promoted slot's spec
//    text (heading-only rewrite was the prior failure mode that left
//    AUTO-099's prose under an AUTO-100 heading).
const currentPrBlock = next.match(/## ▶ Current PR — AUTO-100[\s\S]*?(?=\n## )/);
assert.ok(currentPrBlock, "Current PR section must exist");
assert.match(
  currentPrBlock[0],
  /\*\*Title:\*\*\s+Do the bar thing/,
  "Current PR title must come from the queue slot",
);
assert.match(
  currentPrBlock[0],
  /\*\*Branch:\*\*\s+`feat\/auto-100`/,
  "Branch slug must be derived from promoted id",
);
assert.match(
  currentPrBlock[0],
  /Bar thing happens\./,
  "Acceptance criteria from queue must appear in Current PR body",
);
assert.ok(
  !/Scope details here\./.test(currentPrBlock[0]),
  "Prior PR's scope text must be replaced (not left under the new heading)",
);
assert.match(
  currentPrBlock[0],
  /AUTO-099 ✅ shipped in PR #999/,
  "Hand-off breadcrumb must reference the shipped item + PR number",
);
assert.match(
  currentPrBlock[0],
  /### PR checklist \(AUTO-100\)/,
  "Fresh PR checklist must be rendered for the promoted item",
);

// 9. New transform: promoted slot is excised from the queue + survivors
//    renumbered. Slot 2 must shift to slot 1; queue header count drops.
const queueBlock = next.match(/## ⏭ Queue[\s\S]*?(?=\n## )/);
assert.ok(queueBlock, "Queue section must still exist");
assert.ok(
  !/### \d+ · AUTO-100 —/.test(queueBlock[0]),
  "Promoted slot must be removed from the queue",
);
assert.match(
  queueBlock[0],
  /### 1 · AUTO-101 —/,
  "Sibling must renumber from slot 2 to slot 1",
);
assert.match(
  queueBlock[0],
  /## ⏭ Queue \(next 1 PR after current\)/,
  "Queue header count must update from 4 → 1 (one slot survived after promotion)",
);

// 10. PROC-003: re-running the script is idempotent (no double-row in the
//     Completed Work Summary table, no further decrement of Summary stats).
execSync(`node scripts/promote-sprint-item.mjs 999 AUTO-100 --root="${sandbox}"`, { stdio: "pipe" });
const roadmap2 = fs.readFileSync(path.join(sandbox, "ROADMAP.md"), "utf8");
const auto099Rows = (roadmap2.match(/\|\s*AUTO-099\s*\|/g) || []).length;
assert.equal(auto099Rows, 1, "Re-running must not double-write the Completed Work Summary row");

// Single-promotion scenario complete — clean up its sandbox before the
// bundled-promotion scenario allocates its own. Keeping each scenario's
// sandbox isolated means a failure in the bundle path doesn't leave behind
// the single-promotion files (and vice versa) for forensic inspection.
fs.rmSync(sandbox, { recursive: true, force: true });

// ── Bundled-promotion scenario ─────────────────────────────────────────────
// Promote two queue slots into one bundled Current PR. Validates the new
// `+`-joined nextItemId path: bundled heading, per-scope sub-blocks, both
// slots removed from the queue, "Do not split this PR" callout rendered.
const sandbox2 = fs.mkdtempSync(path.join(os.tmpdir(), "promote-sprint-bundle-"));
const docs2 = path.join(sandbox2, "docs");
fs.mkdirSync(docs2, { recursive: true });

const BUNDLE_NEXT = `# NEXT.md

## ▶ Current PR — AUTO-099

**Title:** Prior shipped item
**Branch:** \`feat/auto-099\`

Old scope.

## ⏭ Queue (next 3 PRs after current)

### 1 · AUTO-200 — First scope of the bundle
**Effort:** L | **Priority:** 🟢 Differentiator | **Dependencies:** none

First scope's prose body. Acceptance: thing A happens.

### 2 · AUTO-201 — Second scope of the bundle
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** AUTO-200

Second scope's prose body. Acceptance: thing B happens.

### 3 · AUTO-202 — Untouched survivor
**Effort:** S | **Priority:** 🔵 Medium

Survivor body — must remain in queue, renumbered from slot 3 to slot 1.

## ✅ Recently completed

| ID | Title | PR |
|----|-------|----|
| OLD-X | Older work | #50 |
`;

const BUNDLE_ROADMAP = `# ROADMAP.md

> **Current sprint:** \`AUTO-099\` · **Blockers:** none

## Completed Work Summary

| ID | Title | PR / Commit |
|----|-------|-------------|
| OLD-X | An older shipped item | PR #50 |

---

## Phase 4 — Autonomous Intelligence

---

### AUTO-099 — Prior shipped item 🟢 Differentiator

Old scope text.

---

### AUTO-200 — First scope of the bundle 🟢 Differentiator

Detailed scope (will not be pruned — the script only prunes the SHIPPED item).

---

### AUTO-201 — Second scope of the bundle 🟢 Differentiator

Detailed scope (will not be pruned — same reason).

---

## Summary

| Category | Total | ✅ Done | 🔄 In Progress | 🔲 Pending | Remaining |
|----------|------:|--------:|---------------:|----------:|-----------|
| Autonomous Intelligence | 10 | 4 | 1 | 5 | AUTO-099 in-flight |
| **Totals** | **10** | **4** | **1** | **5** | |
`;

const BUNDLE_CHANGELOG = `# Changelog

## [Unreleased]

### Added
- Existing entry.

## [1.0.0] — 2026-01-01
- Old release.
`;

fs.writeFileSync(path.join(sandbox2, "NEXT.md"), BUNDLE_NEXT);
fs.writeFileSync(path.join(sandbox2, "ROADMAP.md"), BUNDLE_ROADMAP);
fs.writeFileSync(path.join(docs2, "changelog.md"), BUNDLE_CHANGELOG);

// Promote AUTO-200 + AUTO-201 as a bundle.
execSync(`node scripts/promote-sprint-item.mjs 1000 "AUTO-200 + AUTO-201" --root="${sandbox2}"`, {
  stdio: "pipe",
});

const nextBundle = fs.readFileSync(path.join(sandbox2, "NEXT.md"), "utf8");

// 1. Bundled heading rendered with `(bundled)` suffix.
assert.match(
  nextBundle,
  /^##\s+▶\s+Current PR\s+—\s+AUTO-200 \+ AUTO-201 \(bundled\)$/m,
  "Bundled promotion must render `(bundled)` suffix on the heading",
);

// 2. Title joins both scopes' titles.
assert.match(
  nextBundle,
  /\*\*Title:\*\*\s+First scope of the bundle \+ Second scope of the bundle/,
  "Bundled Title line must concatenate both queue slots' titles",
);

// 3. Branch slug derived from both ids.
assert.match(
  nextBundle,
  /\*\*Branch:\*\*\s+`feat\/auto-200-auto-201`/,
  "Bundled branch slug must concatenate both ids",
);

// 4. "Do not split" callout rendered.
assert.match(
  nextBundle,
  /\*\*Do not split this PR\.\*\*/,
  "Bundled promotion must include the do-not-split callout",
);

// 5. Per-scope sub-headings rendered for both ids.
assert.match(nextBundle, /### Scope 1 — AUTO-200 — First scope of the bundle/, "Scope 1 heading must render");
assert.match(nextBundle, /### Scope 2 — AUTO-201 — Second scope of the bundle/, "Scope 2 heading must render");

// 6. Both promoted slots removed from the queue.
const bundleQueueBlock = nextBundle.match(/## ⏭ Queue[\s\S]*?(?=\n## )/);
assert.ok(bundleQueueBlock, "Queue section must still exist after bundled promotion");
assert.ok(!/### \d+ · AUTO-200 —/.test(bundleQueueBlock[0]), "AUTO-200 slot must be removed from queue");
assert.ok(!/### \d+ · AUTO-201 —/.test(bundleQueueBlock[0]), "AUTO-201 slot must be removed from queue");

// 7. Surviving slot renumbered from 3 → 1; queue header count drops to 1.
assert.match(bundleQueueBlock[0], /### 1 · AUTO-202 —/, "Survivor must renumber from slot 3 to slot 1");
assert.match(
  bundleQueueBlock[0],
  /## ⏭ Queue \(next 1 PR after current\)/,
  "Queue header count must update to 1 (only survivor remains)",
);

// 8. Hand-off breadcrumb references both promoted ids.
assert.match(
  nextBundle,
  /AUTO-200 \+ AUTO-201 promoted as a bundle from queue slots 1, 2 per `NEXT\.md` rotation/,
  "Bundled hand-off breadcrumb must list both ids + both slot numbers",
);

// 9. PR checklist rendered with the joined id.
assert.match(
  nextBundle,
  /### PR checklist \(AUTO-200 \+ AUTO-201\)/,
  "Bundled PR checklist heading must use the joined id",
);

fs.rmSync(sandbox2, { recursive: true, force: true });

console.log("promote-sprint-item.test.mjs passed");
