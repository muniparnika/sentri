# Sentri — Engineering Roadmap

> **Last revised:** April 2026 · `sentri_v1_4`
> **Stack:** Node.js 20 (ESM) · Express 4 · SQLite → PostgreSQL · Playwright · React 18 · Vite 6
>
> This document is the single source of truth for all planned and in-progress engineering work.
> It is a full rewrite based on a comprehensive codebase audit, resolving numbering gaps, orphaned items,
> duplicate entries, and stale statuses present in prior versions.

---

## ⚡ Agent fast path

> **Working on the next PR? Read [`NEXT.md`](./NEXT.md) instead — it has the current item spec, files to change, and acceptance criteria. You do not need to read further in this file.**
>
> Come back here only to: look up a specific item by ID (Ctrl+F the ID e.g. `DIF-008`), check completed work history, or review phase/competitive context.
>
> **Current sprint:** `AUTO-002` (auto-approval mechanism + trust contract) — promoted per `NEXT.md` rotation after `AUTO-017.3 + PROC-001 + PROC-003` shipped in PR #9 · **Blockers:** none remaining · **Remaining:** ~32 planned items across Phases 2–4 + Maintenance — see the Summary table at the bottom of this document for the authoritative breakdown. Recent ships: AUTO-017.3 + PROC-001 + PROC-003 ✅ PR #9 (Web Vitals trend charts + no-orphan-routes CI guard + sprint-promotion auto-prune); CAP-004 + MET-001 + PROC-002 ✅ PR #8 (self-healing dashboard + time-series metric primitive + sprint-tracker hand-off script); CAP-003 ✅ PR #12; UI-REFACTOR-001 ✅ PR #6; DIF-015b Gap 3 + DIF-015c Gap 1 ✅ PR #11; AUTO-019 ✅ PR #10; DIF-005 ✅ PR #9; AUTO-017 ✅ PR #8; DIF-015b Gap 2 ✅ PR #4.

---

## How to Read This Document

| Symbol | Meaning |
|--------|---------|
| 🔴 Blocker | Must ship before any team or production deployment |
| 🟡 High | Ship within the next two sprints |
| 🔵 Medium | Materially improves quality, DX, or coverage |
| 🟢 Differentiator | Builds competitive moat; schedule freely after blockers |
| ✅ Complete | Merged to `main`; included in summary only |
| 🔄 In Progress | Active branch or current sprint |
| 🔲 Planned | Scoped and ready to start |

**Effort sizing** (2-engineer team): `XS` < 1 day · `S` 1–2 days · `M` 3–5 days · `L` 1–2 weeks · `XL` 2–4 weeks

---

## Completed Work Summary

The following items have been verified complete against the codebase and are **not** repeated below.

> **Naming note:** Items numbered `MAINT-*` are legacy from prior roadmap versions. The current convention is `MNT-*`. Old IDs are preserved in PR descriptions and git history — do not rename them. Use `MNT-*` for all new maintenance items.

| ID | Title | PR / Commit                                                     |
|----|-------|-----------------------------------------------------------------|
| S3-02 | Shadow DOM support in crawler | PR #55                                                          |
| S3-04 | DOM stability wait before snapshot | PR #55                                                          |
| S3-08 | Disposable email address filter | PR #55                                                          |
| ENH-004 | Persist AI provider keys encrypted in database | PR #80                                                          |
| ENH-005 | Global API rate limiting (three-tier) | PR #78                                                          |
| ENH-006 | Test scheduling engine (cron + timezone) | PR #86                                                          |
| ENH-007 | Signed URL tokens for artifact serving | PR #79                                                          |
| ENH-008 | Move `runs.logs` to append-only `run_logs` table | PR #86                                                          |
| ENH-010 | Pagination on all list API endpoints | PR #78                                                          |
| ENH-011 | CI/CD webhook receiver + GitHub Actions integration | PR #86                                                          |
| ENH-013 | Persist password reset tokens in the database | PR #78                                                          |
| ENH-020 | Soft-delete with recycle bin for tests, projects, runs | PR #81                                                          |
| ENH-021 | `userId` + `userName` on activities for full audit trail | PR #78                                                          |
| ENH-024 | Frontend code splitting (React.lazy + Suspense) | PR #78                                                          |
| ENH-027 | Global React Error Boundary with crash reporting | PR #79                                                          |
| ENH-029 | Diff view for AI-regenerated test code | PR #81                                                          |
| ENH-030 | Secrets scanning in CI pipeline (Gitleaks) | PR #79                                                          |
| ENH-034 | Empty crawl result `completed_empty` status | PR #86                                                          |
| ENH-035 | No-provider-configured global banner (ProviderBanner) | PR #85                                                          |
| MAINT-010 | Semantic deduplication via TF-IDF + fuzzy matching | PR #55                                                          |
| MAINT-011 | Feature-sliced frontend component architecture | PR #81                                                          |
| MAINT-012 | Deep test validation (locator, action, assertion) | PR #57                                                          |
| MAINT-013 | Graceful shutdown with in-flight run draining | PR #86                                                          |
| MAINT-016 | Renovate for automated dependency updates | Renovate                                                        |
| SEC-001 | Email verification on registration | PR #87                                                          |
| INF-001 | PostgreSQL support with SQLite fallback | PR #87                                                          |
| INF-002 | Redis for rate limiting, token revocation, and SSE pub/sub | PR #87                                                          |
| INF-003 | BullMQ job queue for durable run execution | PR #92                                                          |
| FEA-001 | Teams / email / webhook failure notifications | PR #92                                                          |
| SEC-002 | Nonce-based Content Security Policy | PR #92                                                          |
| SEC-003 | GDPR / CCPA account data export and deletion | PR #92                                                          |
| INF-005 | API versioning (`/api/v1/`) with 308 redirects | PR #94                                                          |
| FEA-003 | AI provider fallback chain + circuit breaker | PR #94                                                          |
| DIF-003 | Mobile viewport / device emulation | PR #94                                                          |
| DIF-011 | Coverage heatmap on site graph | PR #94                                                          |
| DIF-014 | Cursor overlay on live browser view | PR #94                                                          |
| DIF-016 | Step-level timing and per-step screenshots | PR #94                                                          |
| AUTO-013 | Stale test detection and cleanup | PR #99                                                          |
| MNT-007 | ARIA live regions for real-time updates | PR #99                                                          |
| DIF-004 | Flaky test detection and reporting | PR #99                                                          |
| MNT-009 | Tiered prompt system for local models (Ollama) | PR #100                                                         |
| MNT-010 | Re-run button on Run Detail page for crawl/generate runs | PR #100                                                         |
| FEA-002 | TanStack React Query data layer | PR #107                                                         |
| MNT-011 | Persist crawl/generate dialsConfig on run record | Verified in PR #107 (fix landed in an earlier untracked commit) |
| ACL-001 | Multi-tenancy: workspace ownership on all entities | PR #87                                                          |
| ACL-002 | Role-based access control (Admin / QA Lead / Viewer) | PR #87                                                          |
| INF-004 | OpenAPI specification and Swagger UI | PR #94                                                          |
| DIF-001 | Visual regression testing with baseline diffing | PR #94                                                          |
| DIF-002 | Cross-browser testing (Firefox, WebKit / Safari) | PR #94                                                          |
| DIF-002b | Cross-browser polish: browser-aware baselines, UI badges, CI coverage | PR #107, PR #110                                                |
| DIF-015 | Interactive browser recorder for test creation | PR #94                                                          |
| AUTO-007 | Geolocation / locale / timezone testing | PR #94                                                          |
| DIF-006 | Standalone Playwright export (zero vendor lock-in) | PR #1                                                           |
| AUTO-005 | Automatic test retry with flake isolation | PR #2                                                           |
| DIF-013 | Anonymous usage telemetry (PostHog + opt-out) | PR #3                                                           |
| AUTO-006 | Network condition simulation (slow 3G / offline) | PR #3                                                           |
| DIF-015b | Recorder selector quality: naming alignment, nth=N disambiguation, Playwright `InjectedScript` delegation with hand-rolled fallback, iframe `frameLocator` emission, shadow-DOM via InjectedScript delegation | PR #3, PR #120 (Gaps 1), PR #4 (Gap 2), PR #11 (Gap 3 — `frameLocator('iframe[src*=…]').first()` in `actionsToPlaywrightCode`; shadow-DOM covered by Playwright's InjectedScript on the primary path) |
| DIF-015c (Gap 1) | Recorder: paste action as single `fill` + opt-in keyboard shortcut capture — `paste` listener emits one `safeFill` (500-char truncated), `shortcutCaptureBudget` + `__sentriRecorderSetShortcutBudget` expose an N-keystroke arming window, frontend "Record keyboard shortcut" button in `RecorderModal`, backend accepts `shortcutCapture` in `/record/:sessionId/input` | PR #11 |
| AUTO-016 (backend) | Accessibility testing — axe-core crawl scan + persistence (frontend `CrawlView` panel tracked as AUTO-016b) | PR #121                                                         |
| MNT-006 | Object storage abstraction — local-disk default + S3/R2 pre-signed URLs for screenshots, visual-diff baselines, and diffs (dual-write to local disk in s3 mode) | PR #122                                                         |
| DIF-007 | Conversational test editor connected to /chat (in-app "Edit with AI" panel on TestDetail with diff preview + one-click apply) | PR #123                                                         |
| AUTO-016b | Frontend CrawlView accessibility panel + dashboard "Top Accessibility Offenders" rollup | PR #1                                                           |
| ENH-036 | Project credential editing after creation (`PATCH /api/v1/projects/:id`) | PR #127                                                         |
| ENH-036b | Auto-detect login form fields — semantic-first locator waterfall removes need for hand-authored CSS selectors | PR #127                                                         |
| INF-006 | Persistent storage on hosted deployments (Render disk blueprint + ephemeral-storage warning) | PR #1                                                           |
| AUTO-012 | SLA / quality gate enforcement — per-project `qualityGates` config, run-time evaluator, `gateResult` on runs + trigger responses, `QualityGatesPanel` under ProjectDetail → Settings, per-run `<GateBadge>` on Runs list / RunDetail header, inline violation panel on RunDetail, GH Actions + GitLab CI consumer examples in `docs/guide/ci-cd-triggers.md` that exit non-zero on `gateResult.passed === false` | PR #2                                                           |
| AUTO-017 | Web Vitals performance budgets — per-project `webVitalsBudgets` config (`{ lcp, cls, inp, ttfb }`), CRUD endpoints under `/api/v1/projects/:id/web-vitals-budgets` (`qa_lead`+ on mutations, registered in `permissions.json`), `captureWebVitals(page)` injects the locally-bundled `web-vitals@4` IIFE (no CDN dependency) and records per-page LCP/CLS/INP/TTFB — runs on the success path independent of the `skipVisualArtifacts` gate so assertion-ending tests still contribute metrics. `evaluateWebVitalsBudgets()` in `testRunner.js` persists `webVitalsResult: { passed, violations }` on the run, surfaced in trigger response + callback payload and as a per-test-filtered violations card on RunDetail. Migration `015_web_vitals_budgets.sql` adds `projects.webVitalsBudgets` + `runs.webVitalsResult`. CI consumer docs in `docs/guide/ci-cd-triggers.md` include updated GH Actions + GitLab snippets and a new "Web Vitals Budgets" section. | PR #8                                                           |
| DIF-005 | Embedded Playwright trace viewer — install-time `postinstall` copier in `backend/scripts/copy-trace-viewer.js` resolves Playwright's prebuilt viewer (`playwright-core/lib/vite/traceViewer/` or `@playwright/test/lib/trace/viewer/`) and copies it to `backend/public/trace-viewer/`; `backend/src/middleware/appSetup.js` mounts it at `/trace-viewer/` with a viewer-scoped CSP (`script-src 'unsafe-inline' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `connect-src 'self' <s3>`), `Service-Worker-Allowed: /trace-viewer/` on the Playwright service worker (matched by `TRACE_VIEWER_SW_PATTERN` to survive filename renames), and `no-cache` for the SW + 5-minute cache for the rest. Run Detail adds a "🔍 Open Trace" action that opens `/trace-viewer/?trace=<signed-url>` in a new tab; the Trace ZIP download is preserved as fallback. Smoke test in `backend/tests/trace-viewer-static.test.js` asserts 200 when the bundle is present and 404 when removed. `backend/Dockerfile` copies `scripts/` before `npm install` so the postinstall hook resolves. | PR #9                                                           |
| AUTO-019 | Run diffing: per-test comparison across runs — new `GET /api/v1/runs/:runId/compare/:otherRunId` (`backend/src/routes/runs.js`) validates both runs under workspace ACL and returns a summary `{ total, flipped, added, removed, unchanged }` plus per-test diff rows keyed by `testId`. Frontend `api.getRunCompare(runId, otherRunId)` + new `RunCompareView` (`frontend/src/components/run/RunCompareView.jsx`) wired into `RunDetail` via a **Compare** action that loads a prior-run picker over the project's test-run history. Integration test `backend/tests/run-compare.test.js` covers happy path (all four change types), 404 unknown run, 401 unauth, and cross-workspace ACL; registered in `backend/tests/run-tests.js`. | PR #10                                                          |
| UI-REFACTOR-001 | `ConfigurablePanel` abstraction extracted from `QualityGatesPanel` (AUTO-012) + `WebVitalsBudgetsPanel` (AUTO-017) — ~95% structural overlap eliminated; future SLO-style config UIs (SEC-005 SSO config, DIF-008 Jira integration) ship as one-file PRs. Shipped alongside an Automation page redesign: four top-level WAI-ARIA tabs (**Triggers & Schedules** · **Quality Gates** · **Integrations** · **Snippets**) with arrow-key + Home/End navigation, per-project accordions inside each tab with live status chips (`N tokens` / `Scheduled`, `Gates configured` / `Budgets set`), and a new `frontend/src/utils/automationStatus.js` parser + module-level promise cache + pub/sub invalidation bus pinning the backend response shapes (`data.schedule.enabled`, `data.qualityGates`, `data.webVitalsBudgets`) with regression coverage in `frontend/tests/automation-status.test.js`. The legacy ProjectDetail → Settings tab is removed; Quality Gates / Web Vitals Budgets now live exclusively at `/automation`. Frontend-only — no backend, schema, route, or `permissions.json` changes. | PR #6                                                           |
| AUTO-017.3 | Web Vitals trend charts on `ProjectQualityCard` (LCP / CLS / INP / TTFB) backed by per-run averages from `recordMetric()` in `testRunner.js` via new `GET /projects/:id/metrics` route + `useProjectMetricQuery` hook; threshold lines sourced from `project.webVitalsBudgets`. | PR #9 |
| PROC-001 | No-orphan-routes CI guard (`.github/workflows/no-orphan-routes.yml`) — fails PRs adding `router.<method>(…)` in `backend/src/routes/*.js` without touching `frontend/src/api.js` / pages / components; `[no-ui]` PR-title opt-out. Convention documented in REVIEW.md, AGENT.md, CONTRIBUTING.md, and the PR template. | PR #9 |
| PROC-003 | Sprint promotion auto-prune — `scripts/promote-sprint-item.mjs` extended with three idempotent transforms (`appendCompletedWorkSummary`, `decrementRemainingCounts`, `pruneShippedRoadmapEntry`) that fold the manual REVIEW.md § Sprint Tracker Hand-off steps into the script. | PR #9 |
| CAP-003 | Secret scanner gate on AI-generated Playwright tests. New `backend/src/pipeline/secretScanner.js` runs a `gitleaks`-style scan inside the validate stage (`backend/src/pipeline/testValidator.js`); built-in detectors (AWS access key IDs, JWTs, `Bearer` tokens) plus best-effort `.github/.gitleaks.toml` reuse. Matched tests are rejected, annotated with a redacted finding list (first/last 4 chars only — never plaintext), and the run is flagged via `run.secretScanBlocked = true` in `pipelineOrchestrator.js` so CI consumers can fail the build on regression. Positive + negative fixtures in `backend/tests/secret-scanner.test.js`, registered in `backend/tests/run-tests.js`. | PR #12                                                          |
| AUTO-003 | Confidence scoring & auto-approval of low-risk tests + provenance / audit trail | PR #10 |
| AUTO-003b (bundled) | Confidence scoring & auto-approval of low-risk tests + provenance / audit trail | PR #10 |

---

## Phase Summary

| Phase | Scope | Status                                                                                                                                                                                | Est. Duration |
|-------|-------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| Phase 1 — Production Hardening | Security, reliability, data integrity | ✅ Complete                                                                                                                                                                            | — |
| Phase 2 — Team & Enterprise Foundation | Auth hardening, multi-tenancy, RBAC, queues | ✅ Mostly complete — SEC-001/002/003, INF-001/002/003/004/005/006, ACL-001/002, FEA-001/002/003, ENH-036 + ENH-036b all ✅; only SEC-004 (MFA) + SEC-005 (SSO) remain, both deferred until enterprise demand | 8–10 weeks |
| Phase 3 — AI-Native Differentiation | Visual regression, cross-browser, competitive features | 🔄 In progress — most differentiators shipped (DIF-001/002/002b/003/004/005/006/007/011/013/014/015/016 ✅ — DIF-005 embedded trace viewer shipped in PR #9); remaining: DIF-008–010, DIF-012, DIF-015b/c sub-items, INT-002 | 10–12 weeks |
| Phase 4 — Autonomous Intelligence | Risk-based testing, change detection, quality gates | 🔄 In progress — AUTO-005/006/007/012/013/016/016b/017/019 ✅; remaining: AUTO-001/002/003/003b/004, AUTO-008–011, AUTO-014/015, AUTO-018, AUTO-020/021 · Capabilities row (CAP-001 data-driven, CAP-002 sharding) tracked separately in Summary | 14–18 weeks |
| Ongoing — Maintenance & Platform Health | Healing AI, DX, exports, accessibility | 🔄 Continuous                                                                                                                                                                         | — |

---

## Phase 2 — Team & Enterprise Foundation

*Goal: Multi-user, secure, and durable enough for team deployment (5–50 users). Phase 2 is largely complete — only the two deferred enterprise-auth items remain.*

---

### SEC-004 — MFA (TOTP / passkey) support 🔵 Medium

**Status:** 🔲 Planned | **Effort:** L | **Source:** Audit

**Problem:** There is no multi-factor authentication. MFA is a compliance requirement (SOC 2, ISO 27001) and a sales blocker for regulated industries.

**Fix:** Add TOTP-based MFA using `otplib`. Store the encrypted TOTP secret in the `users` table. Add MFA setup flow (QR code generation), MFA verification at login, and recovery codes. Passkey (WebAuthn) support can follow in a subsequent sprint.

**Files to change:**
- `backend/src/routes/auth.js` — MFA enroll, verify, and recovery endpoints
- `backend/src/database/migrations/` — add `mfaSecret`, `mfaEnabled`, `mfaRecoveryCodes` to `users`
- `frontend/src/pages/Login.jsx` — MFA verification step
- `frontend/src/pages/Settings.jsx` — MFA setup and management

**Dependencies:** ACL-001 (multi-tenancy first allows for per-workspace MFA policy)

---

### SEC-005 — SAML / OIDC SSO federation 🔵 Medium

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive (BearQ, enterprise)

**Problem:** Sentri supports email/password + GitHub/Google OAuth, and SEC-004 covers TOTP MFA, but there is no SAML 2.0 or OIDC federation support. Enterprise procurement teams require SSO integration with their identity provider (Okta, Azure AD, OneLogin, Ping). BearQ inherits SmartBear's enterprise SSO. This is a distinct requirement from MFA — SSO replaces the login flow entirely rather than adding a second factor.

**Fix:** Integrate `openid-client` for OIDC and `@node-saml/passport-saml` for SAML 2.0. Add a per-workspace SSO configuration (metadata URL, client ID, certificate). When SSO is enabled, redirect login to the IdP. Map IdP attributes to Sentri user fields. Auto-provision users on first SSO login. Add SSO configuration UI in Settings → Authentication.

**Files to change:**
- `backend/src/middleware/authenticate.js` — add `saml` and `oidc` auth strategies
- `backend/src/routes/auth.js` — SSO callback endpoints, IdP-initiated login
- `backend/src/database/migrations/` — `sso_configurations` table per workspace
- `frontend/src/pages/Settings.jsx` — SSO configuration panel
- `backend/package.json` — add `openid-client`, `@node-saml/passport-saml`

**Dependencies:** ACL-001 (workspaces must exist for per-workspace SSO configuration)

---

## Phase 3 — AI-Native Differentiation

*Goal: Pull ahead of Mabl, Testim, and SmartBear (including BearQ) with AI-powered capabilities and advanced testing features. These items build the competitive moat.*

---

### DIF-002c — Cross-browser crawl and recorder support 🔲 Backlog

**Status:** 🔲 Planned | **Effort:** XL | **Source:** Follow-on from DIF-002

**Problem:** Crawler (`pipeline/crawlBrowser.js`, `pipeline/stateExplorer.js`), interactive recorder (`runner/recorder.js`), and the live CDP screencast (`runner/screencast.js`) are pinned to Chromium in DIF-002. They use Playwright's CDP APIs directly — `page.context().newCDPSession()`, `Page.startScreencast`, shadow-DOM tree walkers via CDP `DOM.getFlattenedDocument` — which Firefox has no equivalent for and WebKit implements only partially via WebDriver BiDi. Users who want to crawl/record a Safari-only issue or test a WebKit rendering quirk during authoring have no path.

**Fix (high-level; deliberately deferred until there is customer demand):**
- Replace CDP screencast with Playwright's cross-browser `page.screenshot()` polling at ~8-12 fps. Lower quality but engine-agnostic. Keep CDP path for chromium as a fast fallback.
- Replace the CDP-based shadow-DOM tree walker in `crawlBrowser.js` with Playwright's `page.locator()` + `{ strict: false }` serialisation. Slower but engine-agnostic.
- Add a browser param to `POST /projects/:id/record` and `POST /projects/:id/crawl` routes; pass through to the relevant pipeline modules.
- Accept that crawl quality will degrade for firefox/webkit relative to chromium until Playwright's BiDi API stabilises.

**Files to change:**
- `backend/src/pipeline/crawlBrowser.js`, `stateExplorer.js` — accept `browser` param, swap CDP calls for cross-engine equivalents
- `backend/src/runner/recorder.js` — accept `browser`, swap screencast impl
- `backend/src/runner/screencast.js` — dual-path (CDP for chromium, screenshot poll fallback)
- `frontend/src/components/run/RecorderModal.jsx`, `frontend/src/pages/TestLab.jsx` — browser selector (the legacy `CrawlProjectModal` was migrated into the Test Lab page)

**Dependencies:** DIF-002 ✅, DIF-002b (baselines must be browser-aware before crawler variability amplifies diff noise)

---

### DIF-015b — Recorder selector quality: adopt Playwright's selectorGenerator 🔵 Medium

**Status:** ✅ Complete (PR #3 — naming alignment; PR #120 — Gap 1 nth=N disambiguation; PR #4 — Gap 2 Playwright `InjectedScript` delegation + fallback; PR #11 — Gap 3 iframe `frameLocator` emission + shadow-DOM via InjectedScript delegation) | **Effort:** S | **Source:** Follow-on from DIF-015

> **Progress:** All three gaps shipped. Gap 3 iframe codegen landed in PR #11 via `actionsToPlaywrightCode`'s `frameLocator('iframe[src*=<frameUrl>]').first()` branch; shadow-DOM traversal is handled by Playwright's InjectedScript on the primary selector-generation path shipped in PR #4.

#### ✅ Gap 1 — nth=N disambiguation for duplicate CSS matches (PR #120)

When the CSS-fallback branch of `selectorGenerator` produces a selector that matches multiple elements on the page (e.g. three identical `button.btn-primary`), the recorder now appends a Playwright `>> nth=N` token so replay clicks the same element the user clicked. Implementation lives at `backend/src/runner/recorder.js` in `disambiguateCss()` — a single `document.querySelectorAll` call, scoped to CSS-fallback selectors only (semantic selectors like `data-testid=`, `role=`, `text=` pass through unchanged because an `aria-label` collision is a real test smell that should surface, not be silently disambiguated away).

#### ✅ Gap 2 — Playwright `InjectedScript` delegation with hand-rolled fallback (PR #4)

**Status:** ✅ Complete (PR #4) | **Effort:** S | **Priority:** 🔵 Medium

Shipped two layers instead of the originally-scoped pure heuristic:

1. **Primary path — Playwright delegation.** The recorder now loads Playwright's pre-bundled `playwright-core/lib/server/injected/injectedScriptSource.js` at server start (`backend/src/runner/playwrightSelectorGenerator.js`), evaluates it in page scope via `addInitScript`, constructs an `InjectedScript` instance with feature-detected constructor shapes, and exposes `window.__playwrightSelector(el)` as the in-page entry point. `selectorGenerator` inside `RECORDER_SCRIPT` calls it first — same algorithm Playwright's own `codegen` uses, so ancestor scoring, machine-generated-testid demotion, shadow-DOM traversal, and iframe locator chains come for free.
2. **Fallback path — hand-rolled chain.** When the bundle can't be resolved (missing install, Playwright bumped to a layout-incompatible version, IIFE throws), the loader returns `available: false` and `selectorGenerator` drops through to the existing `data-testid → role+name → label → placeholder → CSS` chain. The fallback retains the originally-scoped noise-testid heuristic (`isNoisyTestId`: numeric-only, `el_`/`comp-`/`t-` + hex tail ≥4 chars, length > 30 with no separators) so a degraded recorder still demotes generated testids correctly.

**Risks knowingly accepted:** Playwright marks `lib/server/injected/*` as internal and **not covered by semver**. Symbol churn across minor releases will silently degrade the primary path to fallback. Track via the launch-time health probe (planned follow-up) and the `cross-browser-smoke`-style CI canary.

**Files shipped:** new `backend/src/runner/playwrightSelectorGenerator.js` (loader + bootstrap) · `backend/src/runner/recorder.js` (delegation + fallback in `selectorGenerator`, init-script wiring in `startRecording`) · `backend/tests/recorder.test.js` (fixture tests for `isNoisyTestId`, simulation tests for fallback ordering, contract tests for the loader/bootstrap) · `docs/changelog.md` entry.

---

### DIF-015c — Recorder gaps backlog (action vocabulary, assertions, pause/undo, auth, mobile) 🔵 Medium

**Status:** 🔲 Planned | **Effort:** L (split into sub-items below) | **Source:** PR #115 dogfooding + competitive review (BearQ / Mabl / Testim)

**Problem:** PR #115 made the canvas interactive and aligned recorded steps with the AI-generated / manual format, but the recorder still has six distinct gaps that surface during real use against e-commerce, kanban, and admin-dashboard targets. These are scoped here as a backlog so future PRs can pick them off individually without re-doing this analysis.

#### Gap 1 — Expanded action vocabulary

> **Update (PR #118):** This gap was originally written against the PR #115 baseline where `RECORDER_SCRIPT` listened for only `click`, `change`, `keydown`. PR #118 (folding in PR #116 / #117) extended the listener set to also cover `dblclick`, `contextmenu`, `mouseover`/`mouseout`, `input`, `dragstart`/`drop`, plus the existing `change` branch for `<input type="file">`. The corresponding action kinds (`dblclick`, `rightClick`, `hover`, `fill` debounced, `upload`, `drag`) all flow through `actionsToPlaywrightCode` (`backend/src/runner/recorder.js:677-817`) and `recordedActionToStepText` (`backend/src/runner/recorder.js:521-616`) with regression tests in `backend/tests/recorder.test.js`. The remaining work is **paste** (and the deferred items below).

`RECORDER_SCRIPT` (`backend/src/runner/recorder.js:180-395`) currently listens for `click`, `dblclick`, `contextmenu`, `mouseover`/`mouseout`, `input`, `change`, `keydown`, `dragstart`, `drop`. Two common gestures still produce zero captured actions:

| Gesture | Why it matters | Status | Suggested mapping |
|---|---|---|---|
| **Drag-and-drop** | Trello, Notion, kanban boards, file pickers | ✅ shipped (PR #118) | `dragstart`+`drop` paired → `locator.dragTo(targetLocator)` |
| **Double-click** | Inline editors, text selection | ✅ shipped (PR #118) | `dblclick` → `locator.dblclick()` |
| **Right-click** | Context menus | ✅ shipped (PR #118) | `contextmenu` → `locator.click({ button: 'right' })` |
| **File upload** | `<input type="file">` content | ✅ shipped (PR #118 — placeholder fixture path, captured filename in NOTE comment) | `change` on file input → `safeUpload(sel, [])` + comment with captured names |
| **Hover with intent** | Hover-only menus, tooltips | ✅ shipped (PR #118 — 600 ms dwell timer) | sustained `mouseover` → `locator.hover()` |
| **Paste** | Pasted tokens / addresses / JSON | ✅ shipped (PR #11) | `paste` event clipboard text → one `safeFill(sel, '<text>')` truncated to 500 chars; cancels any pending input-debounce timer so the fill isn't emitted twice |
| **Keyboard shortcuts** | Ctrl+A / Ctrl+C / Cmd+Enter | ✅ shipped (PR #11) | Opt-in `shortcutCaptureBudget` — frontend "Record keyboard shortcut" button in `RecorderModal` sends `shortcutCapture` to `/record/:sessionId/input`; backend `forwardInput` arms `window.__sentriRecorderSetShortcutBudget(N)` (default 3) so the next N printable keydowns on editable fields flow through to `press` instead of being suppressed; budget auto-decrements to 0 so modifier noise isn't permanent |

Each remaining kind requires a typedef union member, an `actionsToPlaywrightCode` branch, a `recordedActionToStepText` branch, an `isEmittableAction` branch (`backend/src/runner/recorder.js:634-654` — single source of truth for the "is this action well-formed enough to emit code for?" predicate), and a regression test. Coordinate with DIF-015b (selectorGenerator) to avoid `RECORDER_SCRIPT` merge conflicts.

#### Gap 2 — Inline assertion authoring during recording

> **Update (PR #118):** Partially shipped. PR #118 added `POST /api/v1/projects/:id/record/:sessionId/assertion` (`backend/src/routes/tests.js:1164-1184`) and the matching server-side `addAssertionAction()` (`backend/src/runner/recorder.js:827-855`), supporting `assertVisible`, `assertText`, `assertValue`, and `assertUrl`. The frontend `RecorderModal` already exposes an "Add assertion" form alongside the live canvas. What's missing is the **point-and-click** UX: the user has to manually paste a selector into the form rather than hovering an element on the canvas to highlight it. The visual / hover-to-pick affordance (the part competitors charge for) is still planned.

The recorder captures *what the user did* but never *what they expected* unless the user explicitly opens the assertion form. Stage 6 of the AI pipeline infers assertions post-hoc, which produces weak / missing assertions for negative tests, state-dependent flows ("cart count is 3"), cross-page assertions, and count assertions. Competitors (BearQ, Mabl, Testim) all let the user toggle into "assert mode" mid-recording, click an element, and pick an assertion type from a popover (`is visible` / `has text` / `has count` / `URL matches` / `has class`).

Remaining implementation: when the assert toggle in `RecorderModal` is active, suppress `forwardInput` on the canvas, highlight the hovered element via CDP `Overlay.highlightNode`, and open the assertion picker pre-filled with that element's `bestSelector()` output. The route + step rendering already exist — this is purely a frontend / UX change in `frontend/src/components/run/RecorderModal.jsx` and `frontend/src/components/run/LiveBrowserView.jsx` (an `assertMode` prop that suppresses input forwarding and surfaces hover targets back to the modal). `assertCount` and `assertHasClass` would need a new action kind on the backend; the other four are already wired.

#### Gap 3 — Pause / resume + undo last action

Once recording starts, every action is captured through to Stop. There is no way to:
- **Pause** while authenticating manually (recorder captures the password keystrokes — currently truncated to 40 chars in step prose, but the full value lives in `playwrightCode`).
- **Resume** from a paused state to continue the same recording.
- **Undo** the last captured action when the user mis-clicks (current workaround: discard the entire session and start over).
- **Edit** an action mid-recording (e.g. fix a typo in a fill value before saving).

Server-side change is small (a `pause` / `resume` / `pop-last` route + session-state guards in `forwardInput`); the UX work in `RecorderModal` is the larger lift.

#### Gap 4 — Authentication / pre-logged-in state handling

The recorder starts at `startUrl` with a fresh browser context — no cookies, no localStorage, no logged-in state. Three flows have no good answer today:

1. **Recording a test against an authenticated app** — user must record the login flow as part of every test, even though the resulting test will execute under a different fixture in CI. Workaround is to record the full login each time.
2. **Recording behind SSO / OAuth** — login redirects through a third-party IdP (Google / Okta / Azure AD); the recorder captures the IdP form fields but those selectors are useless at replay (the IdP UI changes; tests cannot be rerun against a different env).
3. **MFA-protected logins** — every recording requires re-doing MFA, which is not deterministic.

Possible fix: integrate with project credential profiles (DIF-010) so the recorder browser context is seeded with `storageState` from a captured login, skipping login entirely. Pair with environment-aware credential profiles per `MNT-004` / `DIF-012`.

#### Gap 5 — Mobile / touch / device profile during recording

The recorder runs at desktop viewport only. There is no device dropdown in `RecorderModal`. Users who want to record a mobile-only flow (touch interactions, hamburger menus, mobile checkout) currently have to record at desktop and replay at mobile, which produces brittle selectors and miss-tagged steps.

Fix is small: thread a `device` param through `POST /projects/:id/record` → `recorder.js`, and set `browser.newContext({ ...devices[device] })` the same way `executeTest.js` already does for runs (DIF-003). UX is a device dropdown in `RecorderModal` mirroring the one in `RunRegressionModal`.

#### Gap 6 — Sites that block embedding / detect headless

Some target apps detect headless Chromium (via `navigator.webdriver`, missing chrome plugins, viewport inconsistencies) and refuse to render or behave differently. Sentri's recorder uses a real Chromium, but with default Playwright launch args that include the webdriver flag.

Workaround today is to set `BROWSER_HEADLESS=false` (per `REVIEW.md:154-156`). Long-term fix is to add a "stealth" launch profile to `launchBrowser()` that hides automation markers — `playwright-extra` + `puppeteer-extra-plugin-stealth` is the conventional choice. Track separately if customer demand surfaces.

**Suggested split into PRs:**

| Sub-item | Effort | Priority | Status |
|---|---|---|---|
| Gap 1 — Expanded action vocabulary | M | 🟡 High | ✅ Complete (PR #118 + PR #11 — paste + opt-in keyboard shortcuts) |
| Gap 2 — Inline assertion authoring | S | 🟢 Differentiator (parity with BearQ) | 🔄 Backend shipped (PR #118); point-and-click UX + `assertCount` / `assertHasClass` remain |
| Gap 3 — Pause / resume + undo | S | 🔵 Medium | 🔲 Planned |
| Gap 4 — Auth / storageState integration | M | 🔵 Medium (depends on DIF-010) | 🔲 Planned |
| Gap 5 — Device profile during recording | S | 🔵 Medium | 🔲 Planned |
| Gap 6 — Stealth launch profile | S | 🔵 Medium | 🔲 Planned |

**Files to change** (per sub-item — not all-at-once):
- `backend/src/runner/recorder.js` — RECORDER_SCRIPT extensions, action typedef, code/step generators
- `backend/src/routes/tests.js` — POST /record param surface
- `frontend/src/components/run/RecorderModal.jsx` — Assert toggle, pause/resume controls, device dropdown
- `frontend/src/components/run/LiveBrowserView.jsx` — assertMode prop that suppresses forwardInput
- `backend/tests/recorder.test.js` — coverage for each new kind / mode
- `QA.md` recorder section — captured / not-captured lists per gap
- `docs/changelog.md` — `### Added` entries per shipped sub-item

**Dependencies:** DIF-015 ✅. DIF-015b (selectorGenerator) should land before Gap 1 to avoid `RECORDER_SCRIPT` merge conflicts. DIF-010 (multi-auth profiles) is a soft prerequisite for Gap 4. DIF-003 (device emulation) provides the runtime infra Gap 5 reuses.

---


### DIF-008 — Jira / Linear issue sync 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive

**Problem:** The traceability data model already stores `linkedIssueKey` and `tags` per test, but there is no outbound sync. When a test fails, no ticket is automatically created. Engineers must manually correlate test failures to issues.

**Fix:** Add `POST /api/integrations/jira` and `POST /api/integrations/linear` settings endpoints to store OAuth tokens. On test run failure, auto-create a bug ticket (with screenshot, error message, and Playwright trace attached). Sync pass/fail status back to the linked issue's status field. Add an Integrations tab to Settings.

**Files to change:**
- New `backend/src/utils/integrations.js` — Jira and Linear API clients
- `backend/src/testRunner.js` — call `syncFailureToIssue(test, run)` on completion
- `backend/src/routes/settings.js` — integration config endpoints
- `frontend/src/pages/Settings.jsx` — Integrations tab

**Dependencies:** FEA-001 (notification infrastructure shares the dispatch pattern)

---

### INT-002 — GitHub PR check comments 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** M | **Source:** PR #8 review (migrated from `docs/roadmap-gaps-pr8.md` before its deletion)

**Problem:** Every modern QA tool posts a GitHub Check Run on the PR with a deep-link to the run. Today Sentri only sends a webhook callback (ENH-011) — the PR author never sees the result without leaving GitHub. This is a discoverability gap for the most common CI integration target.

**Fix:** GitHub App-based Check Run posting, parameterised by the project's trigger token. Status transitions: `queued` → `in_progress` → `success` / `failure` with summary markdown rendered from the run result (passed / failed counts, gate violations, failing test names, deep-link to Run Detail). Reuses the FEA-001 notification dispatcher pattern. Integrations tab in Settings (shared with DIF-008) holds the GitHub App credentials.

**Files to change:**
- New `backend/src/utils/integrations/github.js` — Check Run API client + webhook signature verification
- `backend/src/routes/trigger.js` — emit `queued`/`in_progress`/`completed` Check Runs alongside the existing webhook callback
- `backend/src/routes/settings.js` — GitHub App config endpoint
- `frontend/src/pages/Settings.jsx` — extend Integrations tab from DIF-008

**Dependencies:** ENH-011 ✅ (trigger token infrastructure), FEA-001 ✅ (notification dispatcher pattern). Coordinate with DIF-008 — both items extend the Integrations tab and share the OAuth-credential storage shape.

---

### DIF-009 — Autonomous monitoring mode (always-on QA agent) 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** M | **Source:** Competitive

**Problem:** Sentri is currently a triggered tool — it runs when instructed. The brand promise of "autonomous QA" implies it should also watch production continuously. No competitor outside enterprise tiers offers this for self-hosted deployments.

**Fix:** Add a monitoring mode per project: run a configurable set of smoke tests on a schedule against the production URL. On failure, auto-trigger a re-run to distinguish a regression from a transient flake (2 consecutive failures = confirmed). Fire notifications on confirmed failures. Show a "Monitor" badge on the dashboard for active monitoring projects.

> **Overlap resolution:** This feature builds on scheduling (ENH-006 ✅) and depends on notifications (FEA-001) for alerting. The 2-consecutive-failure confirmation logic is distinct from both and is not duplicated in either dependency — it is implemented here as monitoring-specific re-run orchestration in `scheduler.js`.

**Files to change:**
- `backend/src/scheduler.js` — add monitoring job type alongside scheduled runs
- `backend/src/routes/projects.js` — `PATCH /projects/:id/monitor`
- `frontend/src/pages/Dashboard.jsx` — monitoring status indicators
- `frontend/src/pages/ProjectDetail.jsx` — monitoring config panel

**Dependencies:** INF-003 (BullMQ — retry logic needs durable job execution), FEA-001 (failure notifications)

---

### DIF-010 — Multi-auth profile support per project 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** M | **Source:** Competitive (unique to Sentri)

**Problem:** Sentri stores credentials per-project but supports only a single auth profile. Testing role-based access control — "admin sees this, viewer does not" — requires running the same test suite under different identities. The Test Dials already expose a `multi_role` perspective option that is not yet wired to actual credential profiles.

**Fix:** Add named credential profiles (e.g., "admin", "viewer", "guest") per project, each with a separate username/password or cookie payload. Wire the `multi_role` Test Dial to the profile selector. Surface per-profile result columns in the run detail view.

**Files to change:**
- `backend/src/utils/credentialEncryption.js` — extend to support multiple named profiles
- `backend/src/routes/projects.js` — profile CRUD endpoints
- `backend/src/pipeline/stateExplorer.js` — accept `profileId` param
- `frontend/src/pages/ProjectDetail.jsx` — credential profiles panel
- `frontend/src/components/test/TestConfig.jsx` — connect `multi_role` dial to profile selector (the legacy `TestDials.jsx` was migrated into the unified `TestConfig` surface used by the Test Lab page)

**Dependencies:** None

---


### DIF-012 — Multi-environment support (staging vs. production) 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive

**Problem:** There is no concept of environments per project. Teams need to run the same test suite against `staging.myapp.com` and `myapp.com` separately, with per-environment run history and independent pass/fail status. This is a critical enterprise requirement.

**Fix:** Add an `environments` table per project (`name`, `baseUrl`, `credentials`). Each run is scoped to an environment. Dashboard shows per-environment pass rates. Run modal allows environment selection.

**Files to change:**
- `backend/src/database/migrations/` — new `environments` table
- All run and project routes — scope runs to an environment
- `frontend/src/pages/ProjectDetail.jsx` — environment management panel
- `frontend/src/components/run/RunRegressionModal.jsx` — environment selector

**Dependencies:** ACL-001 (multi-tenancy ensures environments are workspace-scoped)

---

## Phase 4 — Autonomous Intelligence

*Goal: Advance Sentri beyond triggered QA into a genuinely autonomous system that makes intelligent decisions about what to test, when to test, and what failures mean. Items in this phase are post-Phase 3 and can be prioritised individually based on customer demand.*

> **Note:** Several Phase 4 items have already shipped opportunistically alongside other work and appear in the Completed Work Summary above — `AUTO-005` (test retry, PR #2), `AUTO-006` (network conditions, PR #3), `AUTO-007` (geolocation/locale/timezone, PR #94), `AUTO-012` (SLA / quality gate enforcement — full backend + UI + CI consumer docs, PR #2), `AUTO-013` (stale test detection, PR #99), `AUTO-016` backend slice (axe-core scan + persistence, PR #121), `AUTO-016b` (frontend `CrawlView` accessibility panel + dashboard "Top Accessibility Offenders" rollup, PR #1), `AUTO-017` (Web Vitals performance budgets, PR #8), and `AUTO-019` (per-test run diffing, PR #10). The remaining items are scoped here and ready to start; the immediate next sprint target is the combined recorder PR (`DIF-015b Gap 3` + `DIF-015c Gap 1`) tracked in `NEXT.md`.

---

### AUTO-001 — Intelligent test selection (risk-based run ordering) 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive Gap Analysis

**Problem:** Sentri runs all approved tests in insertion order on every run. An autonomous system should prioritise: run tests covering recently changed code first, run previously-failing tests first, and skip tests for unchanged pages. No ordering logic exists in `testRunner.js` or `scheduler.js`. Mabl and Testim both offer smart test selection.

**Fix:** Before each run, sort the test queue by a risk score: `riskScore = (daysSinceLastFail × 0.4) + (isAffectedByRecentChange × 0.4) + (flakyScore × 0.2)`. Update `testRunner.js` to accept a sorted queue from the risk scorer.

**Files to change:**
- New `backend/src/utils/riskScorer.js` — compute risk score per test
- `backend/src/testRunner.js` — sort test queue before execution
- `backend/src/database/repositories/testRepo.js` — expose `lastFailedAt`, `flakyScore` for scoring

**Dependencies:** DIF-004 (flaky score), AUTO-002 (change detection enriches the score)

---

### AUTO-002 — Change detection / diff-aware crawling 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive Gap Analysis

**Problem:** Sentri re-crawls the entire site on every run. An autonomous system should detect what changed since the last crawl (new pages, modified DOM, removed elements) and only regenerate tests for affected pages. `crawler.js` has no concept of a previous crawl baseline. This is the difference between "run everything nightly" and "test only what changed."

**Fix:** After each crawl, store a `crawl_baseline` snapshot per project (page URL → DOM fingerprint hash). On the next crawl, diff against the baseline to identify changed pages. Only run the generation pipeline for changed pages. Emit a `pages_changed` event over SSE.

**Files to change:**
- `backend/src/pipeline/crawlBrowser.js` — baseline comparison logic
- New `backend/src/pipeline/crawlDiff.js` — DOM fingerprint diff engine
- `backend/src/database/migrations/` — `crawl_baselines` table
- `backend/src/routes/runs.js` — expose `changedPages` in run response

**Dependencies:** None

---

### CAP-001 — Data-driven testing (parameterized iterations) 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** M | **Source:** PR #8 review (migrated from `docs/roadmap-gaps-pr8.md` before its deletion) · Competitive (Cypress / Playwright / Mabl)

**Problem:** Generated tests are single-shot — one assertion path, one input set. Industry-standard practice (Cypress, Playwright `test.describe.serial` + fixtures, Mabl iterations) is to run the same test against N data rows from a CSV / JSON fixture, with one Run row per iteration so failures are attributable to a specific row. Sentri has no fixture concept today, so testing edge-case data combinations means hand-authoring N near-identical tests.

**Fix:** Add per-test fixture upload (CSV / JSON) stored as a `test_fixtures` table row. Extend the runner to iterate over fixture rows when present, substituting placeholders in `playwrightCode` (e.g. `{{email}}` → row value). Surface per-iteration results in `RunDetail.jsx` as a sub-table under the test row. Bound the iteration count via a per-project setting (default 10, max 100) so a 10k-row CSV can't exhaust the worker pool.

**Files to change:**
- New migration — `test_fixtures` table keyed on `(testId, version)` with `format` (`"csv"` | `"json"`), `rows` (TEXT JSON), `createdAt`
- New `backend/src/database/repositories/testFixtureRepo.js`
- `backend/src/runner/executeTest.js` — iterate over fixture rows when present, emit per-iteration `result` rows with `iterationIndex` field
- `backend/src/routes/tests.js` — `POST /api/v1/tests/:testId/fixtures` (upload), `GET /api/v1/tests/:testId/fixtures` (list)
- `backend/src/middleware/permissions.json` — register the new endpoints (qa_lead+)
- `frontend/src/pages/TestDetail.jsx` — fixture upload + preview panel
- `frontend/src/components/run/StepResultsView.jsx` — per-iteration sub-table

**Dependencies:** None. Plays well with DIF-010 (multi-auth profiles) — a fixture row can override `credentials` so one test runs as `admin` then as `viewer` in successive iterations.
**See also:** MNT-004 (fixtures) — fixtures handle environment setup/teardown before a test; CAP-001 handles repeated execution with varying inputs. They are complementary. This item supersedes the earlier `AUTO-022 — Data-driven test parameterisation` entry (removed in the PR #8 cleanup pass; the CAP-001 schema is more concrete).

---

### CAP-002 — Distributed test sharding across runners 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** PR #8 review (migrated from `docs/roadmap-gaps-pr8.md` before its deletion) · Competitive (Cypress Cloud / Playwright shard mode)

**Problem:** Single-host parallelism caps suite size at the local worker count (typically 1–10 contexts on a developer machine, 4–8 on a Render box). Industry tools split a single run across N runners — Cypress Cloud's `--record --parallel`, Playwright's `--shard=1/4`. Sentri's BullMQ infrastructure (INF-003 ✅) already gives us the worker pool primitive, but `runTests()` allocates the entire test list to a single worker, so adding nodes doesn't reduce wall-clock time on a large suite.

**Fix:** Split `runTests()` into a coordinator + N shard workers. Coordinator partitions the approved-test list across `runConfig.shards` BullMQ jobs, each scoped to `(runId, shardIndex, shardCount)`. Workers pick their slice, execute, and write per-test results to the shared `runs` row keyed on `runId`. The run is `completed` when all shards report; `failed` if any shard's worker crashes. Re-uses INF-003's abort path — aborting the parent job propagates a cancel signal to all shard jobs via a Redis pub/sub channel.

**Files to change:**
- `backend/src/testRunner.js` — coordinator splits the test queue into shards, enqueues N BullMQ jobs
- `backend/src/workers/runWorker.js` — accept `shardIndex` / `shardCount`, run only the assigned slice
- `backend/src/routes/runs.js` — accept optional `shards: number` (default 1, max bounded by `MAX_WORKERS`)
- `backend/src/database/migrations/` — add `shardCount`, `shardsCompleted` columns to `runs`
- `backend/src/utils/redisClient.js` — pub/sub channel for shard coordination + abort propagation
- `frontend/src/components/run/RunRegressionModal.jsx` — `shards` selector (1-N)
- `frontend/src/pages/RunDetail.jsx` — show "shard 2/4 in progress" status

**Dependencies:** INF-002 ✅ (Redis pub/sub for coordinator → shard cancel signal), INF-003 ✅ (BullMQ worker pool primitive). Bounded by available worker slots — sharding 1 run across 4 workers means a co-running shard-less run waits longer for its single slot.

---


### AUTO-003b — Auto-approval provenance & audit trail 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** M | **Source:** Follow-on from AUTO-003 (PR #7 review thread on `review-queue` branch — clear approval ownership for human vs auto)

**Problem:** AUTO-003 ships the *mechanism* (auto-approve above a confidence threshold) but not the *trust contract* around it. Without explicit provenance, an approved test can't tell a reviewer **who** approved it (human vs `auto-approver`), **why** (judgment vs score X above threshold Y), or **how to revoke it**. The first time auto-approval ships a bad test, trust in the entire system collapses unless reviewers can scan a table and see at a glance which approvals were machine-made and one-click reverse them. AUTO-003's scope deliberately stops at "tests above threshold are persisted as `approved` + activity row written" — it does not add the provenance columns, the two-tone badge, the revoke endpoint, or the calibration feedback loop in project settings.

**Fix:**

*Data model — combine into the AUTO-003 migration if it hasn't shipped, otherwise new migration. Critical: persist `approvalThreshold` at decision time, not just a flag, so the audit can flag historical approvals that would no longer pass after a threshold raise.*

```sql
ALTER TABLE tests ADD COLUMN approvalSource TEXT;     -- 'human' | 'auto' | null
ALTER TABLE tests ADD COLUMN approvalThreshold REAL;  -- threshold value at decision time
ALTER TABLE tests ADD COLUMN approvedAt INTEGER;      -- epoch ms
ALTER TABLE tests ADD COLUMN approvedBy TEXT;         -- userId or 'auto-approver'
```

*Backend:*
- Populate the four provenance columns on every approval path (auto + human) in `backend/src/pipeline/testPersistence.js`.
- Write one `activities` row per auto-approval (`userName: "auto-approver"`, `meta: { score, threshold }`). No batching.
- New `GET /api/v1/projects/:id/approval-stats` — counts (human / auto / draft) + 7-day revert rate for the calibration line.
- New `POST /api/v1/tests/:id/revoke` — moves an approved test (auto or human) back to `draft`, writes an activity row, clears `approvedAt` / `approvedBy`. Register both routes in `permissions.json`.

*Frontend (the "scannable at table density, never hover-only" rule applies to all of these):*
- `Tests.jsx` — replace the single "Approved" badge with a two-tone column: 🤖 `Auto · 0.91` (purple) vs 👤 `Human · alice` (green) vs 📝 `Draft · 0.62` (amber). ⚠ overlay on auto-approved rows whose first run failed (the calibration safety net). New filter pill row: `All | Human-approved | Auto-approved | Draft`. **Do not** merge auto + human under one green badge.
- `Tests.jsx` "Auto-approved" filter — default sort: lowest confidence first; required column: first-run pass rate; bulk action: "Send back to draft for review".
- `ReviewQueue.jsx` — render a "Last 24h auto-approvals" tray above the draft list when auto-approval is enabled, so reviewers can spot-audit yesterday's auto-batch in 30 seconds.
- Test header (likely `RunDetail.jsx` or `TestDetail.jsx`) — full provenance line + **Revoke to draft** button. Auto: `🤖 Auto-approved · score 0.91 · threshold 0.85 · 2h ago · [Revoke to draft]`. Human: `👤 Approved by @alice · 1d ago · [Revoke to draft]`. **The Revoke button is the single non-negotiable affordance** — auto-approval is only trustworthy if it is reversible in one click.
- `ProjectDetail.jsx` — header aggregate: `24 tests · 18 human · 6 auto · 0 drafts`. Do not clutter per-run rows.
- `Sidebar.jsx` — second badge alongside the draft count: `[3 drafts] [🤖 12 auto today]`. Hiding auto-activity makes the system feel idle when it's working.
- Project Settings (`ProjectQualityCard` post-PR #6) — inline calibration line under the threshold input: `Last 7 days: 42 auto-approved, 3 reverted by humans (7%).` Heuristic surfaced as helper text: <5% → may be too high; 5–10% → healthy; >10% → tighten. First-time enablement guard: one-time modal showing "last 30 generated tests would have been auto-approved at this threshold — sample these before enabling."
- New per-project Approvals timeline: daily groups (`🤖 12 auto-approved (avg score 0.89)` / `👤 @alice approved 3, rejected 1`). Click a batch → expanded list with per-test score, threshold-at-time, and per-test revoke action. Compliance bar: "who approved this test?" must be one click away six months later.

**Files to change:**
- New migration `0NN_test_approval_provenance.sql` — four provenance columns
- `backend/src/pipeline/testPersistence.js` — populate provenance on both approval paths
- New `backend/src/routes/approvalStats.js` (or extend `routes/projects.js`) — `GET /:id/approval-stats`
- `backend/src/routes/tests.js` — `POST /:id/revoke`
- `backend/src/middleware/permissions.json` — register both new routes
- `frontend/src/api.js` — `getApprovalStats(projectId)`, `revokeApproval(testId)`
- `frontend/src/pages/Tests.jsx` — two-tone badge column, source-filter pills, first-run-failed warning
- `frontend/src/pages/ReviewQueue.jsx` — last-24h auto-approval tray
- `frontend/src/pages/ProjectDetail.jsx` — header aggregate counts
- `frontend/src/components/layout/Sidebar.jsx` — second `🤖 N auto today` badge
- `frontend/src/pages/RunDetail.jsx` (or `TestDetail.jsx`) — provenance line + Revoke button
- `frontend/src/components/automation/ProjectQualityCard.jsx` — calibration line + first-time-enable preview modal
- New `frontend/src/pages/ApprovalsTimeline.jsx`
- `backend/tests/auto-approval.test.js` (extend) — provenance persistence, activity row with score+threshold, revoke flow (auto→draft, human→draft), first-run-failed flag in API
- New `frontend/tests/approval-provenance.test.jsx` — filter pill partitions human vs auto, Revoke button hits the right endpoint and updates the row
- `docs/changelog.md` — `### Added` entry once shipped
- `REVIEW.md` — new convention: auto-approval surfaces must show provenance

**Acceptance criteria:**
- Every auto-approval writes an `activities` row with `userName: "auto-approver"`, score, and threshold-at-time.
- The four provenance columns are populated on every approval (auto and human); `approvalThreshold` reflects the value at decision time, not the current project setting.
- `Tests.jsx` visually distinguishes 🤖 Auto / 👤 Human / 📝 Draft in the table without hover.
- Auto-approved tests with a failed first run surface a ⚠ icon in `Tests.jsx` and the auto-approved filter view.
- `POST /tests/:id/revoke` returns the test to `draft` for both auto- and human-approved tests, and writes an activity row.
- Sidebar shows `🤖 N auto today` alongside the draft count when N > 0.
- First-time threshold enablement shows the "would-have-been-approved" preview modal before persisting the setting.

**Anti-patterns to reject in review:** merging auto + human under one "Approved" badge · provenance only on hover/tooltip · silent first-enable with no preview · skipping the activity row · shipping without the Revoke button · hiding the auto-count from the sidebar.

**Dependencies:** AUTO-003 (provides `confidenceScore` + `autoApproveThreshold` that this item builds on)

---

### AUTO-004 — Test impact analysis from git diff / deployment webhook 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive Gap Analysis

**Problem:** Given a git diff or deployment webhook payload, Sentri cannot determine which tests are affected. Mapping `test.sourceUrl` to application routes and correlating with changed files would enable truly intelligent CI/CD — "run only the tests affected by this PR" rather than "run everything on every push."

**Fix:** Accept an optional `changedFiles[]` array on the trigger endpoint. Map changed file paths to application routes using a configurable route-to-file map. Score each test by its `sourceUrl` against affected routes. Return `affectedTests[]` in the trigger response.

**Files to change:**
- `backend/src/routes/trigger.js` — accept `changedFiles` parameter
- New `backend/src/utils/impactAnalyzer.js` — route-to-file mapping and scoring
- `backend/.env.example` — document `ROUTE_MAP_PATH`

**Dependencies:** AUTO-002 (change detection provides the baseline for comparison)

---


### AUTO-008 — Distributed runner across multiple machines 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** XL | **Source:** Competitive Gap Analysis

**Problem:** Current parallelism is 1–10 workers within a single Chromium process on one machine (`testRunner.js:48-67`). For large suites (500+ tests), execution must distribute across multiple machines. BullMQ (INF-003) enables the architectural foundation, but the distributed browser pool is a separate concern.

**Fix:** Extract the browser worker into a standalone, stateless container image. Use BullMQ's worker concurrency model across multiple worker containers. The HTTP server enqueues jobs; any available worker container picks them up. Expose worker count and queue depth on the dashboard.

**Files to change:**
- `backend/src/workers/runWorker.js` — make fully stateless and containerisable
- `docker-compose.yml` — add scalable `worker` service
- `frontend/src/pages/Dashboard.jsx` — worker pool status panel

**Dependencies:** INF-003 (BullMQ), INF-002 (Redis pub/sub for result delivery)

---

### AUTO-009 — Browser code coverage mapping 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive Gap Analysis

**Problem:** There is no way to know what percentage of application code is exercised by the test suite. Playwright supports V8 code coverage via `page.coverage.startJSCoverage()`. This would answer "what percentage of my app is actually tested?"

**Fix:** Optionally enable JS coverage collection per run via `page.coverage.startJSCoverage()` / `stopJSCoverage()`. Aggregate per-URL coverage into a project-level report. Surface on the dashboard as a "Code Coverage" metric alongside pass rate.

**Files to change:**
- `backend/src/runner/executeTest.js` — start/stop coverage collection
- New `backend/src/utils/coverageAggregator.js` — merge per-test coverage data
- `frontend/src/pages/Dashboard.jsx` — code coverage metric card

**Dependencies:** None

---

### AUTO-010 — Root cause analysis and failure clustering 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive Gap Analysis

**Problem:** When 15 tests fail, they often share a root cause (e.g., a login endpoint is down). Sentri reports each failure independently. An autonomous system should cluster failures by shared error pattern, common URL, or common failing selector and report "1 root cause → 15 affected tests." The `defectBreakdown` in `Dashboard.jsx:219-224` categorises by error type but does not cluster by shared cause.

**Fix:** After each run, group failures by shared error message fingerprint, shared `sourceUrl`, and shared failing step selector. Report the top-N clusters with a "likely root cause" label in a Root Cause Summary panel on the run detail page.

**Files to change:**
- New `backend/src/utils/failureClusterer.js` — clustering algorithm
- `backend/src/testRunner.js` — call clusterer on run completion
- `frontend/src/pages/RunDetail.jsx` — Root Cause Summary panel

**Dependencies:** None

---

### AUTO-011 — Historical trend analysis and anomaly detection 🔵 Medium

**Status:** 🔲 Planned | **Effort:** M | **Source:** Competitive Gap Analysis

**Problem:** The dashboard shows a pass/fail trend but never detects anomalies. An autonomous system should alert: "Pass rate dropped 20% in the last 3 runs — likely regression introduced." The only statistical logic is a simple `trendDelta` at `Dashboard.jsx:122-126`.

**Fix:** Implement a lightweight anomaly detector (rolling mean + standard deviation). Alert when pass rate drops more than a configurable threshold (default 15%) versus the prior 5-run baseline. Surface as a warning banner on the dashboard and include in run completion notifications.

**Files to change:**
- New `backend/src/utils/anomalyDetector.js` — rolling baseline analysis
- `backend/src/routes/dashboard.js` — add `anomalyAlert` to dashboard response
- `frontend/src/pages/Dashboard.jsx` — anomaly alert banner

**Dependencies:** FEA-001 (notifications — to fire alerts on detected anomalies)


### AUTO-014 — Test dependency and execution ordering 🔵 Medium

**Status:** 🔲 Planned | **Effort:** M | **Source:** Competitive Gap Analysis

**Problem:** Some tests depend on others (login must pass before checkout can run). Sentri has no concept of test dependencies — tests run in arbitrary order within the parallel pool. A failed login test produces cascading failures with no indication that the root cause is an upstream dependency.

**Fix:** Add an optional `dependsOn: [testId]` field to tests. Before execution, topologically sort the test queue to respect dependencies. If a dependency fails, mark dependent tests as `skipped` rather than running them.

**Files to change:**
- `backend/src/database/migrations/` — add `dependsOn` array to `tests`
- `backend/src/testRunner.js` — topological sort and dependency-aware skip logic
- `frontend/src/pages/TestDetail.jsx` — dependency management UI

**Dependencies:** None

---

### AUTO-015 — Continuous test discovery on deployment events 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive Gap Analysis

**Problem:** Crawling is manually triggered. An autonomous system should watch for deployment events (via webhook) and automatically re-crawl changed pages, generate new tests for new features, and flag removed pages — without any human action.

**Fix:** Extend the CI/CD trigger endpoint to accept a `triggerCrawl: true` flag alongside `changedFiles[]`. When set, initiate a diff-aware crawl (AUTO-002) followed by test generation for changed pages only. Support Vercel and Netlify deployment webhook payloads natively.

**Files to change:**
- `backend/src/routes/trigger.js` — add `triggerCrawl` parameter and deployment event handlers
- `backend/src/crawler.js` — accept target URLs from change diff
- `frontend/src/components/automation/IntegrationSnippets.jsx` — add Vercel and Netlify snippets

**Dependencies:** AUTO-002 (diff-aware crawling), INF-003 (BullMQ for durable crawl jobs)

---

### AUTO-018 — Plugin and extension system 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** XL | **Source:** Competitive Gap Analysis

**Problem:** There is no way to extend Sentri without forking the repository. An autonomous platform should expose hooks for custom assertions, custom healing strategies, custom report formats, and custom notification channels. All integration points are currently hardcoded.

**Fix:** Define a plugin interface: `beforeRun`, `afterStep`, `onFailure`, `onHealAttempt`, `onRunComplete`. Load plugins from a configurable `PLUGINS_DIR`. Ship three first-party plugins as reference implementations: custom Teams notification formatter, custom assertion library, custom HTML report.

**Files to change:**
- New `backend/src/plugins/pluginLoader.js` — discover and register plugins
- `backend/src/testRunner.js` — emit plugin lifecycle hooks
- `backend/src/selfHealing.js` — expose `onHealAttempt` hook
- `backend/.env.example` — document `PLUGINS_DIR`

**Dependencies:** All Phase 3 items (plugin system should wrap stable APIs, not moving targets)


---

### AUTO-020 — Deployment platform integrations (Vercel, Netlify) 🔵 Medium

**Status:** 🔲 Planned | **Effort:** M | **Source:** Competitive Gap Analysis

**Problem:** The CI/CD trigger endpoint is generic, but there are no native integrations with deployment platforms. An autonomous system should trigger tests automatically when a Vercel or Netlify deployment completes, using the preview URL as the test target.

**Fix:** Add dedicated webhook handlers for Vercel (`X-Vercel-Signature`) and Netlify (`X-Netlify-Token`) deploy events. Extract the preview URL from the payload and use it as the run's base URL override. Show a "Last deployment run" badge on the project header.

**Files to change:**
- `backend/src/routes/trigger.js` — Vercel and Netlify webhook handlers with signature verification
- `frontend/src/components/automation/IntegrationCards.jsx` — Vercel and Netlify integration cards
- `backend/.env.example` — document `VERCEL_WEBHOOK_SECRET`, `NETLIFY_WEBHOOK_SECRET`

**Dependencies:** DIF-009 (monitoring mode) or INF-003 (BullMQ) for durable run enqueuing on deploy

---

### AUTO-021 — AI-generated test suite health insights 🔵 Medium

**Status:** 🔲 Planned | **Effort:** S | **Source:** Competitive (BearQ)

**Problem:** The dashboard shows pass rate, MTTR, and defect breakdown, but never explains *why* metrics changed. BearQ positions AI-driven analytics as a differentiator. AUTO-011 (anomaly detection) detects statistical drops but doesn't provide actionable explanations. The existing `feedbackLoop.js:buildQualityAnalytics()` produces rule-based `insights[]` strings (e.g., "N tests failed on URL assertions"), but these are static templates — not AI-generated contextual analysis.

**Fix:** After each run, feed the quality analytics summary (failure categories, flaky tests, healing events, pass rate delta) to the LLM and generate a 3–5 sentence natural-language insight: "Pass rate dropped 12% — 8 of 10 failures share the same login timeout. The auth endpoint may be degraded. Consider checking `/api/auth/login` response times." Surface as an "AI Insights" card on the dashboard and include in run completion notifications.

**Files to change:**
- `backend/src/routes/dashboard.js` — generate and cache AI insight on run completion
- `frontend/src/pages/Dashboard.jsx` — AI Insights card
- `backend/src/testRunner.js` — trigger insight generation after `applyFeedbackLoop()`

**Dependencies:** FEA-001 (notifications — to include insights in failure alerts)

---

## Ongoing Maintenance & Platform Health

*These items are not phase-bounded. Address them incrementally alongside feature work, prioritising MNT-006 (object storage) before any cloud deployment.*

---

### MNT-001 — Vision-based locator healing 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** XL | **Source:** Competitive

**Problem:** The self-healing waterfall uses DOM selectors exclusively (ARIA roles, text content, CSS fallbacks). When the DOM structure changes drastically — a major redesign or component library migration — all strategies can fail simultaneously. Mabl uses screenshot diff + CV-based element finding to heal across structural changes.

**Fix:** Add a vision-based healing strategy as the final fallback in the waterfall. Capture a screenshot of the failing step's expected element area from the baseline, use image similarity (`pixelmatch`) to locate the nearest visual match in the current DOM, and derive a fresh selector from the matched element.

**Files to change:**
- `backend/src/selfHealing.js` — add vision strategy as waterfall stage 7
- `backend/src/runner/executeTest.js` — pass baseline screenshot to healing context

**See also:** MNT-002 — both items extend `selfHealing.js`. MNT-001 handles visual/structural DOM changes (new strategy); MNT-002 handles statistical strategy ordering (ML classifier). They are complementary but fully independent implementations. Coordinate branch timing to avoid merge conflicts.

---

### MNT-002 — Self-healing ML classifier 🟢 Differentiator

**Status:** 🔲 Planned | **Effort:** XL | **Source:** Audit

**Problem:** The healing waterfall is deterministic and rule-based. `STRATEGY_VERSION` invalidates all cached hints when strategies change. Healing history data in `healing_history` is collected but never fed back to improve the system. A lightweight classifier trained on healing events would predict the best strategy per element type, reducing waterfall traversal depth.

**Fix:** Train an offline classifier on `healing_history` events using feature vectors (element type, page URL pattern, last successful strategy, DOM depth). Export the model as a JSON lookup table. Load it at startup. Use it to reorder the waterfall per element rather than always starting at strategy 1.

**Files to change:**
- `backend/src/selfHealing.js` — accept strategy ordering hint from classifier
- New `backend/src/ml/healingClassifier.js` — model loader and inference
- New `scripts/train-healing-model.js` — offline training script from `healing_history` data

**See also:** MNT-001 — both items extend `selfHealing.js`. MNT-002 handles statistical strategy selection; MNT-001 handles visual DOM changes. They are complementary and can be developed independently on separate branches.

---

### MNT-003 — Prompt A/B testing framework 🔵 Medium

**Status:** 🔲 Planned | **Effort:** L | **Source:** Audit

**Problem:** `promptVersion` is stored on tests but there is no system to compare prompt versions, run controlled experiments, or automatically promote better prompts. AI quality improvements are made by intuition rather than measurement.

**Fix:** Add a `promptExperiments` table. Tag each generation with the active experiment and variant. Compute quality metrics (validation pass rate, healing rate, approval rate) per variant. Add an Experiments view in Settings to review results and promote a winning variant.

**Files to change:**
- `backend/src/pipeline/journeyGenerator.js` — tag generation with experiment variant
- New `backend/src/pipeline/promptEval.js` — metric computation per variant
- `frontend/src/pages/Settings.jsx` — Experiments tab

---

### MNT-004 — Test data management (fixtures and factories) 🔵 Medium

**Status:** 🔲 Planned | **Effort:** L | **Source:** Competitive

**Problem:** Tests that require specific data states (a logged-in user with specific records, a product at a specific price) have no supported setup/teardown mechanism. This limits the depth of user journeys Sentri can test autonomously.

**Fix:** Add a `fixtures` block to test config: a list of API calls or SQL statements to execute before the test and teardown statements to run after. Expose `beforeTest` / `afterTest` hooks in `executeTest.js`.

**Files to change:**
- New `backend/src/utils/testDataFactory.js` — fixture execution engine
- `backend/src/runner/executeTest.js` — call `beforeTest`/`afterTest` hooks
- `backend/src/pipeline/stateExplorer.js` — declare required state for generated tests

---

### MNT-005 — BDD / Gherkin export format 🔵 Medium

**Status:** 🔲 Planned | **Effort:** M | **Source:** Competitive

**Problem:** Enterprise teams using behaviour-driven development (Cucumber, SpecFlow) cannot use Sentri's output directly. SmartBear's BDD format is widely adopted in enterprise QA. Adding a Gherkin export alongside the existing Zephyr/TestRail CSV exports would broaden enterprise appeal.

**Fix:** Add `buildGherkinFeature(test)` to `exportFormats.js`. Map test steps to `Given` / `When` / `Then` blocks using the step intent classifier data already produced by the pipeline. Add a "Export as Gherkin" option to the Tests page export menu.

**Files to change:**
- `backend/src/utils/exportFormats.js` — add Gherkin builder
- `backend/src/routes/tests.js` — `GET /projects/:id/export/gherkin`
- `frontend/src/pages/Tests.jsx` — Gherkin export option

**See also:** DIF-006 (Playwright export) — both extend `exportFormats.js`. Develop in the same or consecutive sprints to share export ZIP packaging scaffolding.

---

### MNT-008 — ESLint + Prettier enforcement in CI 🔵 Medium

**Status:** 🔲 Planned | **Effort:** M | **Source:** Quality Review (PRD-04)

**Problem:** The codebase has no linting or formatting enforcement. Code style varies across files. New contributors receive no automated style feedback, increasing review friction and producing noisy diffs.

**Fix:** Add ESLint (flat config) with `@eslint/js` recommended + `eslint-plugin-react`. Add Prettier with a `.prettierrc` matching the existing dominant code style. Add `npm run lint` to the CI pipeline. Apply auto-fix formatting as a single dedicated commit.

**Files to change:**
- `backend/eslint.config.js`, `frontend/eslint.config.js` — ESLint configurations
- `.prettierrc` — Prettier config
- `.github/workflows/ci.yml` — add lint step
- `backend/package.json`, `frontend/package.json` — add dev dependencies

---

## Competitive Gap Analysis

> **Note:** The SmartBear column reflects both their legacy portfolio (TestComplete, ReadyAPI)
> and the new **BearQ** AI-native platform (early access — https://smartbear.com/product/bearq/early-access/).
> BearQ significantly changes SmartBear's competitive position; capabilities marked with † are BearQ-specific.

| Capability | Sentri | Mabl | Testim | SmartBear / BearQ | Playwright OSS |
|---|---|---|---|---|---|
| AI test generation | ✅ 8-stage pipeline | ✅ Auto-heal only | ✅ AI recorder | ✅ BearQ AI generation † | ❌ Manual |
| Interactive recorder | ✅ DIF-015 | ✅ | ✅ | ✅ BearQ recorder † | Via codegen |
| Self-healing selectors | ✅ Multi-strategy waterfall | ✅ ML-based | ✅ Smart locators | ✅ BearQ AI healing † | ❌ |
| AI auto-repair on failure | ✅ Feedback loop | ✅ | ✅ | ✅ BearQ † | ❌ |
| Human review queue | ✅ Draft → Approve flow | ❌ | ❌ | ❌ | ❌ |
| NL test editing | ✅ AI chat + fix | ❌ | ❌ | ✅ BearQ NL input † | ❌ |
| API test generation | ✅ HAR-based auto-gen | ✅ | ❌ | ✅ ReadyAPI | ✅ Manual |
| Scheduled runs | ✅ Cron + timezone | ✅ | ✅ | ✅ | Via CI cron |
| CI/CD integration | ✅ Webhook + token auth | ✅ Native | ✅ Native | ✅ Native | ✅ CLI |
| Self-hosted / private | ✅ Docker | ❌ SaaS only | ❌ SaaS only | Partial | ✅ |
| Multi-provider LLM | ✅ Anthropic/OpenAI/Google/OpenRouter/Ollama | ❌ | ❌ | ❌ | ❌ |
| Parallel execution | ✅ 1–10 workers | ✅ Cloud | ✅ Cloud | ✅ Cloud | ✅ CLI sharding |
| Visual regression | ✅ DIF-001 | ✅ Native | ✅ Native | ✅ VisualTest | Via plugins |
| Cross-browser | ✅ DIF-002 | ✅ Chrome+Firefox | ✅ Chrome+Firefox | ✅ All | ✅ All 3 |
| Mobile / device emulation | ✅ DIF-003 | ✅ | ✅ | ✅ | ✅ Native |
| Failure notifications | ✅ Teams/email/webhook | ✅ Slack/email | ✅ Slack/email | ✅ | N/A |
| Multi-tenancy / RBAC | ✅ ACL-001/ACL-002 | ✅ | ✅ | ✅ | N/A |
| Standalone export | ✅ DIF-006 | ❌ Lock-in | ❌ Lock-in | ❌ Lock-in | N/A |
| Flaky test detection | ✅ DIF-004 | ✅ | ✅ | ✅ | ❌ |
| Risk-based test selection | ❌ → AUTO-001 | ✅ | Partial | ✅ BearQ smart selection † | ❌ |
| Accessibility testing | ✅ (backend) / 🔄 AUTO-016b (UI) | ✅ | ❌ | Partial | Via plugins |
| Performance budgets | ❌ → AUTO-017 | ❌ | ❌ | Via Lighthouse | ❌ |
| Quality gate enforcement | ✅ AUTO-012 (PR #2) | ✅ | ✅ | ✅ | Via Playwright |

**Sentri's unique strengths:** Self-hosted + AI generation + human review queue + multi-provider LLM + standalone Playwright export (✅ DIF-006). No competitor offers all five together. BearQ narrows the AI generation gap but remains SaaS-only with no self-hosted option or LLM provider choice.

**Critical gaps to close next:** AUTO-003 + AUTO-003b (auto-approval + provenance — current PR) · AUTO-002 (change detection) · AUTO-001 (risk-based test selection) · INT-002 (GitHub PR check comments)

> **Previous priorities ✅ shipped:** DIF-001 · DIF-002/002b · DIF-003 · DIF-004 · DIF-005 · DIF-006 · DIF-007 · DIF-011 · DIF-013 · DIF-014 · DIF-015 · DIF-015b · DIF-016 · AUTO-005/006/007/012/013/016/016b/017/019 · CAP-003 · CAP-004 · MET-001 · PROC-002 · UI-REFACTOR-001.

---

## Summary

| Category | Total | ✅ Done | 🔄 In Progress | 🔲 Pending | Remaining |
|----------|------:|--------:|---------------:|----------:|-----------|
| Security & Compliance | 5 | 3 | 0 | 2 | SEC-004, SEC-005 |
| Infrastructure | 6 | 6 | 0 | 0 | — |
| Access Control | 2 | 2 | 0 | 0 | — |
| Platform Features | 4 | 4 | 0 | 0 | — |
| Differentiators | 22 | 16 | 0 | 6 | DIF-002c, 008, 009, 010, 012, 015c (sub-gaps 2–6) |
| Autonomous Intelligence | 26 | 12 | 0 | 14 | AUTO-001/002/003/003b/004/008–011/014/015/018/020/021/022; CAP-001, CAP-002 |
| Capabilities | 4 | 2 | 0 | 2 | CAP-001 (data-driven testing), CAP-002 (test sharding) |
| Process automation | 3 | 3 | 0 | 0 | — |
| Maintenance | 11 | 5 | 0 | 6 | MNT-001/002/003/004/005/008 |
| **Totals** | **83** | **53** | **0** | **30** | |

**Total tracked items:** 83 across 9 categories — **51 complete** (61%), **0 in current PR**, **32 remaining**

**Blockers (must ship before team deployment):** All resolved. ✅

**Recommended PR order (next after current bundle ships):**
`AUTO-003` + `AUTO-003b` (auto-approval mechanism + trust contract — they're the last missing piece of the "autonomous" positioning) → `AUTO-002` (change-detection; hard prerequisite for AUTO-001 and AUTO-004) → `AUTO-001` (risk-based test selection — the narrative capstone for Phase 4).

**Lowest effort / highest immediate value after the current bundle:**
`INT-002` (M — GitHub PR check comments) · `DIF-012` (L — multi-environment, high enterprise-demand) · `MNT-004` (L — fixtures, complements CAP-001).

---

## Contributing

Before starting any item:

1. Open a GitHub Issue referencing the item ID (e.g., `SEC-001`, `DIF-006`)
2. Assign yourself and add to the current sprint milestone
3. Create a branch named `feat/SEC-001-email-verification` or `fix/INF-002-redis-sse`
4. Reference the issue in your PR description
5. Update the item's **Status** in this file (`🔲 Planned` → `🔄 In Progress` → `✅ Complete`) in the same PR
6. Add an entry to `docs/changelog.md` under `## [Unreleased]` following the Keep a Changelog format

For items with explicit **See also** cross-references (MNT-001/MNT-002, DIF-006/MNT-005), coordinate branch timing in sprint planning to avoid merge conflicts on shared files (`selfHealing.js`, `exportFormats.js`).
