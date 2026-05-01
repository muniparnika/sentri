# NEXT.md — Current Sprint Target

> **For agents:** Read this file only. Do not read ROADMAP.md unless you need context on items
> beyond the current PR. Everything you need to start work is here.
>
> **For humans:** Update this file when a PR ships. Move the completed item to ROADMAP.md ✅ table,
> promote the next item from the queue below, and rewrite the "Current PR" block.

---

## ▶ Current PR — AUTO-012

**Title:** SLA / quality gate enforcement
**Branch:** `feat/AUTO-012-quality-gates`
**Effort:** M | **Priority:** 🟡 High
**All dependencies:** none

### What to build

Per-project `qualityGates` config (min pass rate, max flaky %, max failures). On run completion, evaluate gates and include `{ passed, violations[] }` in both the trigger response and run result. GitHub Action exit code reflects gate status.

### Files to change

| File | Change |
|------|--------|
| `backend/src/routes/projects.js` | Quality gate CRUD endpoints |
| `backend/src/testRunner.js` | Evaluate gates on run completion |
| `backend/src/routes/trigger.js` | Include gate result in response |
| `frontend/src/pages/ProjectDetail.jsx` | Quality gate configuration panel |

### PR checklist

- [ ] Update `AUTO-012` status in `ROADMAP.md` to ✅ Complete with PR number
- [ ] Update this file: move AUTO-012 to "Recently completed", promote next item from Queue
- [ ] Add entry to `docs/changelog.md` under `## [Unreleased]`

---

## ⏭ Queue (next 3 PRs after current)

### 2 · DIF-015b Gap 2 — Recorder selectorGenerator: data-testid quality scoring
**Effort:** S | **Priority:** 🔵 Medium | **Dependencies:** none

Score data-testid candidates in the recorder's `selectorGenerator()` priority chain so generic / auto-generated ids (e.g. `data-testid="btn-1"`, hash-suffixed values) are demoted in favour of stable semantic ids. Highest-value next step toward flipping DIF-015b to ✅ Complete in `ROADMAP.md` once Gap 3 also ships. Heuristics + acceptance criteria documented in `ROADMAP.md § DIF-015b`.

**Files:** `backend/src/runner/recorder.js` (only)

### 3 · AUTO-017 — Performance budget testing (Web Vitals)
**Effort:** M | **Priority:** 🔵 Medium | **Dependencies:** none

Capture Web Vitals (LCP, CLS, INP, TTFB) per page during runs and compare against per-project budgets. Surface budget violations as a new run-result section and gate runs when budgets are exceeded.

**Files:** `backend/src/runner/pageCapture.js` · `backend/src/testRunner.js` · `frontend/src/components/run/StepResultsView.jsx`

### 4 · DIF-008 — Jira / Linear issue sync
**Effort:** L | **Priority:** 🟢 Differentiator | **Dependencies:** FEA-001 ✅

Auto-create a Jira or Linear ticket when a test run fails (with screenshot, error, Playwright trace attached). Sync pass/fail status back to the linked issue. Traceability data model already stores `linkedIssueKey` and `tags` per test — the outbound sync layer is the missing piece.

**Files:** `backend/src/utils/integrations.js` (new) · `backend/src/testRunner.js` · `backend/src/routes/settings.js` · `frontend/src/pages/Settings.jsx`

---

## 🔀 Parallel opportunities (small items, no queue conflicts)

These can be picked up by a second engineer alongside the current PR without file conflicts:

| ID | Title | Effort | Shared files? |
|----|-------|--------|---------------|
| **DIF-015b Gap 2** | **Recorder selectorGenerator: data-testid quality scoring** | **S** | **`backend/src/runner/recorder.js` only — no overlap with AUTO-012 (current PR) / AUTO-017 / DIF-008** |
| DIF-015b Gap 3 | Recorder selectorGenerator: iframe + shadow-DOM traversal | M | `backend/src/runner/recorder.js` only |
| AUTO-017 | Performance budget testing (Web Vitals) | M | None |
| AUTO-019 | Run diffing: per-test comparison across runs | M | None |

> **DIF-015b follow-up priority:** Gap 2 (data-testid scoring) is the highest-value next step — it's a small, contained edit to the priority chain in `selectorGenerator()` and unblocks DIF-015b flipping to ✅ Complete in ROADMAP.md once Gap 3 also ships. Both gaps are documented in `ROADMAP.md` § DIF-015b with concrete heuristics, files-to-change, and acceptance criteria. Pick Gap 2 next; defer Gap 3 to a separate PR (different effort tier).
>
> Why these aren't promoted to "Current PR" yet: AUTO-012 (quality gates) is the active sprint item with a higher priority label (🟡 High) than DIF-015b sub-items (🔵 Medium). The recorder gaps are tracked here so they don't get lost — pick them up alongside AUTO-012 if a second agent has bandwidth.

---

## ✅ Recently completed

| ID | Title | PR |
|----|-------|----|
| ENH-036 + ENH-036b | Project credential editing (`PATCH /projects/:id`) + auto-detect login form fields (semantic-first locator waterfall) | #1 |
| AUTO-016b | Frontend CrawlView a11y panel + dashboard offenders rollup | #1 |
| DIF-007 | Conversational test editor connected to /chat (in-app "Edit with AI" panel with diff preview + apply) | #123 |

*Full completed list → ROADMAP.md § Completed Work*