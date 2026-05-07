# NEXT.md — Current Sprint Target

> **For agents:** Read this file only. Do not read ROADMAP.md unless you need context on items
> beyond the current PR. Everything you need to start work is here.
>
> **For humans:** Update this file when a PR ships. Move the completed item to ROADMAP.md ✅ table,
> promote the next item from the queue below, and rewrite the "Current PR" block.

> **Bundling guidance — for agents writing code:** When working on the Current PR, if you
> spot adjacent items in the Queue (or in `ROADMAP.md`) that share files, infrastructure,
> or a natural review boundary with the in-flight scope, **flag them as bundling candidates
> in your PR description** rather than expanding the PR mid-flight. Good bundling signals:
> (1) the items touch the same module / shared abstraction, so reviewing them together
> reduces churn (e.g. CAP-004 + MET-001 share `<TrendChart>`); (2) one item validates
> another end-to-end (e.g. a CI guard validates the convention it documents);
> (3) both are S/XS effort and skipping a hand-off cycle saves more than it costs in
> review surface (e.g. AUTO-017.3 + PROC-001 in slot 2). **Bad** bundling signals: items
> in different phases, items that grow the PR past M effort, items that change the
> reviewer's mental model (UX rewrite + backend rewrite), or items the agent identifies
> *after* CI is already green on the original scope. When in doubt, surface the candidate
> bundle as a comment on the PR and let the human decide — never silently expand scope
> beyond the Current PR's `### PR checklist`. Recording the rejected candidates is also
> useful: it builds the dataset for future planning.

---

## ▶ Current PR — AUTO-002 + AUTO-015 (bundled)

**Title:** Change detection / diff-aware crawling + continuous test discovery on deployment events
**Branch:** `feat/auto-002-auto-015-diff-aware-crawl`
**Effort:** L (L + M) | **Priority:** 🟢 Differentiator
**All dependencies:** none — both scopes are net-new on top of the existing crawl pipeline; AUTO-015 consumes AUTO-002's `changedPages[]` signal, so they ship together.

> AUTO-003 + AUTO-003b ✅ shipped in PR #10 (confidence-based auto-approval with provenance, revoke, and audit-trail UI). This bundle is the next step in Phase 4 — AUTO-002 establishes the diff-aware baseline mechanism, AUTO-015 wires it to deployment webhooks so new pages get tests the moment they're deployed. Both are prerequisites for AUTO-001 (risk-based ordering) and AUTO-004 (git-diff impact analysis).

> **Bundling rationale (per the bundling-guidance note above):** AUTO-015 is listed in `ROADMAP.md:672-685` as directly dependent on AUTO-002 ("initiate a diff-aware crawl (AUTO-002) followed by test generation for changed pages only"). Shipping AUTO-002 without its deployment-webhook consumer would leave the `changedPages[]` signal unvalidated end-to-end — the consumer is the integration test. Both items touch `crawler.js` + `routes/trigger.js` + `routes/runs.js`, so reviewing them together avoids a second round of context-building on the same pipeline surface. Effort sits at L (L + M); AUTO-015 is mostly webhook-signature verification + preview-URL extraction (Vercel / Netlify), not net-new infrastructure.

**Do not split this PR.** Codex agents tend to ship the minimum viable slice; this prompt is the explicit instruction to ship both scopes together.

### Scope 1 — AUTO-002 — Change detection / diff-aware crawling

Sentri re-crawls the entire site on every run. An autonomous system should detect what changed since the last crawl (new pages, modified DOM, removed elements) and only regenerate tests for affected pages. `backend/src/pipeline/crawlBrowser.js` has no concept of a previous crawl baseline today — this is the difference between "run everything nightly" and "test only what changed," and it's a hard prerequisite for AUTO-004 (test impact analysis from git diff) and the smarter slice of AUTO-001 (risk-based ordering).

After each crawl, store a `crawl_baseline` snapshot per project (page URL → DOM fingerprint hash). On the next crawl, diff against the baseline to identify changed pages. Only run the generation pipeline for changed pages. Emit a `pages_changed` SSE event so the Test Lab live view can show "3 pages changed since last crawl → regenerating only those" instead of a generic progress bar.

**Files:** new `backend/src/pipeline/crawlDiff.js` (DOM fingerprint diff engine — reuse the existing `stateFingerprint.js` hashing, don't invent a new scheme) · `backend/src/pipeline/crawlBrowser.js` (baseline comparison + early-skip for unchanged pages) · `backend/src/database/migrations/` (new `crawl_baselines` table keyed on `(projectId, pageUrl)`) · new `backend/src/database/repositories/crawlBaselineRepo.js` (no raw SQL in the pipeline module per AGENT.md) · `backend/src/routes/runs.js` (expose `changedPages[]` on the run response + SSE event) · `backend/tests/crawl-diff.test.js` (first-crawl baseline creation, unchanged-page skip, changed-page regen, added/removed-page handling, empty-baseline fallback)

**Acceptance criteria:**
- First crawl of a new project behaves identically to today (no baseline to diff against → full crawl + generate).
- Second crawl with no changes emits zero generation calls and completes as `completed_empty` with a `changedPages: []` annotation — no regressed tests, no wasted LLM quota.
- Second crawl with a modified page regenerates tests only for that URL; untouched pages' approved tests survive unchanged.
- Pages removed from the site are surfaced in the run response so reviewers can decide whether to soft-delete their tests.

### Scope 2 — AUTO-015 — Continuous test discovery on deployment events

> **Why this scope ships in the same PR as AUTO-002:** AUTO-002 establishes the `changedPages[]` signal. AUTO-015 is the signal's first real consumer — when a Vercel / Netlify deployment webhook fires, the trigger endpoint should initiate a diff-aware crawl against the preview URL and generate tests only for newly-added pages. Without AUTO-015 in the same PR, AUTO-002's SSE event and API surface are validated only by unit tests; shipping them together exercises the full "deploy → detect → generate → review" loop end-to-end.

Crawling is manually triggered today. An autonomous system should watch for deployment events (via webhook) and automatically re-crawl changed pages, generate new tests for new features, and flag removed pages — without any human action.

Extend the CI/CD trigger endpoint to accept a `triggerCrawl: true` flag alongside `changedFiles[]`. When set, initiate a diff-aware crawl (AUTO-002) followed by test generation for changed pages only. Support Vercel (`X-Vercel-Signature`) and Netlify (`X-Netlify-Token`) deployment-event webhook payloads natively so users don't hand-roll signature verification.

**Files:** `backend/src/routes/trigger.js` (add `triggerCrawl` parameter and `deployment.succeeded` event handlers — extract preview URL from the provider payload and use it as the crawl's base URL override) · `backend/src/crawler.js` (accept target URLs from the AUTO-002 diff so discovery is scoped to the deployment's changed pages, not the full site) · `backend/src/utils/webhookSignature.js` (new — shared HMAC / HMAC-SHA256 signature verification for Vercel + Netlify; reuse the pattern established by the existing GitHub trigger-token verifier, not a new signing scheme) · `frontend/src/components/automation/IntegrationSnippets.jsx` (add Vercel + Netlify deployment-webhook snippets alongside the existing GitHub Actions + GitLab CI examples; document the `[no-ui]`-opt-out is irrelevant here because the consumer surface IS a UI card) · `backend/.env.example` (document `VERCEL_WEBHOOK_SECRET`, `NETLIFY_WEBHOOK_SECRET`) · `backend/tests/deployment-triggers.test.js` (signature-verification happy path + tamper rejection for both providers; `triggerCrawl` end-to-end test that seeds a project baseline, POSTs a fake Vercel payload, and asserts only the changed pages are in the run's `changedPages[]`)

**Acceptance criteria:**
- Vercel deployment webhook with a valid signature + `deployment.succeeded` state triggers a diff-aware crawl against the preview URL; the resulting run carries `changedPages[]` scoped to that deployment.
- Netlify webhook with a valid `X-Netlify-Token` does the same against the Netlify preview URL.
- Tampered signatures (wrong secret, body modified) return 401 before any crawl work starts — no signal exposure on invalid inputs.
- When `triggerCrawl: false` (or absent), the existing CI/CD trigger behaviour is unchanged — no regression for projects using the token-based trigger.
- "Last deployment run" badge appears on the project header when a deployment-triggered run completed in the last 24h (reuses the existing `<GateBadge>` positioning).

<!-- ── Original AUTO-003 / AUTO-003b spec body removed on promotion (PR #10 shipped both scopes); see ROADMAP.md § Completed Work Summary. ──

> **Why this scope ships in the same PR as AUTO-003:** AUTO-003 ships the *mechanism* (auto-approve above threshold). This scope ships the *trust contract* — provenance, revoke, and audit surfaces. Splitting them risks the agent stopping at "auto-approval works" and skipping the UX that makes it safe to ship. Without this scope, the first bad auto-approval collapses trust in the whole system.

Every approved test must answer three questions at a glance: **who** approved it (human vs `auto-approver`), **why** (reviewer judgment vs score X above threshold Y), and **can I revoke it** (one-click back to draft). All three must be scannable at table density — never hover-only.

**Core principle — the single non-negotiable affordance:** a **Revoke to draft** button on every auto-approved test. Auto-approval is only trustworthy if it is reversible in one click. Every other element (badges, trays, timelines, calibration metrics) is decoration around that one affordance.

#### Data model (combine into the AUTO-003 migration if AUTO-003 hasn't landed yet; otherwise new migration)

```sql
ALTER TABLE tests ADD COLUMN approvalSource TEXT;     -- 'human' | 'auto' | null
ALTER TABLE tests ADD COLUMN approvalThreshold REAL;  -- threshold value at decision time
ALTER TABLE tests ADD COLUMN approvedAt INTEGER;      -- epoch ms
ALTER TABLE tests ADD COLUMN approvedBy TEXT;         -- userId or 'auto-approver'
```

**Critical:** persist `approvalThreshold` *at decision time*, not just a flag. If the threshold is later raised, the audit can flag historical approvals that would no longer pass.

#### Backend

- Migration adding the four provenance columns above.
- `backend/src/pipeline/testPersistence.js` — populate provenance on the auto-approval path; write one `activities` row per auto-approval (`userName: "auto-approver"`, `meta: { score, threshold }`). No batching, no exceptions.
- New `GET /api/v1/projects/:id/approval-stats` — returns counts (human / auto / draft) + 7-day revert rate for the project-settings calibration line.
- New `POST /api/v1/tests/:id/revoke` — moves an approved test (auto or human) back to `draft`, writes an activity row, clears `approvedAt` / `approvedBy`. Register both routes in `backend/src/middleware/permissions.json`.

#### Frontend

- **`Tests.jsx`** — replace single "Approved" badge with a two-tone badge column: 🤖 `Auto · 0.91` (purple) vs 👤 `Human · alice` (green) vs 📝 `Draft · 0.62` (amber). Add ⚠ overlay on auto-approved rows whose first run failed (the calibration safety-net). Add filter pill row: `All | Human-approved | Auto-approved | Draft`. **Do not** merge auto + human under one green badge.
- **`Tests.jsx` "Auto-approved" filter** — default sort: lowest confidence first; required column: first-run pass rate; bulk action: "Send back to draft for review".
- **`ReviewQueue.jsx`** — render a "Last 24h auto-approvals" tray above the draft list when auto-approval is enabled. One-line strip with score chips so reviewers can spot-audit yesterday's auto-batch in 30 seconds.
- **Test header (likely `RunDetail.jsx` or `TestDetail.jsx`)** — full provenance line + **Revoke to draft** button. Auto: `🤖 Auto-approved · score 0.91 · threshold 0.85 · 2h ago · [Revoke to draft]`. Human: `👤 Approved by @alice · 1d ago · [Revoke to draft]`.
- **`ProjectDetail.jsx`** — header aggregate: `24 tests · 18 human · 6 auto · 0 drafts`. Do **not** clutter per-run rows.
- **`Sidebar.jsx`** — second badge alongside draft count: `[3 drafts] [🤖 12 auto today]`. Hiding auto activity from the sidebar makes the system feel idle when it's working.
- **Project Settings (`ProjectQualityCard` or wherever `autoApproveThreshold` lives post-PR #6)** — show inline calibration line under the threshold input: `Last 7 days: 42 auto-approved, 3 reverted by humans (7%).` Heuristic: <5% → threshold may be too high; 5–10% → healthy; >10% → tighten. First-time enablement guard: one-time modal showing "last 30 generated tests would have been auto-approved at this threshold — sample these before enabling."
- **Approvals timeline (per project)** — daily groups: `🤖 12 auto-approved (avg score 0.89)` / `👤 @alice approved 3, rejected 1`. Click a batch → expanded list with per-test score, threshold-at-time, and per-test revoke action. Compliance bar: "who approved this test?" must be one click away six months later.

**Files:** new migration `0NN_test_approval_provenance.sql` · `backend/src/pipeline/testPersistence.js` · new `backend/src/routes/approvalStats.js` (or extend `routes/projects.js`) · `backend/src/routes/tests.js` (revoke endpoint) · `backend/src/middleware/permissions.json` · `frontend/src/api.js` (`getApprovalStats`, `revokeApproval`) · `frontend/src/pages/Tests.jsx` · `frontend/src/pages/ReviewQueue.jsx` · `frontend/src/pages/ProjectDetail.jsx` · `frontend/src/components/layout/Sidebar.jsx` · `frontend/src/pages/RunDetail.jsx` (or `TestDetail.jsx`) · `frontend/src/components/automation/ProjectQualityCard.jsx` (calibration line + first-time-enable modal) · new `frontend/src/pages/ApprovalsTimeline.jsx` · `backend/tests/auto-approval.test.js` (extend) · `frontend/tests/approval-provenance.test.jsx`

**Acceptance criteria:**
- Every auto-approval writes an `activities` row with `userName: "auto-approver"`, score, and threshold-at-time.
- The four provenance columns are populated on every approval (auto and human); `approvalThreshold` reflects the value *at decision time*, not the current project setting.
- `Tests.jsx` visually distinguishes 🤖 Auto / 👤 Human / 📝 Draft in the table without hover.
- Auto-approved tests with a failed first run surface a ⚠ icon in `Tests.jsx` and the auto-approved filter view.
- `POST /tests/:id/revoke` returns the test to `draft` for both auto- and human-approved tests, and writes an activity row.
- Sidebar shows `🤖 N auto today` alongside the draft count when N > 0.
- First-time threshold enablement shows the "would-have-been-approved" preview modal before persisting the setting.

**Anti-patterns to reject in review:** merging auto + human under one "Approved" badge · provenance only on hover · silent first-enable with no preview · skipping the activity row · shipping without the Revoke button · hiding the auto-count from the sidebar.


### PR checklist

- [ ] **Both scopes shipped in one PR — do not split**
- [ ] AUTO-003: `tests.confidenceScore` column populated from the existing `deduplicator.js` quality score; new `projects.autoApproveThreshold` column (nullable, default `null`)
- [ ] AUTO-003: With `autoApproveThreshold: null` (default), all tests are still persisted as `draft` — zero behaviour change for existing projects
- [ ] AUTO-003: Tests above the threshold are persisted as `approved`, and an `activities` row is written with `userName: "auto-approver"`
- [ ] AUTO-003: `Tests.jsx` exposes an "Auto-approved" filter pill so reviewers can audit the bypass path
- [ ] AUTO-003b: Migration adds `approvalSource` / `approvalThreshold` / `approvedAt` / `approvedBy` columns to `tests`; `approvalThreshold` is captured *at decision time*, not the current project setting
- [ ] AUTO-003b: `Tests.jsx` table visually distinguishes 🤖 Auto / 👤 Human / 📝 Draft without hover (two-tone badge column)
- [ ] AUTO-003b: Test header surfaces full provenance line + **Revoke to draft** button on every approved test (auto and human)
- [ ] AUTO-003b: New `POST /api/v1/tests/:id/revoke` and `GET /api/v1/projects/:id/approval-stats` routes registered in `backend/src/middleware/permissions.json`
- [ ] AUTO-003b: Sidebar shows `🤖 N auto today` alongside the draft count when N > 0
- [ ] AUTO-003b: First-time threshold enablement shows the "would-have-been-approved" preview modal before persisting
- [ ] Add entry to `docs/changelog.md` under `## [Unreleased]` (one entry per scope, grouped under appropriate Keep-a-Changelog sections)
- [ ] Frontend consumer ships in the same PR for every new backend route (PROC-001 no-orphan-routes guard)

End AUTO-003 / AUTO-003b archived spec ── -->

### PR checklist (AUTO-002 + AUTO-015)

- [ ] **Both scopes shipped in one PR — do not split**
- [ ] AUTO-002: Migration `0NN_crawl_baselines.sql` adds `crawl_baselines (projectId, pageUrl, fingerprint, capturedAt)` keyed on `(projectId, pageUrl)`
- [ ] AUTO-002: New `backend/src/pipeline/crawlDiff.js` reuses `stateFingerprint.js` hashing — no new fingerprint scheme
- [ ] AUTO-002: First crawl of a new project: zero baseline rows, full crawl + generate (zero behaviour change)
- [ ] AUTO-002: Second crawl with no changes: zero generation calls, `changedPages: []`, status `completed_empty`
- [ ] AUTO-002: Second crawl with a modified page: only that URL is regenerated; approved tests on untouched pages survive
- [ ] AUTO-002: Removed pages are surfaced in the run response so reviewers can soft-delete tests intentionally
- [ ] AUTO-002: `pages_changed` SSE event wired into the Test Lab live view (replaces the generic progress bar)
- [ ] AUTO-002: `backend/tests/crawl-diff.test.js` covers first-crawl, unchanged-skip, changed-regen, added/removed pages, empty-baseline fallback
- [ ] AUTO-015: `POST /api/v1/projects/:id/trigger` accepts `triggerCrawl: true` and optional `previewUrl`; when set, initiates an AUTO-002 diff-aware crawl before generation
- [ ] AUTO-015: Vercel webhook handler verifies `X-Vercel-Signature` (HMAC-SHA1 over the raw body with `VERCEL_WEBHOOK_SECRET`) and extracts the preview URL from `deployment.url`
- [ ] AUTO-015: Netlify webhook handler verifies `X-Netlify-Token` (HMAC-SHA256 with `NETLIFY_WEBHOOK_SECRET`) and extracts the preview URL from `deploy_ssl_url` / `deploy_url`
- [ ] AUTO-015: Tampered / missing signatures return `401` **before** any crawl or generation work starts — no timing side-channel on invalid inputs
- [ ] AUTO-015: With `triggerCrawl: false` (or absent), the existing CI/CD trigger flow is byte-identical to today — no regression for token-based triggers
- [ ] AUTO-015: `backend/tests/deployment-triggers.test.js` covers signature happy-path, tamper rejection (both providers), and an end-to-end `triggerCrawl` test that asserts `changedPages[]` scopes to the deployment
- [ ] AUTO-015: Integration Snippets UI card ships with copy-pasteable Vercel + Netlify webhook payloads alongside the existing GitHub / GitLab examples
- [ ] AUTO-015: `backend/.env.example` documents `VERCEL_WEBHOOK_SECRET` + `NETLIFY_WEBHOOK_SECRET` (off by default — setting them opts the project into webhook triggers)
- [ ] Add entry to `docs/changelog.md` under `## [Unreleased]` (one entry per scope, grouped under appropriate Keep-a-Changelog sections)
- [ ] Frontend consumer ships in the same PR for every new backend route (PROC-001 no-orphan-routes guard)

---

## ⏭ Queue (next 3 PRs after current)

### 1 · AI-001 — Generic OpenAI-compatible provider adapter (BYO endpoint)
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** none | **Source:** Operator feedback — "support DeepSeek / Groq / Together / Fireworks / OpenRouter / Mistral / Azure OpenAI / xAI Grok / vLLM / LM Studio / LocalAI without hard-coding an SDK per vendor"

Adding each new AI vendor today requires (1) a new SDK in `backend/package.json`, (2) a new branch in `callProvider()` at `backend/src/aiProvider.js:813`, and (3) wiring through `CLOUD_KEY_MAP` / `CLOUD_DEFAULT_MODELS` / `PROVIDER_DOCS`. This blocks every "support DeepSeek" / "support Groq" / "support OpenRouter" request behind a code change. The industry has converged on the **OpenAI Chat Completions wire format** — DeepSeek, Groq, Together, Fireworks, OpenRouter, Mistral, xAI, Azure OpenAI, vLLM, LM Studio, and LocalAI all expose `/v1/chat/completions` with the OpenAI request/response schema. Reuse the existing `openai` SDK with `new OpenAI({ apiKey, baseURL })` (the SDK's own supported pattern) and we get every one of them with **zero new dependencies**.

**Why reuse the SDK and not hand-roll `fetch()`:** the `openai` package is already a runtime dep, so removing it saves nothing; it correctly handles streaming, retry-after parsing, error-class normalisation, and `response_format` quirks that would be ~600 LOC of edge cases to re-implement in raw `fetch()`. The pragmatic position: keep the SDK, drop the hardcoded vendor list. **Anthropic and Google branches stay** — those use proprietary wire formats (Anthropic `messages`, Google `generateContent`) so SDK reuse only applies to the Chat Completions family.

**Implementation sketch:**
- Add an `"openai_compatible"` provider type that accepts user-supplied `{ baseUrl, apiKey, model, displayName }` triples; one adapter handles all of them through `new OpenAI({ apiKey, baseURL: <user URL> })` — same retry/circuit-breaker/fallback path as the existing `"openai"` branch.
- Users add as many compat slots as they want via Settings (each gets a slot id like `compat:deepseek`, `compat:groq`, …). The existing `apiKeyRepo.set("local", { baseUrl, model })` precedent at `aiProvider.js:155` shows the JSON-value-per-slot shape already works.
- **Critical SSRF boundary:** user-supplied `baseUrl` flows server-side and must be SSRF-validated via `validateUrl()` from `backend/src/utils/ssrfGuard.js` (matches the `notifications` route pattern at `projects.js:464-471`). Reject loopback/private addresses unless an explicit allowlist override is set — this is a real attack surface.

**Files:** `backend/src/aiProvider.js` (new `"openai_compatible"` branch in `callProvider()`; extend `CLOUD_KEY_MAP` / `CLOUD_DEFAULT_MODELS` / `detectProvider()` to handle dynamic compat slots; extend `setRuntimeKey()` to accept `{ baseUrl, model }`) · `backend/src/database/repositories/apiKeyRepo.js` (list/get/set/delete compat slots — JSON `value` column already accepts the shape per the Ollama precedent) · `backend/src/routes/settings.js` (extend the provider validator to recognise `provider: "compat:<id>"` and SSRF-validate `baseUrl` at config time) · `frontend/src/pages/Settings.jsx` ("Add OpenAI-compatible provider" form + list/delete UI) · `frontend/src/components/header/ProviderDropdown.jsx` (or wherever the active-provider switcher lives — show compat slots alongside the four built-ins) · new `backend/tests/openai-compat-provider.test.js` (mock the `openai` SDK to assert (1) `baseURL` flows through, (2) auth-error / rate-limit / 5xx classification works, (3) circuit breaker tracks each compat slot independently, (4) SSRF-blocked baseUrls are rejected at config time) · `docs/changelog.md` (`### Added` entry under `## [Unreleased]`)

**Acceptance criteria:**
- Configuring a DeepSeek key + `https://api.deepseek.com/v1` baseUrl in Settings produces a working provider with zero code changes.
- Same path works for Groq (`https://api.groq.com/openai/v1`), Together, OpenRouter, Mistral (`https://api.mistral.ai/v1`), Azure OpenAI (`https://<resource>.openai.azure.com/openai/deployments/<deployment>`), xAI Grok (`https://api.x.ai/v1`), and self-hosted vLLM / LM Studio / LocalAI on `http://localhost:8000/v1` (when SSRF override is enabled).
- Existing Anthropic / Google / OpenAI / Ollama paths are **unchanged** — no regression to the four built-ins, no migration required for existing deployments.
- Compat providers participate in the existing FEA-003 fallback chain and circuit breaker per-slot (one bad endpoint shouldn't drag down others).
- SSRF guard rejects compat baseUrls pointing at private/loopback addresses unless an explicit allowlist override is set.

**Anti-patterns to reject in review:** adding a new SDK per vendor (defeats the point) · hand-rolling raw `fetch()` (loses streaming + retry semantics for nothing) · skipping SSRF validation on user-supplied baseUrl (Sentri runs server-side, this is a real security boundary) · letting compat slots bypass the FEA-003 circuit breaker (one bad endpoint shouldn't be exempt from rate-limit accounting) · merging compat into the existing `"openai"` branch instead of a separate type (makes "is this our OpenAI key or a compat slot" indistinguishable in logs/metrics).

### 2 · AUTO-001 — Risk-based test selection / ordering
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** AUTO-002 (item 1) provides the changed-pages signal that makes risk scoring meaningful | **Source:** `ROADMAP.md` Phase 4 (AUTO-001)

Sentri runs every approved test on every trigger. An autonomous system should *order* tests by risk so the most likely-to-fail tests run first (fail-fast feedback) and budget-bounded runs cover the highest-signal slice. Risk inputs already present in the database: per-test historical pass rate (`runs.results[]`), recency of last edit (`tests.updatedAt`), self-heal frequency (CAP-004 telemetry), and — once AUTO-002 lands — whether the test's page changed since the last crawl. Compute a `riskScore` per test at run-planning time, sort the run queue by descending risk, and expose a `--budget=<minutes>` flag that truncates the queue when wall-clock exceeds budget (always-run smoke tests are pinned to the front regardless of score).

**Files:** new `backend/src/pipeline/riskScorer.js` (pure function: test record + history → score) · `backend/src/testRunner.js` (sort `runQueue` by risk before dispatch; honour `--budget`) · `backend/src/routes/trigger.js` + `backend/src/routes/runs.js` (accept `budgetMinutes` param) · `frontend/src/pages/Runs.jsx` (per-test `riskScore` chip in the run-detail table) · `backend/tests/risk-scorer.test.js` (flaky-test ranking, recently-edited boost, smoke-test pin, budget truncation)

**Acceptance criteria:**
- Tests with a recent failure rank higher than tests that have been green for weeks.
- `budgetMinutes=10` truncates the queue at the 10-minute mark; pinned smoke tests still run even when truncated.
- Default behaviour with no budget is identical to today (full queue, just reordered) — zero regression for existing schedules.

### 3 · INT-002 — GitHub PR check comments
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** none (uses existing GitHub App connection from CAP-003 / FEA secrets path) | **Source:** `ROADMAP.md` Phase 3 (INT-002)

When a Sentri run triggered by a GitHub webhook completes, post a check-run comment on the PR summarising pass/fail counts, regressed tests (with diff vs the previous run on `main`), and Web Vitals budget violations. Today the run results live only in the Sentri UI — operators have to context-switch to see them. A native PR check makes Sentri feel like a first-class CI gate and unlocks the "block merge until tests pass" workflow that matters for AUTO-003 trust.

**Files:** new `backend/src/integrations/githubChecks.js` (Checks API client — create / update / conclude) · `backend/src/routes/webhooks.js` (subscribe `pull_request` + `push` events; map to a Sentri run) · `backend/src/testRunner.js` (post check-run on completion, including regressed-test diff vs the base SHA's last green run) · `backend/src/middleware/permissions.json` · `frontend/src/pages/Settings.jsx` (per-project "Post PR checks" toggle) · `backend/tests/github-checks.test.js` (mock Octokit; assert payload shape, regression-diff logic, failure-mode posting)

**Acceptance criteria:**
- Opening / pushing to a PR on a Sentri-connected repo creates a `pending` check-run, then transitions to `success` / `failure` / `neutral` on completion.
- Failure summary includes regressed tests (failing now, green on the base SHA's last run) — not the full failing list, which would be noisy on red branches.
- Web Vitals budget violations appear as a separate bullet so they don't get lost in the test-failure list.
- The integration is opt-in per project; existing projects see no behaviour change until the toggle is flipped.

---

## ✅ Recently completed

| ID | Title | PR |
|----|-------|----|
| AUTO-003 + AUTO-003b (bundled) | Confidence scoring & auto-approval of low-risk tests + provenance / audit trail | #10 |
| AUTO-017.3 + PROC-001 | Web Vitals trend charts on `ProjectQualityCard` (LCP / CLS / INP / TTFB) backed by per-run averages from `recordMetric()` in `backend/src/testRunner.js` via new `GET /api/v1/projects/:id/metrics` route + `useProjectMetricQuery` hook (fail-soft — transient API errors render an empty trend, not a banner); threshold lines sourced from `project.webVitalsBudgets`. **PROC-001:** new `.github/workflows/no-orphan-routes.yml` fails PRs that add a `router.<method>(…)` in `backend/src/routes/*.js` without touching `frontend/src/api.js` / pages / components; `[no-ui]` PR-title opt-out for genuinely UI-less endpoints. Convention documented in `REVIEW.md`, `AGENT.md`, `CONTRIBUTING.md`, and the PR template. New `backend/tests/web-vitals-trend.test.js` locks down that the recorded sample is the per-run average (not the budget); `backend/tests/quality-gates.test.js` extended with HTTP-level coverage for the new metrics route (400 / 404 / 200 + `limit` clamp). PROC-003 (sprint-promotion auto-prune) was reverted in PR #10 — the regex transforms had too many edge cases and the canonical hand-off is the manual checklist in `REVIEW.md § Sprint Tracker Hand-off`. | #9 |
| CAP-003 | Secret scanner gate on AI-generated Playwright tests. New `backend/src/pipeline/secretScanner.js` runs a `gitleaks`-style scan inside the validate stage (`backend/src/pipeline/testValidator.js`); built-in detectors (AWS access key IDs, JWTs, `Bearer` tokens) plus best-effort `.github/.gitleaks.toml` reuse. Matched tests are rejected, annotated with a redacted finding list (first/last 4 chars only — never plaintext), and the run is flagged via `run.secretScanBlocked = true` in `pipelineOrchestrator.js` so CI consumers can fail the build on regression. Positive + negative fixtures (AWS keys / JWTs / `Bearer` tokens / clean code) in `backend/tests/secret-scanner.test.js`, registered in `backend/tests/run-tests.js`. | #12 |

*Full completed list → ROADMAP.md § Completed Work*
