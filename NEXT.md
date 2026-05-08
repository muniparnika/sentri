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

## ▶ Current PR — AI-001 — Generic OpenAI-compatible provider adapter (BYO endpoint)

**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** none | **Source:** Operator feedback — "support DeepSeek / Groq / Together / Fireworks / OpenRouter / Mistral / Azure OpenAI / xAI Grok / vLLM / LM Studio / LocalAI without hard-coding an SDK per vendor"

> AUTO-002 + AUTO-015 ✅ shipped in PR #12 (diff-aware crawling primitive, Vercel/Netlify deployment webhooks with HMAC verification, shared `runDiffAwareBaseline` helper covering link-crawl AND state-explorer modes via composite-key baselines, `crawl.start.deployment` activity marker + "Last deployment run" badge on project header, `pages_changed` SSE wired into Test Lab live view, migration 019 + 020, full test coverage including end-to-end webhook happy-path). AI-001 is unblocked by none of AUTO-002 / AUTO-015 / AUTO-003 and can ship standalone; promoting it here per operator feedback pressure ahead of AUTO-001 which depends on AUTO-002's now-available `changedPages[]` signal.

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

### PR checklist (AI-001)

- [ ] New `"openai_compatible"` provider type in `aiProvider.js`; existing Anthropic / Google / OpenAI / Ollama branches untouched
- [ ] User-supplied `baseUrl` flows through `validateUrl()` SSRF guard before any request fires (private/loopback rejected unless `ALLOW_PRIVATE_URLS` set)
- [ ] DeepSeek / Groq / Mistral / xAI / Azure configured via Settings produce working providers with zero code changes (mock SDK test covers the four shapes)
- [ ] Compat providers participate in the FEA-003 fallback chain with per-slot circuit breaker accounting
- [ ] `backend/tests/openai-compat-provider.test.js` registered in `backend/tests/run-tests.js`
- [ ] Add entry to `docs/changelog.md` under `## [Unreleased]`
- [ ] Frontend consumer ships in the same PR for every new backend route (PROC-001 no-orphan-routes guard)

---

## ⏭ Queue (next 3 PRs after current)

### 1 · AUTO-001 — Risk-based test selection / ordering
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** AUTO-002 (shipped in PR #12) provides the changed-pages signal that makes risk scoring meaningful | **Source:** `ROADMAP.md` Phase 4 (AUTO-001)

Sentri runs every approved test on every trigger. An autonomous system should *order* tests by risk so the most likely-to-fail tests run first (fail-fast feedback) and budget-bounded runs cover the highest-signal slice. Risk inputs already present in the database: per-test historical pass rate (`runs.results[]`), recency of last edit (`tests.updatedAt`), self-heal frequency (CAP-004 telemetry), and — once AUTO-002 lands — whether the test's page changed since the last crawl. Compute a `riskScore` per test at run-planning time, sort the run queue by descending risk, and expose a `--budget=<minutes>` flag that truncates the queue when wall-clock exceeds budget (always-run smoke tests are pinned to the front regardless of score).

**Files:** new `backend/src/pipeline/riskScorer.js` (pure function: test record + history → score) · `backend/src/testRunner.js` (sort `runQueue` by risk before dispatch; honour `--budget`) · `backend/src/routes/trigger.js` + `backend/src/routes/runs.js` (accept `budgetMinutes` param) · `frontend/src/pages/Runs.jsx` (per-test `riskScore` chip in the run-detail table) · `backend/tests/risk-scorer.test.js` (flaky-test ranking, recently-edited boost, smoke-test pin, budget truncation)

**Acceptance criteria:**
- Tests with a recent failure rank higher than tests that have been green for weeks.
- `budgetMinutes=10` truncates the queue at the 10-minute mark; pinned smoke tests still run even when truncated.
- Default behaviour with no budget is identical to today (full queue, just reordered) — zero regression for existing schedules.

### 2 · INT-002 — GitHub PR check comments
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** none (uses existing GitHub App connection from CAP-003 / FEA secrets path) | **Source:** `ROADMAP.md` Phase 3 (INT-002)

When a Sentri run triggered by a GitHub webhook completes, post a check-run comment on the PR summarising pass/fail counts, regressed tests (with diff vs the previous run on `main`), and Web Vitals budget violations. Today the run results live only in the Sentri UI — operators have to context-switch to see them. A native PR check makes Sentri feel like a first-class CI gate and unlocks the "block merge until tests pass" workflow that matters for AUTO-003 trust.

**Files:** new `backend/src/integrations/githubChecks.js` (Checks API client — create / update / conclude) · `backend/src/routes/webhooks.js` (subscribe `pull_request` + `push` events; map to a Sentri run) · `backend/src/testRunner.js` (post check-run on completion, including regressed-test diff vs the base SHA's last green run) · `backend/src/middleware/permissions.json` · `frontend/src/pages/Settings.jsx` (per-project "Post PR checks" toggle) · `backend/tests/github-checks.test.js` (mock Octokit; assert payload shape, regression-diff logic, failure-mode posting)

**Acceptance criteria:**
- Opening / pushing to a PR on a Sentri-connected repo creates a `pending` check-run, then transitions to `success` / `failure` / `neutral` on completion.
- Failure summary includes regressed tests (failing now, green on the base SHA's last run) — not the full failing list, which would be noisy on red branches.
- Web Vitals budget violations appear as a separate bullet so they don't get lost in the test-failure list.
- The integration is opt-in per project; existing projects see no behaviour change until the toggle is flipped.

### 3 · AUTO-004 — Test impact analysis from git diff
**Effort:** M | **Priority:** 🟢 Differentiator | **Dependencies:** AUTO-002 (shipped in PR #12) — consumes the `changedPages[]` signal and extends it to file-level mapping | **Source:** `ROADMAP.md` Phase 4 (AUTO-004)

Today Sentri runs every approved test on every CI trigger. With AUTO-002's baseline mechanism in place, the next step is mapping file-level git-diffs to affected tests: when a PR touches `src/checkout/CartPage.tsx`, only the tests whose crawl snapshots include elements from that component should run. This is the "smart subset" that makes Sentri viable on large suites where running the full regression on every push is prohibitive. The mapping is built by cross-referencing each test's `sourceUrl` + captured elements against the file paths extracted from the git diff (via GitHub's PR files API, already available on the webhook path), then unioning the file→URL mapping with AUTO-002's `changedPages[]` signal.

**Files:** new `backend/src/pipeline/impactAnalysis.js` (git-diff → affected-test mapper, pure function: `{ changedFiles: string[], testsWithSnapshots: Test[] } → Test[]`) · `backend/src/routes/trigger.js` (accept `changedFiles[]` in the webhook payload, pass through to impact analysis, scope the run queue) · `backend/src/testRunner.js` (honour the scoped queue) · `frontend/src/pages/RunDetail.jsx` (new "Impact scope" panel showing which files drove the test selection) · `backend/tests/impact-analysis.test.js` (file→URL mapping correctness, empty-diff fallback, unknown-file graceful degradation)

**Acceptance criteria:**
- `changedFiles: ["src/checkout/CartPage.tsx"]` in the webhook payload scopes the run to tests whose snapshots touched `/checkout/*` URLs.
- Empty `changedFiles` (or absent) falls back to current behaviour (full suite) — zero regression.
- Unknown file paths (schema migrations, docs, config) produce an empty subset → run is marked `skipped_no_impact` rather than running the full suite.
- The mapping merges with AUTO-002's `changedPages[]` — a page that's both DOM-changed AND file-affected is the strongest signal.

---

## ✅ Recently completed

| ID | Title | PR |
|----|-------|----|
| AUTO-002 + AUTO-015 (bundled) | Change detection / diff-aware crawling (`crawl_baselines` table + `crawlBaselineRepo` with `mergeProjectBaselines` partial-crawl-safe upserts + `crawlDiff` primitive reusing `stateFingerprint.js`) + continuous test discovery on deployment events (Vercel `X-Vercel-Signature` HMAC-SHA1 + Netlify `X-Netlify-Token` HMAC-SHA256 webhooks, dual-auth via `requireTrigger` + signature, SSRF-guarded preview URL, `triggerCrawl: true` on POST /trigger). Shared `runDiffAwareBaseline(project, run, snapshots, mode)` helper handles **both** link-crawl and state-explorer modes — state mode uses composite keys (`url#fp=<fingerprint>`) so distinct states at the same URL (AUTO-002b) track as separate baseline rows. `pages_changed` SSE event wired into Test Lab live view via `useProjectRunMonitor` → `ActiveRunBanner` ("N pages changed → regenerating only those" replaces generic progress bar). Migration `019_crawl_baselines.sql` + migration `020_run_changed_pages.sql` (`runs.changedPages` + `runs.removedPages` JSON columns registered in `runRepo.JSON_FIELDS` + `INSERT_COLS`). `canonicalUrl` preservation on preview crawls prevents production-baseline corruption (`project.url` is overridden to `previewUrl` in `trigger.js` but `project.canonicalUrl` is set to the original, used by `sameOrigin` guard). `crawl.start.deployment` activity marker (AUTO-015b) + new `GET /api/v1/projects/:id/last-deployment-run` route powers the "Last deployment run" chip on `ProjectHeader.jsx` (24h window, navigates to run on click). `dialsConfig` honoured on `triggerCrawl` path + webhook-launched preview crawls. `req.rawBody` capture scoped to webhook routes only (avoids global Buffer copy). End-to-end happy-path test in `deployment-triggers.test.js` asserts webhook → run dispatch + activity marker; `crawl-diff.test.js` covers all 8 scenarios (added/changed/unchanged/removed, first-crawl fallback, null/undefined baseline, no-change, empty current crawl, state-mode composite keys, fingerprint stability); dedicated `crawl-baseline-repo.test.js` per REVIEW.md. AGENT.md gained new "Issue-handling rule" section codifying the "every finding produces an outcome (fix or ROADMAP entry), never a silent gap" norm. | #12 |
| AUTO-003 + AUTO-003b (bundled) | Confidence scoring & auto-approval of low-risk tests + provenance / audit trail | #10 |
| AUTO-017.3 + PROC-001 | Web Vitals trend charts on `ProjectQualityCard` (LCP / CLS / INP / TTFB) backed by per-run averages from `recordMetric()` in `backend/src/testRunner.js` via new `GET /api/v1/projects/:id/metrics` route + `useProjectMetricQuery` hook (fail-soft — transient API errors render an empty trend, not a banner); threshold lines sourced from `project.webVitalsBudgets`. **PROC-001:** new `.github/workflows/no-orphan-routes.yml` fails PRs that add a `router.<method>(…)` in `backend/src/routes/*.js` without touching `frontend/src/api.js` / pages / components; `[no-ui]` PR-title opt-out for genuinely UI-less endpoints. Convention documented in `REVIEW.md`, `AGENT.md`, `CONTRIBUTING.md`, and the PR template. New `backend/tests/web-vitals-trend.test.js` locks down that the recorded sample is the per-run average (not the budget); `backend/tests/quality-gates.test.js` extended with HTTP-level coverage for the new metrics route (400 / 404 / 200 + `limit` clamp). PROC-003 (sprint-promotion auto-prune) was reverted in PR #10 — the regex transforms had too many edge cases and the canonical hand-off is the manual checklist in `REVIEW.md § Sprint Tracker Hand-off`. | #9 |
| CAP-003 | Secret scanner gate on AI-generated Playwright tests. New `backend/src/pipeline/secretScanner.js` runs a `gitleaks`-style scan inside the validate stage (`backend/src/pipeline/testValidator.js`); built-in detectors (AWS access key IDs, JWTs, `Bearer` tokens) plus best-effort `.github/.gitleaks.toml` reuse. Matched tests are rejected, annotated with a redacted finding list (first/last 4 chars only — never plaintext), and the run is flagged via `run.secretScanBlocked = true` in `pipelineOrchestrator.js` so CI consumers can fail the build on regression. Positive + negative fixtures (AWS keys / JWTs / `Bearer` tokens / clean code) in `backend/tests/secret-scanner.test.js`, registered in `backend/tests/run-tests.js`. | #12 |

*Full completed list → ROADMAP.md § Completed Work*
