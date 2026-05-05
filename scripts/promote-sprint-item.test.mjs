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

## ▶ Current PR — FOO-001

**Title:** Do the foo thing
**Branch:** \`feat/foo-001\`

Scope details here.

## ⏭ Queue (next 4 PRs after current)

### 2 · BAR-002
Details.

## ✅ Recently completed

| ID | Title | PR |
|----|-------|----|
| OLD-A | Older shipped work | #10 |
| OLD-B | Even older work | #9 |
| OLD-C | Oldest work (will drop) | #8 |
`;

const ROADMAP_FIXTURE = `# ROADMAP.md

> **Current sprint:** \`FOO-001\` — Do the foo thing · **Blockers:** none

Everything else unchanged.
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

execSync(`node scripts/promote-sprint-item.mjs 999 BAR-002 --root="${sandbox}"`, {
  stdio: "pipe",
});

const next = fs.readFileSync(path.join(sandbox, "NEXT.md"), "utf8");
const roadmap = fs.readFileSync(path.join(sandbox, "ROADMAP.md"), "utf8");
const changelog = fs.readFileSync(path.join(docs, "changelog.md"), "utf8");

// 1. Current PR heading promoted.
assert.match(next, /^##\s+▶\s+Current PR\s+—\s+BAR-002$/m, "Current PR heading must be rewritten");
assert.ok(!/##\s+▶\s+Current PR\s+—\s+FOO-001/.test(next), "Old Current PR heading must be gone");

// 2. Shipped item prepended; table capped at 3; oldest dropped.
const tableMatch = next.match(/## ✅ Recently completed[\s\S]*/);
assert.ok(tableMatch, "Recently completed section must still exist");
const rows = tableMatch[0].split("\n").filter((l) => /^\|\s*[A-Z]/.test(l));
assert.equal(rows.length, 3, "Recently completed table must be capped at 3 rows");
assert.match(rows[0], /FOO-001.*#999/, "Shipped item must be top row");
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
assert.match(roadmap, /\*\*Current sprint:\*\*\s+`BAR-002`/, "ROADMAP current-sprint pointer must update");
assert.ok(!/\*\*Current sprint:\*\*\s+`FOO-001`/.test(roadmap), "Old sprint pointer must be gone");

// Cleanup — only delete sandbox; real tracker files were never touched.
fs.rmSync(sandbox, { recursive: true, force: true });

console.log("promote-sprint-item.test.mjs passed");
