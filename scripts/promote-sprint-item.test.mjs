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

### 2 · AUTO-100
Details.

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

// 8. PROC-003: re-running the script is idempotent (no double-row in the
//    Completed Work Summary table, no further decrement of Summary stats).
execSync(`node scripts/promote-sprint-item.mjs 999 AUTO-100 --root="${sandbox}"`, { stdio: "pipe" });
const roadmap2 = fs.readFileSync(path.join(sandbox, "ROADMAP.md"), "utf8");
const auto099Rows = (roadmap2.match(/\|\s*AUTO-099\s*\|/g) || []).length;
assert.equal(auto099Rows, 1, "Re-running must not double-write the Completed Work Summary row");

// Cleanup — only delete sandbox; real tracker files were never touched.
fs.rmSync(sandbox, { recursive: true, force: true });

console.log("promote-sprint-item.test.mjs passed");
