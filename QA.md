# Manual QA Guide — Sentri

## 🎯 Purpose

This document is for **manual testers** to validate all functional flows in Sentri before release.

It has two layers:

1. **Golden E2E Happy Path** (must-pass) — one stitched-together user journey that exercises every core feature end-to-end. If any step fails, **stop the release**.
2. **Per-feature happy paths + negatives** — targeted checks per area for full coverage.

> ℹ️ Values are grounded in `README.md`, `AGENT.md`, `ROADMAP.md`, `docs/changelog.md`, `backend/src/routes/testFix.js`, `backend/src/pipeline/feedbackLoop.js`, `backend/src/utils/notifications.js`. `TBD` items require engineering confirmation.

---

## 🤖 For agents — read this first

This file is ~1000 lines. **Do not read it top-to-bottom.** Use the index below to jump directly to the section you need, read only that section, then stop.

### Intent → section map

If the user asks for… read only this section:

| User intent | Section (anchor) | Lines |
|---|---|---|
| "Run / write all happy paths" | [Golden E2E Happy Path](#-golden-e2e-happy-path-must-pass-before-release) | 240–339 |
| "Write Playwright tests for the deployed app" | [Canonical UI test shape](#canonical-ui-test-shape--emit-this-by-default) + [Tests Page §3](#-tests-page) | 94–108, 418–453 |
| "Write an API test" | [Tests Page §4](#-tests-page) + [API Test Imports](#-api-test-imports-openapi-har-plain-english-api) | 418–453, 943–958 |
| "Fix a failing test" | [AI Fix](#-ai-fix-failed-test-recovery) | 521–543 |
| "Record a test" | [Recorder](#-recorder) | 457–491 |
| "Run tests / regression" | [Runs](#%EF%B8%8F-runs) | 495–517 |
| "Edit test code / steps" | [Test Code Editing](#%EF%B8%8F-test-code-editing-steps--source) | 547–575 |
| "Schedule / trigger from CI" | [Automation](#-automation-cicd--scheduled-runs) | 579–602 |
| "Visual / screenshot testing" | [Visual Testing](#%EF%B8%8F-visual-testing) | 606–622 |
| "Verify permissions" | [`permissions.json`](./backend/src/middleware/permissions.json) **(canonical, read this, not prose)** | — |
| "Verify security / authorization" | [Security](#-security) | 783–810 |
| "Bulk actions / keyboard shortcuts" | [Bulk Actions](#%EF%B8%8F-bulk-actions--keyboard-shortcuts) | 890–917 |
| "Report a bug" | [Bug Reporting Template](#-bug-reporting-template) | 1065–1098 |

### Section index (line ranges, for `sed -n 'A,Bp'` / partial reads)

```yaml
# Feature sections
authentication:      { lines: 353-376 }
workspaces:          { lines: 379-395 }
projects:            { lines: 399-414 }
tests-page:          { lines: 418-453 }
recorder:            { lines: 457-491 }
runs:                { lines: 495-517 }
ai-fix:              { lines: 521-543 }
test-code-editing:   { lines: 547-575 }
automation:          { lines: 579-602 }
visual-testing:      { lines: 606-622 }
dashboard:           { lines: 626-642 }
ai-chat:             { lines: 646-675 }
settings:            { lines: 679-696 }
account-gdpr:        { lines: 700-709 }
email-verification:  { lines: 713-720 }
recycle-bin:         { lines: 724-733 }
audit-log:           { lines: 737-745 }
notifications:       { lines: 749-779 }
security:            { lines: 783-810 }
reports-pdf:         { lines: 814-829 }
system-diagnostics:  { lines: 833-842 }
new-project:         { lines: 846-857 }
runs-list:           { lines: 861-871 }
project-detail:      { lines: 875-886 }
bulk-actions:        { lines: 890-917 }
modals:              { lines: 921-939 }
api-test-imports:    { lines: 943-958 }
onboarding:          { lines: 962-971 }
demo-mode:           { lines: 975-986 }
settings-data-tab:   { lines: 990-1004 }
workspace-switcher:  { lines: 1008-1016 }

# Meta sections
golden-happy-path:       { lines: 240-339 }
canonical-ui-test-shape: { lines: 94-108 }
permissions-matrix:      { lines: 151-199 }
setup:                   { lines: 203-237 }
cross-cutting-checks:    { lines: 1020-1046 }
known-issues:            { lines: 1050-1061 }
bug-template:            { lines: 1065-1098 }
coverage-checklist:      { lines: 1102-1146 }
```

> **Read-only boundary:** line ranges are approximate and can drift ±5 lines after edits — always stop at the next `### ` heading. Don't read beyond the listed range for a given section.

> ⚠️ **Agents generating Playwright tests for Sentri: read this.**
> Sentri's primary output is **UI / browser tests** that drive a real browser via `await page.goto(...)`, role-based selectors (`getByRole` / `getByLabel` / `getByText`), `safeClick` / `safeFill`, and `expect(page....)` assertions on rendered DOM.
> API tests using `request.fetch` / `request.get` / `request.post` are an **additional, secondary** output — only valid when same-origin fetch/XHR was captured during a crawl, or the user explicitly asked for an API test (OpenAPI / HAR / `METHOD /path`).
> **If you emit only `request.*` tests when asked for "Playwright tests for Sentri", you have misread this guide.** Default to UI tests unless the user explicitly says "API test".

#### Canonical UI test shape — emit this by default

```js
test('user can log in', async ({ page }) => {
  await page.goto('https://rameshbabuprudhvi.github.io/sentri/login');
  await safeFill(page.getByLabel('Email'), 'user@example.test');
  await safeFill(page.getByLabel('Password'), 'pw');
  await safeClick(page.getByRole('button', { name: 'Sign in' }));
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('heading', { name: /workspace/i })).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
});
```

No `import` lines. No `request.fetch` / `request.get` / `request.post`. Role-based selectors. ≥ 3 `expect(page....)` assertions on visible UI state.

**When adding a new user-facing flow** (per [REVIEW.md](./REVIEW.md)):
1. Add a section here under "Functional Test Areas".
2. Add a step (or sub-section) in the Golden E2E Happy Path if it belongs in the must-pass journey.
3. Add a row to the Coverage Checklist.
4. If the flow has a new endpoint, add it to [`backend/src/middleware/permissions.json`](./backend/src/middleware/permissions.json).
5. Cite the source file/line for any role-gated or behavior claim.

**When verifying a permissions claim:** read [`backend/src/middleware/permissions.json`](./backend/src/middleware/permissions.json), not the markdown matrix below — the JSON is the canonical machine-readable form. The markdown table mirrors it for humans.

> **Automated coverage:** This manual plan is the human baseline. Automated E2E specs live under [`tests/e2e/specs/`](./tests/e2e/specs/); the per-step automation matrix is at [`tests/e2e/COVERAGE.md`](./tests/e2e/COVERAGE.md) — check that first to see which Golden E2E steps and per-feature flows are already ✅ automated vs. still 🟥 manual-only. Sections already covered by automation should be tagged `_(automated: see tests/e2e/COVERAGE.md row …)_` — manual testers may skip those during release sign-off. When you add an automated test, update the matching `QA.md` section AND flip the row in `tests/e2e/COVERAGE.md`.

---

## 🧪 How to Test

- Browser matrix (all required):
  - Chrome (latest) — primary
  - Firefox (latest)
  - Safari (latest, macOS)
  - Edge (latest)
- Do NOT call APIs directly unless debugging a failure.
- Test like an end user: click flows, navigate, refresh mid-flow, use back/forward, open links in new tabs.
- Keep DevTools open. Capture **console errors**, **network 4xx/5xx**, and **failed assets** for every bug.
- Run state-sensitive flows twice: once as a fresh user, once as a returning user.

---

## 👤 Test Accounts & Roles

Sentri defines three workspace roles (see `ROADMAP.md` ACL-002, stored in `workspace_members.role`): `admin`, `qa_lead`, `viewer`.

| Account | Role | Workspace | Purpose |
|---------|------|-----------|---------|
| User A | `admin` | WS-1 | Full-permission flows, settings, destructive ops |
| User B | `qa_lead` | WS-1 | Day-to-day QA flows (tests, runs) |
| User C | `viewer` | WS-1 | Read-only enforcement |
| User D | — (no membership) | — | Cross-workspace isolation |

- Use separate browsers / incognito windows per user.
- Never share auth cookies between users.

### Permissions Matrix (expected)

Verified against `requireRole(...)` declarations in `backend/src/routes/*.js` and `backend/src/middleware/requireRole.js` (hierarchy: `admin > qa_lead > viewer`). `admin` gates settings + destructive ops; `qa_lead` runs QA workflows; `viewer` is read-only. Source cited per row — if behavior diverges from this table, file a **severe security bug**.

**admin-only actions:**

| Action | Source |
|---|---|
| Edit workspace (rename, settings) | `routes/workspaces.js:44` |
| Invite / change-role / remove members | `routes/workspaces.js:134, 168, 196` |
| AI provider settings (`/settings`) | `routes/settings.js:48, 53, 130` |
| Settings → Data destructive clears (runs / activities / healing) | `routes/system.js:193, 200, 205` |
| **Delete project** | `routes/projects.js:84` |
| **Purge from recycle bin** (permanent) | `routes/recycleBin.js:132` |
| **Create / revoke CI/CD trigger token** | `routes/runs.js:379, 411` |

**qa_lead or admin (qa_lead-gated):**

| Action | Source |
|---|---|
| Create project | `routes/projects.js:46` |
| Test connection (New Project) | `routes/system.js:48` |
| Restore from recycle bin (soft-undelete) | `routes/recycleBin.js:54` |
| Crawl project | `routes/runs.js:46` |
| Create / Edit / Delete tests | `routes/tests.js:97, 318, 364` |
| Generate tests / Record / AI Fix / Apply Fix | `routes/tests.js:382, 858`; `routes/testFix.js:152, 273` |
| Approve / Reject (single + bulk) | `routes/tests.js:538, 555, 589` |
| Trigger run (project regression + single test) | `routes/runs.js:134`; `routes/tests.js:487` |
| **Abort / stop run** — note: code has **no "own-runs only" restriction**, any qa_lead can stop any run | `routes/runs.js:257` |
| Accept visual baseline | `routes/tests.js:751` |
| Set / edit / delete cron schedule | `routes/projects.js:162, 222` |
| Edit per-project notification settings | `routes/projects.js:266` |

**Any authenticated workspace member (no `requireRole`):**

| Action | Notes |
|---|---|
| View dashboard / runs / tests / reports / projects pages | Workspace scope still enforced — outsiders blocked |
| Account export / delete (own account, GDPR) | Password-confirmed; not workspace-scoped |
| Switch workspace | Via switcher; role re-resolved from DB on every request (ACL-001/002) |

**Always denied (cross-workspace isolation):**

| Action |
|---|
| Access another workspace's data via URL or API |
| Outsider (no `workspace_members` row) accessing any workspace resource |

> ⚠️ **Note on workspace create/delete:** the `POST/DELETE /api/workspaces/...` endpoints for creating/destroying entire workspaces are out of the scope captured here. Verify behavior against the running build and update this table if found.

---

## ⚙️ Setup

From `README.md`:

```bash
# Backend (port 3001)
cd backend
npm install
npx playwright install chromium ffmpeg
cp .env.example .env            # Add at least one AI provider key
npm run dev

# Frontend (port 3000, proxies /api → :3001)
cd frontend
npm install
cp .env.example .env
npm run dev
```

Then:
1. Confirm backend `GET http://localhost:3001/health` returns `200`.
2. Open `http://localhost:3000`.
3. Record exact build / commit SHA under test (include in every bug report).
4. Note environment: local / staging / preview URL.
5. Dev-only seed endpoint is available when `NODE_ENV !== production` (see `AGENT.md`). Use it to pre-populate users/workspaces; otherwise register via UI.

**Test data to prepare:**
- Stable crawl target URLs (from `frontend/src/demo.js` and CI):
  - `https://demo-shop.example.com` (E-Commerce demo)
  - `https://admin.example.com` (Admin Dashboard demo)
  - `https://www.example.com` (Marketing Site demo / CI default — `.github/workflows/ci.yml`)
  - These use IANA-reserved `example.com` subdomains; they will not actually crawl real content but are deterministic for create-project / connection-test flows. For real crawl/run testing, point at a site you control.
- Sample regression suite: ≥ 5 tests, mix of passing/failing
- Sample baseline images: at least one stable, one with intentional diff

---

## 🌟 Golden E2E Happy Path (must-pass before release)

Run this single end-to-end journey **as User A (admin)** in a fresh browser. Every numbered step must pass. If any fails, log a Blocker bug and stop.

**Preconditions:** Backend + frontend running; one AI provider key configured; mail transport (Resend / SMTP / console) reachable; clean DB or fresh workspace.

### 1. Auth — register & verify
1. Register `usera@example.test` with a strong password.
2. Verification email arrives (or appears in console fallback). Click the link.
3. Login → land on dashboard for the auto-created workspace.

### 2. Workspace — invite collaborator
4. Invite `userb@example.test` as `qa_lead`. Open invite link in incognito → User B accepts and lands in WS-1.

### 3. Project — create
5. As User A, create project **"PRJ-Demo"** with a real URL you control (or `https://www.example.com` for the create-project + connection-test flow only — `example.com` won't yield meaningful crawl results). Project appears in the list and as `?project=PRJ-Demo` deep-link target.

### 4. Discover — crawl the app
6. Trigger **Link Crawl** → progress visible; pages discovered; same-origin fetch/XHR captured.
7. Trigger **State Exploration** crawl on the same project → multi-step flows discovered (forms submitted, auth flows entered).
### 5. Generate — AI tests
8. Click **Generate** → 8-stage pipeline runs (discover → filter → classify → plan → generate → deduplicate → enhance → validate). New tests land in **Draft** queue, not auto-approved.
9. Verify **both test types** were produced — Sentri generates **UI / browser tests by default**; API tests are an additional output:
   - **UI / browser test (primary)** — uses `await page.goto(...)`, role-based selectors (`getByRole` / `getByLabel` / `getByText`), `safeClick` / `safeFill`, and ≥ 3 `expect(...)` assertions on visible UI state. Drives a real browser. **No `request.` / `request.fetch` / `request.get` calls.**
   - **API test (only if same-origin fetch/XHR was captured)** — Playwright `request` test asserting status + JSON shape.
   If only API tests appear, the crawl did not discover UI flows — re-run **State Exploration** and regenerate.


### 6. Record — manual recorder
10. Click **Record a test** → Playwright browser opens via CDP screencast.
11. Perform: click, fill, press, select, navigate. Stop.
12. New Draft test appears with `safeClick` / `safeFill` calls and per-step entries.

### 7. Review — approve / reject
13. Open a Draft → review steps **and** Playwright code via the **Steps / Source toggle** on TestDetail.
14. Reject one obviously bad test → archived, excluded from regression.
15. Approve at least 3 tests → moved to active suite.

### 8. Edit — verify auto-generated Playwright code
16. Open an approved test → switch to **Source** tab → confirm code uses role-based selectors (`getByRole`, `getByLabel`, `getByText`), starts with `await page.goto(...)`, has ≥ 3 `expect(...)` assertions, no `import` lines (`backend/src/routes/tests.js:218-224`).
17. Edit a step (rename a button, add a step) → save → **diff/preview panel** appears showing only the changed lines, **not** a full rewrite (`backend/src/routes/tests.js:160-198`).
18. Accept the diff → `playwrightCode` updated, `playwrightCodePrev` retained, `codeRegeneratedAt` set.
19. Discard a different diff → original code preserved.

### 9. Run — execute regression
20. Trigger regression with **parallelism = 3**, browser = **Chromium**, device = desktop. RunDetail opens with live SSE log stream.
21. Watch per-step screenshots and step-timing waterfall update (`docs/changelog.md` DIF-016).
22. Run completes → mix of pass/fail expected with at least one intentional failure (use a known-bad test or temporarily break a selector).

### 10. AI Fix — fix the failure
23. On a failed test in TestDetail, click **"Fix with AI"** (visible only when `lastResult === "failed"` and `playwrightCode` exists, `frontend/src/pages/TestDetail.jsx:411-426`).
24. SSE stream from `POST /api/v1/tests/:testId/fix` shows incremental tokens; final fixed code appears in the fix panel.
25. Accept the fix → test goes back to **Draft** for re-review (auto-fix never silently re-approves; `backend/src/pipeline/feedbackLoop.js:481-490`).
26. Re-approve the fixed test → re-run **only failed tests** → all pass.

### 11. Visual baseline
27. Run a test with a screenshot step twice → first run creates baseline under `artifacts/baselines/`, second run produces diff = 0.
28. Change something visible on the target → re-run → diff PNG appears at `artifacts/diffs/`, run flagged as visual regression when diff > `VISUAL_DIFF_THRESHOLD` (0.02).
29. Click **Accept visual changes** → baseline updated; subsequent run passes.

### 12. Run results, artifacts & reports
30. On RunDetail verify: per-test status, per-step screenshots, per-step timing, video, network logs, browser badge, parallelism used.
31. Download/inspect artifacts (screenshots, video, trace zip) — files exist and open. **🔍 Open Trace** (DIF-005, #9): on a run with a captured trace, click the **Open Trace** action on RunDetail → a new browser tab opens at `/trace-viewer/?trace=<signed-url>` and loads Playwright's embedded trace viewer with the run's trace pre-loaded; verify the viewer's timeline / actions / network panels render. The Trace ZIP download link continues to work alongside as a fallback (served from `backend/public/trace-viewer/` via `backend/src/middleware/appSetup.js`).
31a. **Compare runs** (AUTO-019, #10) — on a project with ≥ 2 completed test runs, open the newer RunDetail and click the **Compare** action in the header. The page renders a comparison card with summary chips (`Flipped: N · Added: N · Removed: N · Unchanged: N`) and per-test diff rows showing each test's `currentStatus` vs `previousStatus` with a `flipped` / `added` / `removed` / `unchanged` change-type badge (`backend/src/routes/runs.js` `GET /api/v1/runs/:runId/compare/:otherRunId`; `frontend/src/components/run/RunCompareView.jsx`). When > 1 prior test run exists, a `Compare against:` `<select>` picker appears above the card — switching the picker re-fetches the diff against the chosen run. The default target is the chronological predecessor (run immediately before the current one). The Compare action is suppressed for crawl and generate runs. Negative checks: outsider hitting `/api/v1/runs/:runId/compare/:otherRunId` for another workspace's runs → 404; unknown `otherRunId` → 404; no auth token → 401.
32. Open **`/reports`** page → renders run/test reports for the workspace.
33. From Dashboard, export the **executive PDF report** → file downloads, opens, contains pass-rate / defect breakdown / trends matching on-screen widgets.
34. **Out of scope (planned, not shipped):** public/shareable report links. Do not test these. Standalone Playwright project export (`DIF-006`) and the embedded Playwright trace viewer (`DIF-005`) **are** shipped — DIF-006 has its own line item under "Export & traceability" below; DIF-005 is verified inline at step 31 above.

### 13. Notifications
35. Configure Teams + email + generic webhook for PRJ-Demo. Trigger a failing run → notification arrives on each enabled channel within ~1 min, with project / test / runId / failure reason / link.

### 14. Automation (CI/CD)
36. Create a trigger token → plaintext shown **once**.
37. `POST /api/projects/PRJ-Demo/trigger` with `Authorization: Bearer <token>` → returns **202** with `{ runId, statusUrl }`. Poll `statusUrl`; final state matches RunDetail.
38. Set a cron schedule for "every minute" → wait → run fires automatically; disable schedule.

### 15. Export & traceability
39. Export tests as **Zephyr CSV** and **TestRail CSV** → non-empty files, correct headers.
40. Open **Traceability matrix** → maps tests ↔ source URLs / requirements.
41. **Standalone Playwright project ZIP** (DIF-006) — `GET /api/v1/projects/:id/export/playwright` → ZIP downloads with `Content-Type: application/zip`, contains `package.json`, `playwright.config.ts` (with `baseURL` from project), `README.md`, and one `tests/<slug>.spec.ts` per **approved** test (drafts and rejected tests excluded). Unzip, `npm install`, `npx playwright test` runs the suite without modification.

### 16. AI Chat
42. Open `/chat`. Ask: "How many tests failed in the last run?" → matches RunDetail.
43. Ask: "Why did test X fail?" in same session → multi-turn context preserved; answer references actual logs.
44. Export the session as Markdown and JSON.

### 17. Dashboard
45. Open Dashboard → pass-rate, defect breakdown, flaky detection, MTTR, growth trends all populated and match RunDetail / Tests source-of-truth counts.

### 18. Recycle bin & audit
46. Delete a test → it appears in **Settings → Recycle Bin**. Restore it → reappears in active list with steps intact.
47. Open **Audit Log** → every approve/reject/run/fix/restore action above is recorded with `userId` + `userName`.

### 19. Account / GDPR
48. Settings → Account → **Export account data** (password-confirmed) → JSON downloads with workspaces/projects/tests/runs/activities/schedules/notification settings.
49. Two-click **Delete account** with 5s auto-disarm → account gone; subsequent login fails.

### 20. Permissions sanity (negative)
50. As User C (`viewer`), confirm: cannot create/edit/delete projects, cannot trigger runs, cannot accept baselines, cannot create trigger tokens or schedules. Each blocked action returns 403, not a silent no-op.
51. As User D (outsider), confirm: any direct URL or API request for WS-1 resources returns 403, never empty 200.

> ✅ **Pass criterion:** all 51 steps green. Any failure = release blocker.

---

## ✅ Functional Test Areas

Each area uses this format:
- **Preconditions** — required state before testing
- **Steps** — actions to perform
- **Expected** — measurable pass criteria
- **Negative / edge cases** — must also pass

---

### 🔐 Authentication

_(automated: see `tests/e2e/specs/ui-smoke.spec.mjs` for login negative path + verified login redirect to `/dashboard`, and `tests/e2e/specs/project-create-ui.spec.mjs` for §3 step 5 (project create via `/projects/new` form). Coverage tracked in `tests/e2e/COVERAGE.md`; verified-login happy path remains pending until CI turns that row ✅.)_

**Preconditions:** Logged out, fresh incognito window.

**Happy path:**
1. Register new user with valid email + strong password.
   - **Expected:** Verification email arrives within 60s; UI shows "verify email" state.
2. Click verification link.
   - **Expected:** Account marked verified; redirects to onboarding/dashboard.
3. Logout, then login.
   - **Expected:** Session cookie set; lands on last-visited workspace.
4. Forgot password → reset link → set new password.
   - **Expected:** Old password rejected; new password works; reset link is single-use.

**Negative / edge:**
- Wrong password → generic error (no user enumeration); auth endpoints rate-limited to **5–10 requests / 15 min per IP** (`README.md` security table). Hammer the endpoint and confirm 429.
- Expired verification link → clear error, option to resend.
- Expired / reused password reset link → rejected.
- Weak password → blocked at form level with reason.
- Register with already-used email → generic error (no enumeration).
- Session expiry mid-flow → redirected to login, returns to original page after re-auth.
- Two concurrent sessions (browser A + B) → both work; logout in A does not invalidate B unless "logout all" is used.
- Tampered JWT / cookie → 401; UI redirects to login.

---

### 👥 Workspaces

**Preconditions:** User A logged in.

**Steps & expected:**
1. Create workspace "WS-Test" → appears in switcher; User A is Owner.
2. Switch workspaces → URL updates, data scoped correctly, no leakage from previous workspace.
3. Invite User B by email → invite email arrives; pending state visible to Admin.
4. User B accepts → appears in member list with assigned role.
5. Change User B's role `qa_lead` → `viewer` → permissions update **without requiring relogin** (role is re-resolved from DB on every request, ACL-001/002).
6. Remove User B → active session loses access on next request (≤ 60s).

**Negative / edge:**
- User B (`qa_lead`) tries to invite users → blocked (admin-only, `routes/workspaces.js:134`).
- Outsider opens workspace URL directly → 403 / redirect, not 200 with empty data.
- Duplicate invite → handled gracefully.
- Invite to non-existent email → still sends (or clear UX); no crash.

---

### 📁 Projects

**Preconditions:** Workspace exists.

**Steps & expected:**
1. Create project (`qa_lead` or `admin`, `routes/projects.js:46`) → appears in list; slug/URL unique.
2. **Edit project** (ENH-036, `qa_lead` or `admin`, `routes/projects.js:96` — `PATCH /api/v1/projects/:id`):
   - Click the pencil-icon button on a project card in `/projects` → routes to `/projects/new?edit=<id>` with name/URL pre-filled.
   - Auth toggle reflects whether credentials are configured server-side; password fields render `"•••••• (saved — leave blank to keep)"` placeholder.
   - Change the name and URL only → save → server merges with existing encrypted `username`/`password` and legacy `usernameSelector`/`passwordSelector`/`submitSelector` (no data loss; secrets never round-trip through the client).
   - Rotate the password (enter a new value) → save → next crawl uses the new credential. Verify by re-running the project's crawl.
   - Clear the auth toggle → save → server stores `credentials: null` and the project crawls without auth.
   - Edit a project that was created with explicit CSS selectors (legacy) → save name change only → confirm the legacy `usernameSelector` / `passwordSelector` / `submitSelector` are NOT silently wiped (regression guard for the merge logic).
   - Pristine edit (open + Back without typing) → no "Leave without saving?" prompt fires (`isDirty` baseline check).
3. **Delete project (admin-only**, `routes/projects.js:147`) → moved to recycle bin, no longer in active list. As `qa_lead`, attempting delete returns **403**.
4. Restore from recycle bin (`qa_lead` or `admin`, `routes/recycleBin.js:54`) → returns to active list with data intact (tests, runs, baselines).
5. **Permanently purge (admin-only**, `routes/recycleBin.js:132`) → unrecoverable; associated runs/tests gone. `qa_lead` purge attempt → 403.

**Negative / edge:**
- Two users edit same project simultaneously → last-write-wins or conflict warning (document behavior).
- Delete project with active running tests → runs stopped/completed cleanly, no orphans.
- Viewer attempts any project mutation (create/edit/delete/restore/purge) → 403.
- `qa_lead` attempts delete or purge → 403 (admin-only ops).

---

### 🧪 Tests Page

**Preconditions:** Project exists.

**Steps & expected:**
1. Crawl URL — verify **both crawl modes** (`README.md`):
   - **Link Crawl** — follows `<a>` tags, maps pages.
   - **State Exploration** — clicks/fills/submits to discover multi-step flows (auth, checkout).
   Each mode completes, discovered pages listed, progress visible. **Primary output: UI / browser tests** (see §3 below). Same-origin fetch/XHR is also captured and powers API test generation as a secondary output (see §4).
2. Generate tests — verify the **8-stage AI pipeline** runs (`README.md`): discover → filter → classify → plan → generate → deduplicate → enhance → validate. Tests appear in **Draft** queue (`README.md`: "Nothing executes until a human approves it").
3. **UI / browser test generation (default output)** — three paths, all produce tests that drive a real browser:
   - During **Link Crawl**: discovered pages → Playwright tests with `page.goto(...)` + `getByRole` / `getByLabel` / `getByText` + ≥ 3 `expect(...)` assertions on visible UI state.
   - During **State Exploration** crawl: multi-step flows (login, form submit, checkout) → tests using `safeClick` / `safeFill` so self-healing engages at run time.
   - **Recorder**: user-driven click/fill/press/select/navigate (see Recorder section).
   Each path produces a Playwright test that opens a browser, navigates pages, and asserts on rendered DOM. **No `request.fetch` / `request.get` / `request.post` calls.**
4. **API test generation (additional output)** — three paths, all produce Playwright `request` tests (no browser):
   - During crawl: same-origin fetch/XHR auto-generated as Playwright `request` tests.
   - "Generate Test" modal: plain-English endpoint description.
   - Paste `METHOD /path` patterns or attach an OpenAPI spec.
   Each path produces tests that verify status codes, JSON shape, error payloads.
5. Approve test → moves to active suite; appears in run targets.
6. Reject test → removed/archived; excluded from regression.
7. Edit test steps (add/remove/reorder) → saved; preview reflects changes.
8. **Search** tests via `?search=` (`/api/v1/projects/:id/tests?search=`) → filters list correctly; empty results show empty state.
9. **Exports** (`backend/src/routes/tests.js`):
   - `GET /api/v1/projects/:id/tests/export/zephyr` — Zephyr Scale CSV.
   - `GET /api/v1/projects/:id/tests/export/testrail` — TestRail CSV.
   - `GET /api/v1/projects/:id/tests/traceability` — traceability matrix.
   - `GET /api/v1/projects/:id/export/playwright` — standalone Playwright project ZIP (approved tests only — DIF-006).
   Each downloads a non-empty file with correct headers; re-importing into the target tool round-trips cleanly. The Playwright ZIP must run with `npm install && npx playwright test` after unzipping.

**Negative / edge:**
- Crawl an unreachable URL → clear error, no infinite spinner.
- Crawl an auth-gated site → documented behavior (login support or graceful failure).
- Generate tests with empty crawl → no crash; clear empty state.
- Edit test, refresh before save → unsaved-changes warning.
- Concurrent edits by two users → last-write-wins or conflict UI.

---

### 🎥 Recorder

**Preconditions:** Project exists; recorder extension/feature available.

**Steps & expected:**
1. Start recorder on any stable site (same target as the Tests crawl step) → recording indicator visible. Recorder uses Playwright CDP screencast; the canvas is **interactive** — pointer / keyboard / wheel events are forwarded to the headless browser via the new `POST /api/v1/projects/:id/record/:sessionId/input` route (see `docs/changelog.md` DIF-015 + PR #115). Persists a Draft test with `safeClick` / `safeFill`.
1a. **Starting URL suggestions (PR #11)** — the Starting URL field renders a `<datalist>` dropdown populated by `GET /api/v1/projects/:id/pages`: the project's seed URL plus pages discovered on the latest successful crawl (or prior recorder run). Projects with no crawl history show just the seed URL. Verify suggestions appear as you focus the field; pick one → it populates the input.
1b. **Two-phase step display (PR #11)** — newly captured actions briefly render as a dim italic raw locator (`click → role=button[…]`) for ~600 ms, then flip to human-readable prose (`Click the 'Sign in' button`) with a yellow highlight flash (1.2 s animation). Verify both phases render on the first few actions of a fresh recording.
1c. **Flush-before-navigate (PR #11)** — type into a search box, hit **Enter** to submit the form. Verify the fill IS captured (Step: "Fill in the 'Search' field with 'iphone'") and ordered BEFORE the resulting `goto`, not swallowed by the navigation. Same check for submit-button click on a form: type → click Submit → the fill step appears in the recorded list, not just the goto.
2. Perform actions captured by the recorder (PR #115 + #118 expanded scope): **click, double-click, right-click, hover, fill (type), press (keyboard shortcut), select (dropdown), check / uncheck, file upload, drag-and-drop, and navigate**. Mouse moves and scroll are forwarded to the headless browser but not stored as discrete steps. Mouse moves are throttled to ~30 fps client-side.
   - **Hover with intent** — pointer rests on the same interactive element for ≥ 600 ms IS captured as a discrete `hover` step. Drive-by mouseovers are filtered out by the dwell timer (`backend/src/runner/recorder.js:282-309`).
   - **Double-click** — the two preceding `click` events captured for the same selector are dropped within the OS double-click window (`TIMINGS.DBLCLICK_WINDOW_MS` = 500 ms) so the recorded action list reads as a single dblclick, not click-click-dblclick (`backend/src/runner/recorder.js:931-944`).
   - **Right-click** records as `rightClick` and emits `locator.click({ button: 'right' })` so context-menu-driven flows replay correctly.
   - **File upload** captures filenames only (no full paths — would leak tmpdir). The generated code emits a `safeUpload(sel, [])` placeholder + a `// NOTE: recorder captured filenames […]` comment; reviewers must wire up real fixture paths before running outside the recorder.
   - **Drag-and-drop** pairs `dragstart` + `drop` → `locator.dragTo(targetLocator)` in the generated code.
   - **Printable characters typed into INPUT/TEXTAREA/contenteditable** are intentionally NOT captured as `press` steps by default — the `input` event handler captures them as a debounced `fill`, so emitting per-keystroke `keyboard.press` would double-type the value at replay. Keyboard chords with `Ctrl`/`Cmd` modifiers, plus editing keys (Enter, Tab, Backspace, arrows, Escape), still flow through to `press` actions.
   - **Paste (DIF-015c Gap 1, PR #11)** — pasting a token / address / JSON block into an `<input>` or `<textarea>` emits a single `safeFill` with the post-paste field value (500-char truncated), NOT a stream of per-keystroke `press` actions. The post-paste `input` event is deduplicated against the paste so exactly one fill is captured. Verify by pasting a long string into a search box — the Steps sidebar must show one "Fill in … with '…'" entry, not N `press` rows.
   - **Opt-in keyboard shortcut capture (DIF-015c Gap 1, PR #11)** — to record a shortcut like `Ctrl+A` / `Cmd+V` on an editable field, click the **Record keyboard shortcut** button in `RecorderModal` before pressing the chord. The button arms an N-keystroke budget (default 3) via `POST /record/:sessionId/input` with `type: "shortcutCapture"`; the next 3 printable keydowns on editable fields flow through to `press` instead of being suppressed. Budget auto-decrements to 0 so modifier noise is never permanent. Button label flips to "Shortcut capture armed (next 3 keys)" for 4s after arming.
   - **Manual assertions** (PR #118) — while recording, use the "Add assertion" form in `RecorderModal` to insert assertion steps. Four assertion kinds are supported: `assertVisible`, `assertText`, `assertValue`, `assertUrl` (`backend/src/routes/tests.js:1164-1184`, `backend/src/runner/recorder.js:827-855`). Server-side validation rejects assertions missing required fields (selector for visible/text/value, value for text/value/url) with a 400.
   - **Expected:** Each captured action is a discrete step with selector + action type; no empty/null steps. Persisted `steps[]` are short English sentences with **single quotes** (`User clicks the 'Sign in' button`, `User fills in the 'Email' field with 'user@example.com'`, `The 'Toast' is visible`) — **never raw selectors** like `role=button[name="…"]` or `#login`. Generated `playwrightCode` uses `safeClick` / `safeFill` / `safeSelect` / `safeCheck` / `safeUncheck` / `safeUpload` so self-healing engages at run time. The persisted `steps[]` count exactly matches the `// Step N:` comment count in `playwrightCode` — the shared `filterEmittableActions` predicate (`backend/src/runner/recorder.js:634-665`) drops actions missing required fields from both outputs identically (PR #118).
3. Stop and save → test appears in Tests page with all steps intact after refresh. The Test Detail Steps panel renders the recorded test identically to AI-generated and manually-created tests (no engineer-shaped strings).
4. Replay the recorded test → all steps execute; pass status reported.
5. **Default Chromium headless mode** — confirm `BROWSER_HEADLESS=true` (the default) no longer produces "no actions were captured" (PR #115). The previous bug was that the canvas was read-only — it now forwards input correctly even when the headless Chromium has no visible window.

**Negative / edge:**
- ⚠️ Known: empty-steps bug (legacy) — verify every recorded step has a selector and action. PR #118's `filterEmittableActions` drops ill-formed actions from both `steps[]` and `playwrightCode` so the two stay in lock-step.
- Record on SPA with client-side routing → navigations captured correctly. Consecutive `goto` actions to the **exact same URL** collapse to a single Step (e.g. `framenavigated` echoes); query-string-distinct navigations (`/search?q=iphone` → `/search?q=macbook`, pagination `?page=N`) are preserved as separate Steps so query-driven flows replay correctly (PR #115 + PR #118 fix).
- Record on iframe content (DIF-015b Gap 3, PR #11) → `actionsToPlaywrightCode` emits `page.frameLocator('iframe[src*="<frameUrl>"]').first()` for any captured action carrying a `frameUrl`, replacing the old `ensureFrame(...)` polling helper with Playwright's built-in locator chain. Verify by recording a click inside an `<iframe>` (e.g. Stripe checkout demo) and confirming the generated Source tab uses `frameLocator(...)`, not `ensureFrame`.
- Record on shadow DOM content → shadow-root traversal is handled by Playwright's `InjectedScript` on the primary `window.__playwrightSelector` delegation path (PR #4), which walks boundaries via `>> ` piercing selectors natively. Verify replay succeeds against the recorded target.
- Record across tabs/popups → popups are aliased as `popup1`, `popup2`, etc., and the generated code includes an `ensurePopup(alias)` helper (`backend/src/runner/recorder.js:688-700`). The `pageAlias` field on each captured action routes the replay through the correct page.
- Close tab mid-recording → partial recording saved or discarded cleanly (no corrupted state). The `MAX_RECORDING_MS` safety-net teardown closes the stub `runs` row so subsequent runs on the project are not blocked (PR #115). Operators who hit "Stop & Save" within `RECORDER_COMPLETED_TTL_MS` (default 2 min) of the auto-teardown still recover their captured actions from the completed-recordings cache (`backend/src/runner/recorder.js:143-162`).
- Record on site with dynamic IDs → selectors are stable (data-testid / role+name / label / text / placeholder fallback chain), not brittle.
- **Scroll inside the canvas** → only the recorded page scrolls; the surrounding modal / page must not scroll underneath (PR #115 — non-passive wheel listener).
- **Type printable characters** → each character appears once in the recorded form input. (PR #115 fixed a regression where every keystroke was inserted twice; PR #118 added the editable-field guard at `backend/src/runner/recorder.js:370-372` and a regression test in `backend/tests/recorder.test.js` to lock it down.)
- **Left / middle / right mouse button** → CDP receives the correct button name. PR #115 P1 fix mapped DOM `MouseEvent.button` 0→`"left"`, 1→`"middle"`, 2→`"right"`. Idle hovers (no button held) dispatch `"none"` so the move isn't interpreted as a left-button drag. Regression test at `backend/tests/recorder.test.js` (`maps DOM button 0 → CDP 'left'`).
- **Right-/middle-click drag** → forwards the correct CDP button. Verify by recording a right-click context menu on a page that has one — the menu opens, no left-click drag artefact appears.
- **Re-recording after a previous crashed session** → opens cleanly; no UNIQUE constraint error on the `runs` row. The orphan sweep at `POST /record` (`backend/src/routes/tests.js:881-902`) only clears `record`-type orphans — concurrent crawl / regression / generate runs are intentionally left alone.
- **Permissions** — every recorder route is gated by `requireRole("qa_lead")`: `POST /record`, `POST /record/:sessionId/input`, `POST /record/:sessionId/assertion`, `POST /record/:sessionId/stop`. Viewer attempts return 403 (`backend/src/middleware/permissions.json:22, 30-32`).
- **Rate limiting** — the `/input` route is exempt from the global rate limiter (`backend/src/middleware/appSetup.js`) because canvas events arrive at ~60 fps during active use. The exemption is scoped to `POST` requests matching `/record/:sessionId/input` only; `/record` and `/record/:sessionId/stop` are still rate-limited.
- **Assertion validation** — `POST /record/:sessionId/assertion` rejects payloads with invalid `kind` (anything other than `assertVisible` / `assertText` / `assertValue` / `assertUrl`) with 400. Missing `selector` for non-`assertUrl` kinds → 400. Missing `value` for `assertText` / `assertValue` / `assertUrl` → 400. Verify each branch returns a clear error message.
- **Step prose contract** — the persisted `steps[]` array must NEVER leak raw `role=…[name="…"]` selectors, `#id` CSS, or `.class` selectors into the rendered step. The fallback chain (`label` → role-selector name extraction → empty target phrase) at `backend/src/runner/recorder.js:440-489` is property-tested at `backend/tests/recorder.test.js` (`never leaks raw role=…[name="…"] or CSS selectors into the rendered step`).

---

### ▶️ Runs

**Preconditions:** At least one approved test.

**Steps & expected:**
1. Run single test → status: queued → running → passed/failed; logs, screenshots, video available.
2. Run regression suite → all tests execute; summary shows pass/fail counts matching detail view.
3. **Cross-browser run selector** (`docs/changelog.md` DIF-002) — trigger run with each engine: **Chromium** (default), **Firefox**, **WebKit**. Each run record persists `browser` (migration 009); RunDetail page shows a per-run badge.
4. **Mobile device emulation** (`docs/changelog.md` DIF-003) — pass `device` (e.g. `"iPhone 14"`, `"Pixel 7"`) → run uses Playwright device profile (viewport, user agent, touch). Verify dropdown lists curated devices.
5. **Parallel execution** (`README.md`) — set parallelism 1–10 from UI (or `PARALLEL_WORKERS`). Verify each worker has isolated video/screenshots/network logs; default is 1.
6. **Live run view** — RunDetail streams logs via SSE, shows per-step screenshots, and exposes **Abort** action mid-run.
7. **Abort run** → run marked `stopped`; partial results retained; per-test hard timeout is `BROWSER_TEST_TIMEOUT` (default **120 000 ms**, `AGENT.md`).
8. Re-run failed tests only → only previously-failed tests execute.
9. **Self-healing** (`README.md`) — break a primary selector, re-run; runtime tries role → label → text → aria-label → title, remembers the winner per element. Confirm subsequent run picks the previously-successful strategy first.

**Negative / edge:**
- Trigger run while another is in progress → concurrency = `PARALLEL_WORKERS` (default **1**, `AGENT.md`). Extra runs queue; no crash.
- Run test against unreachable target → fails with clear network error, not timeout silence.
- Long-running / hung test → aborted at `BROWSER_TEST_TIMEOUT` with a clear timeout error.
- **Flaky test (intermittent failure)** → product-level auto-retry **IS** wired (AUTO-005, PR #2). Each test failure triggers up to `MAX_TEST_RETRIES` retries (default **2**, max 10, set to `0` to disable) before the result is recorded as truly failed. Verify via `result.retryCount` (number of retries actually consumed) and `result.failedAfterRetry` (true only when all attempts failed). A test that fails once then passes shows `retryCount: 1, status: "passed"` — notifications and failure counters fire only on `failedAfterRetry: true` (`backend/src/runner/retry.js`, `backend/src/testRunner.js:229-240`). **Note:** only the FINAL attempt's video / screenshots / trace are preserved on disk — earlier attempts overwrite each other (intentional; see retry.js JSDoc § "Artifact overwrite behaviour"). Self-healing (`safeClick` / `safeFill` selector waterfall) is a separate, lower-level recovery layer — DIF-015b's nth=N disambiguation also reduces flake at recording time.
- Viewer attempts to trigger run → blocked.
- `qa_lead` stops another user's run → **allowed** (no per-user "own runs" gate exists in code, `routes/runs.js:257` only requires `qa_lead`). If product intent is to restrict to the run's owner, file as security enhancement.
- Browser close mid-run → run continues on backend; status visible on return.

---

### 🪄 AI Fix (failed test recovery)

**Preconditions:** A test exists with `playwrightCode` and `lastResult === "failed"` (or its latest run result is failed). AI provider configured. Role: `qa_lead` or `admin` (`backend/src/routes/testFix.js:152` — `requireRole("qa_lead")`).

**Manual fix flow:**
1. Open the failed test in TestDetail → **"Fix with AI"** button visible only when failed and code present (`frontend/src/pages/TestDetail.jsx:411-426`).
2. Click → `POST /api/v1/tests/:testId/fix` opens an **SSE stream** with incremental tokens.
3. Fix panel shows the proposed new code with a diff against the current code.
4. Accept → test goes back to **Draft** state for re-review (never silently re-approved — `backend/src/pipeline/feedbackLoop.js:481-490`).
5. Re-run the test after re-approval → previously-failing assertion passes.

**Automatic feedback loop** (`backend/src/pipeline/feedbackLoop.js:443-496`):
6. On a regression run with failures, only **high-priority categories** are auto-regenerated: `SELECTOR_ISSUE`, `URL_MISMATCH`, `TIMEOUT`, `ASSERTION_FAIL`, `NETWORK_MOCK_FAIL`, `FRAME_FAIL`, `API_ASSERTION_FAIL` (`backend/src/pipeline/feedbackLoop.js:358-366`).
7. Regenerated tests appear in **Draft** with `_regenerated` / `_regenerationReason` metadata; `qualityAnalytics` attached to the run.
8. Flaky-test detection runs and is exposed in `analytics.flakyTests` on the run record.

**Negative / edge:**
- No AI provider configured → button still clickable, server returns **503** with a clear "Go to Settings" message (`testFix.js:162-166`).
- Test with no `playwrightCode` → server returns **400** "Test has no Playwright code to fix" (`testFix.js:158-160`).
- Viewer attempts to call `/fix` → 403 (role gate).
- Cancel SSE mid-stream → no partial update persisted.
- AI returns malformed code → surfaced as "invalid output" error, original code untouched.
- Fix run mid-execution → abort signal honored, no half-applied changes (`feedbackLoop.js:478`).

---

### ✏️ Test Code Editing (Steps ↔ Source)

**Preconditions:** Approved test with `playwrightCode`. Open TestDetail.

**Toggle & view:**
1. Steps / Source toggle present (`frontend/src/pages/TestDetail.jsx:125-126`). Default = Steps.
2. **Steps tab** — list of plain-English steps; can add, remove, reorder, edit text inline.
3. **Source tab** — full Playwright code, monospace, editable.

**Code regeneration on step edit** (`backend/src/routes/tests.js:154-273`):
4. Edit a step → save → **preview** mode kicks in: diff panel shows old vs new code with **minimal changes only** (existing helpers, comments `// Step N:`, structure preserved).
5. The new code starts with `await page.goto(...)`, uses role-based selectors, has ≥ 3 `expect(...)` assertions, includes no `import` statements (cloud prompt at `backend/src/routes/tests.js:218-224`).
6. Accept diff → `playwrightCode` updated; `playwrightCodePrev` set to old code; `codeRegeneratedAt` timestamped.
7. Discard diff → no DB change; the test keeps prior code.
8. The hint banner reads "Code will be regenerated on save — you'll review changes before applying" when editing in Steps view (`frontend/src/pages/TestDetail.jsx:862-875`).

**Direct source editing:**
9. Edit Playwright code directly in **Source** tab → save → persists without going through AI regeneration (steps and code can drift; document this as expected).
10. `isApiTest` flag updates automatically based on code content (`backend/src/routes/tests.js:265`).

**Local provider (Ollama) path:**
11. Switch to a local provider → editing a step still works; backend uses a **shorter prompt**, plain-text response (no JSON wrapper) per `backend/src/routes/tests.js:199-209` and `230-238`. Verify regenerated code still parses.

**Negative / edge:**
- AI provider down → save returns the regeneration error string; original test untouched.
- Concurrent edit by two users → last-write-wins; document if an edit warning is shown.
- Edit and refresh before save → unsaved-changes warning.
- Edit Source to invalid JS → server validation rejects (test would fail to compile at run time); confirm clear error.
- Viewer attempts edit → 403.

**Edit with AI panel** (DIF-007 — `frontend/src/components/test/AiTestEditor.jsx`, `backend/src/routes/chat.js` `test_edit` mode):

**Preconditions:** Test with `playwrightCode` exists; AI provider configured; role `qa_lead` or `admin`.

1. Open TestDetail → toolbar shows **"Edit with AI"** button (only when `playwrightCode` is present).
2. Click → AI editor panel expands with prompt textarea, Generate / Apply buttons.
3. Enter a natural-language instruction (e.g. "Add an assertion that cart total updates after quantity change") → click **Generate edit**.
4. Backend receives `POST /api/v1/chat` with `context: { mode: "test_edit", testName, testSteps, testCode }` → uses dedicated `TEST_EDIT_SYSTEM_PROMPT`; SSE stream returns Markdown with `### Summary` + a fenced ` ```javascript ` block.
5. Frontend extracts the code block via `extractCodeBlock()` → renders a **DiffView** showing before/after.
6. Click **Apply** → `PATCH` saves new `playwrightCode`; panel closes; view switches to **Source** tab; verify code is updated and persisted across refresh.

**Negative / edge:**
- No AI provider configured → server returns **503**; error surfaces in the panel (not silent).
- Empty / whitespace-only prompt → **Generate edit** button disabled.
- AI response without a fenced code block → user-friendly error: "AI response did not include updated code. Try a more specific instruction."; original code untouched.
- SSE provider error mid-stream → real provider message preserved (not overwritten by the generic "no code" message — see `hadError` flag in `AiTestEditor.jsx`).
- Click **Hide AI Editor** mid-generation → panel hides; in-flight stream behavior should not corrupt state (note: in-flight `fetch` continues until completion — see review thread on AbortController).
- Viewer attempts → 403 on save.

---

### ⚡ Automation (CI/CD + Scheduled Runs)

**Preconditions:** Project exists with at least one approved test. Open `/automation` (or use `?project=PRJ-X` deep-link).

**CI/CD trigger tokens** (`docs/changelog.md` ENH-011):
1. Create a token via `POST /api/projects/:id/trigger-tokens` (UI button) → plaintext token shown **exactly once**; refresh and confirm only the SHA-256 hash is stored (never plaintext again).
2. List tokens → no hashes leaked to UI.
3. Trigger a run via `POST /api/projects/:id/trigger` with `Authorization: Bearer <token>` → returns **202 Accepted** with `{ runId, statusUrl }`. Poll `statusUrl`; final state matches RunDetail page.
4. Optional `callbackUrl` → callback hits the URL on completion with run status.
5. Revoke token via `DELETE /api/projects/:id/trigger-tokens/:tid` → subsequent trigger calls return 401.

**Scheduled runs** (`docs/changelog.md` ENH-006):
1. Open `ScheduleManager` for a project → set a 5-field cron expression + IANA timezone via preset picker (hourly/daily/weekly).
2. `PATCH /api/projects/:id/schedule` → server validates cron; invalid expression rejected (try `* * *` → 400).
3. Enable schedule → next-run time displayed; persists across server restart (hot-reloaded on save without process restart — verify by saving while watching backend).
4. Disable schedule → cron task cancelled; no runs fired.
5. `DELETE /api/projects/:id/schedule` → schedule removed; `GET` returns null.

**Negative / edge:**
- Viewer attempts to create trigger token or schedule → 403.
- **`qa_lead` attempts to create / revoke trigger token → 403** (admin-only, `routes/runs.js:379, 411`). `qa_lead` *can* create / edit schedules (`routes/projects.js:162, 222`).
- Trigger run with revoked or wrong token → 401, no run created.
- Schedule across DST transition → next-run time correct in target timezone.
- Two schedules firing simultaneously → respect `PARALLEL_WORKERS` queue; no crash.

---

### 🚦 Quality Gates (AUTO-012)

**Preconditions:** Project with ≥ 5 approved tests; `qa_lead` or `admin` logged in. Endpoints documented in `backend/src/routes/projects.js` and `backend/src/middleware/permissions.json`.

**CRUD flow:**
1. `GET /api/v1/projects/:id/quality-gates` (any workspace member, viewer+) → returns `{ qualityGates: null }` for an unconfigured project.
2. `PATCH /api/v1/projects/:id/quality-gates` with `{ minPassRate: 95 }` (`qa_lead` or `admin`) → returns `{ qualityGates: { minPassRate: 95 } }`. Reload + GET → value persists across requests.
3. PATCH `{ minPassRate: 80, maxFlakyPct: 10, maxFailures: 2 }` → all three fields persist together.
4. `DELETE /api/v1/projects/:id/quality-gates` (`qa_lead` or `admin`) → returns `{ ok: true, qualityGates: null }`; subsequent GET returns null again.

**Validation (each must return 400):**
5. `minPassRate: 150` (out of 0–100 range) → 400 "minPassRate must be between 0 and 100".
6. `maxFlakyPct: -1` → 400 "maxFlakyPct must be between 0 and 100".
7. `maxFailures: 1.5` (non-integer) or `maxFailures: -1` → 400 "maxFailures must be a non-negative integer".
8. PATCH with array body or non-object → 400 "qualityGates must be an object".

**Run-time evaluation** (`backend/src/testRunner.js` `evaluateQualityGates`):
9. Configure `{ minPassRate: 95 }`. Trigger a run that finishes 9/10 passed (90%) → `run.gateResult = { passed: false, violations: [{ rule: "minPassRate", threshold: 95, actual: 90 }] }`.
10. Configure `{ maxFailures: 2 }` and finish a run with 3 failures → violation rule `maxFailures`, `actual: 3`.
11. Configure `{ maxFlakyPct: 5 }` and finish a run where `retryCount / total * 100 > 5` → violation rule `maxFlakyPct`.
12. All gates passing → `run.gateResult = { passed: true, violations: [] }`.
13. Project with **no** gates configured → `run.gateResult` is `null` (legacy / pre-AUTO-012 runs are unaffected; CI consumers must treat null as "no gate").

**CI/CD trigger integration** (`backend/src/routes/trigger.js`):
14. Trigger a run via `POST /api/v1/projects/:id/trigger` with a Bearer token, then poll `GET /api/v1/projects/:id/trigger/runs/:runId` → response includes top-level `gateResult` matching what's persisted on the run.
15. Provide `callbackUrl` on the trigger call → callback POST payload contains `gateResult: { passed, violations }` or `null`.
16. Confirm `gateResult` is included regardless of run status (`completed` / `failed` / `aborted`) when gates are configured; `null` otherwise.

**Permissions:**
17. As `viewer`, `PATCH` and `DELETE` quality-gates endpoints → **403** (not 200, not silent no-op). `GET` is allowed.
18. As `qa_lead` and `admin`, all three (GET / PATCH / DELETE) succeed.
19. Cross-workspace isolation — outsider hitting another workspace's project → 404 (workspace scope enforced upstream by `workspaceScope` middleware).

**UI surfaces (AUTO-012b):**
20. ProjectDetail → **Settings** tab → "Quality Gates" panel renders. As `qa_lead`/`admin`, the form is editable; as `viewer`, fields are disabled and a "Read-only" hint shows.
21. Configure thresholds and click **Save** → toast "Quality gates saved"; reload tab → values persist.
22. Click **Clear all** → confirmation prompt → on confirm, gates removed; toast "Quality gates cleared"; subsequent runs report `gateResult: null`.
23. Enter all-blank fields and click Save → server-side `DELETE` is sent (config cleared) instead of saving an empty object — toast reads "Quality gates cleared".
24. Validation: enter `minPassRate: 150` → server returns 400; the form surfaces the error message inline (red banner) and does not corrupt local state.
25. Runs list (`/runs`) on a test run that has `gateResult` → green "Gates ✓" or red "Gates ✗" pill renders next to the status badge. Hover → tooltip lists violations.
26. Project Detail → **Runs** tab → same gate badge appears in the per-row status cell.
27. RunDetail header → gate badge appears next to the browser badge when `gateResult` is present. When gates failed, an inline red violation panel renders before the main content listing each `{ rule, threshold, actual }` entry.
28. Test runs created before AUTO-012 shipped (with `gateResult: null`) → no badge, no panel — UI must not regress for legacy runs.

**Negative / edge:**
- PATCH against a non-existent project ID → 404 "not found".
- Persisted JSON survives backend restart (column is `TEXT` JSON in migration `014_quality_gates.sql`).
- Pre-existing runs created before AUTO-012 shipped still load and render correctly with `gateResult: null` (no badge / no panel).
- Crawl and generate runs never carry `gateResult` even when configured (gates apply to test runs only) — verify badge / panel are suppressed in those views.

---

### 🖼️ Visual Testing

**Preconditions:** Test with screenshot steps exists.

**Steps & expected:**
1. First run creates baseline → baseline image saved; status "baseline created".
2. Re-run with no UI change → diff = 0; test passes.
3. Introduce intentional UI change → diff detected; test flagged; side-by-side + diff overlay visible.
4. Accept new baseline → new image replaces old; next run passes.
5. Reject change → baseline unchanged; run remains failed.

**Negative / edge:**
- Anti-aliasing / font rendering differences across OS → `VISUAL_DIFF_THRESHOLD` (default **0.02** = 2% of pixels) and `VISUAL_DIFF_PIXEL_TOLERANCE` (default **0.1**) filter noise (`AGENT.md`). Change `VISUAL_DIFF_THRESHOLD=0` to verify zero-tolerance mode also works.
- Dynamic content (timestamps, ads) → **mask / ignore regions are NOT supported.** `diffScreenshot()` in `backend/src/runner/executeTest.js:343-349` is called with only `{ runId, testId, browser, stepNumber, pngBuffer }` — no mask, region, clip, or exclude params exist. Workaround: tune `VISUAL_DIFF_THRESHOLD` / `VISUAL_DIFF_PIXEL_TOLERANCE`, or stub the dynamic content in the test. Do not test for masking; file as enhancement if needed.
- Viewport size change between runs → diff behavior documented (pass/fail/warn) — confirm actual product behavior and note it in checklist.
- Concurrent baseline accept by two users → last-write-wins with audit trail.
- Very large images → no timeout, no memory crash.

---

### 📊 Dashboard

_(automated: smoke-level login → dashboard landing is covered in `tests/e2e/specs/ui-smoke.spec.mjs`; full widget/report assertions remain manual until dedicated dashboard UI coverage lands.)_

**Preconditions:** Workspace has runs, tests, and projects with data.

**Steps & expected:**
1. Open dashboard → all charts render within a reasonable time (no formal SLO documented — use ≤ 3s as a guideline and file any regression); no console errors.
2. Verify each widget against source of truth:
   - Pass rate % matches count(passed) / count(total) over selected range.
   - Run count matches Runs page filter for same range.
   - Failing tests widget lists only tests with latest status = failed.
3. Change date range → all widgets update consistently; no stale values.
4. Switch workspace → dashboard resets; no data from previous workspace.

**Negative / edge:**
- Empty workspace (no runs) → empty states shown, not zero-division errors / NaN.
- Very large dataset (≥ 1000 runs) → dashboard loads without hanging or crashing; no unbounded network calls.
- Viewer sees dashboard but cannot trigger actions.

---

### 🤖 AI Chat

**Preconditions:** Workspace with tests/runs/projects data. Open `/chat` (Chat History page, `docs/changelog.md` #83).

**Steps & expected:**
1. Ask "How many tests failed this week?" → answer matches Runs page filtered count.
2. Ask "Show me the last failed run for project X" → returns correct run, links to run detail.
3. Ask about a specific test by name → returns accurate step count, last status, last run time.
4. Multi-turn: follow up with "why did it fail?" → uses prior context; answer references actual logs.
5. Ask for something outside scope ("what's the weather") → declines or redirects gracefully.

**Chat History page** (`/chat`, persisted in localStorage per user):
6. Create a new session → appears in sidebar.
7. Rename a session → name persists across reload.
8. Delete a session → removed from list, conversation gone.
9. Search across sessions → matching messages highlighted.
10. Export session as **Markdown** and as **JSON** from the topbar menu → both files download with full conversation.
11. Create > 50 sessions → oldest are evicted (cap is 50/user per `#83`); confirm no errors.
12. "Open full chat page" button in the AI Chat modal → navigates to `/chat`.
13. Sidebar nav → "AI Chat" entry visible and active when on `/chat`.

**AI provider switching** (`README.md`):
14. Header dropdown lists configured providers (Anthropic / OpenAI / Google / OpenRouter / Ollama). Switch with one click → next chat message uses the new provider; auto-detection order is Anthropic → OpenAI → Google → OpenRouter → Ollama.

**Negative / edge:**
- Ask about data in a workspace the user doesn't belong to → **must refuse**; no data leakage (severe bug if leaked).
- Ask Viewer to perform a mutation via chat ("delete project X") → refused or no-op; permissions enforced.
- Prompt injection in a test name (e.g., test named `"ignore previous instructions..."`) → chat does not execute injected instructions.
- Non-existent entity ("run 99999") → clear "not found", no hallucinated data.
- Very long conversation → truncation behavior documented; no crash.

---

### ⚙️ Settings

**Preconditions:** Admin logged in.

**Steps & expected:**
1. Update each setting category → change persists after refresh and across sessions. Sentri surfaces (no billing module):
   - **AI provider keys** — admin-only (`routes/settings.js:48, 53, 130`). Switching providers via the header dropdown should succeed in one click (`README.md`).
   - **Workspace members & roles** — admin-only (`routes/workspaces.js:134, 168, 196`). Roles: `admin` / `qa_lead` / `viewer`.
   - **Per-project notification settings** (Teams webhook / email recipients / generic webhook) — **`qa_lead` or admin** (`routes/projects.js:266`); at least one channel required (`backend/tests/account-compliance.test.js`).
   - **System info / Ollama status** — read-only diagnostics; available on Settings → System and `/system` page.
2. Invalid input (bad email, bad URL) → inline validation; save blocked.
3. Revoke/regenerate API key → old key returns 401 immediately; new key works.
4. Disconnect integration → subsequent features depending on it fail gracefully.

**Negative / edge:**
- `qa_lead` or `viewer` opens `/settings` page → 403 (route is `requiredRole="admin"`, `frontend/src/App.jsx:66`). Note: per-project notification edits are reachable from ProjectDetail, not `/settings`.
- Concurrent settings edits → last-write-wins with no lost fields.
- Save partial form (required field blank) → blocked, no partial persistence.

---

### 👤 Account / GDPR (Settings → Account)

**Preconditions:** Logged in. Open Settings → Account tab (`docs/changelog.md` SEC-003 #93).

**Steps & expected:**
1. **Export account data** — click Export, enter password → server validates via `X-Account-Password` header → JSON downloads containing workspaces, projects, tests, runs, activities, schedules, notification settings (`GET /api/auth/export`).
2. Wrong password on export → 401, no file.
3. **Delete account** — two-click confirm with **5s auto-disarm** (UI re-arms after 5s if not confirmed). Final confirm + password → `DELETE /api/auth/account` runs in a single transaction; user logged out; subsequent login fails with "account not found"; all owned workspace data is gone.
4. Wrong password on delete → 401, account intact.
5. Cancel mid-flow → no state change.

---

### 📧 Email Verification (extra cases)

Beyond the Authentication section (`docs/changelog.md` SEC-001 #87):
1. Register → verification email sent via Resend / SMTP / console fallback (depending on env).
2. Try to login **before** verifying → blocked with "verify your email" state on Login page; "Resend" button visible.
3. Click Resend → `POST /api/auth/resend-verification` returns the same response whether or not the address is registered (enumeration-safe). Rate limit applies (5–10/15min).
4. `GET /api/auth/verify?token=` with valid token → user marked verified; tampered/expired token → rejected.
5. Pre-existing users (created before SEC-001 migration 003) are grandfathered as verified — login works without verification.

---

### ♻️ Recycle Bin (Settings)

**Preconditions:** Soft-delete a project, a test, and a run (`docs/changelog.md` ENH-020). Settings → Recycle Bin.

**Steps & expected:**
1. `GET /api/recycle-bin` → returns soft-deleted entities grouped by type, capped at **200 items per type**.
2. Restore a test → `POST /api/restore/test/:id`; reappears in active list with steps intact.
3. Restore a project → cascades to tests/runs deleted **at the same time** as the project. Tests deleted **individually** earlier remain in the bin.
4. Purge a test → `DELETE /api/purge/test/:id`; gone from `GET /api/recycle-bin`; cannot be restored.
5. Viewer attempts restore/purge → blocked.

---

### 🧾 Audit Log

**Preconditions:** Multiple users acting in WS-1 (`docs/changelog.md` #78).

**Steps & expected:**
1. Each mutating action records `userId` + `userName` on the activity entry.
2. Bulk approve/reject/restore → emits **one activity per test**, each tagged with the acting user (not a single bulk row).
3. Filter audit log by user → only that user's actions visible.
4. Audit entries cannot be edited/deleted via UI.

---

### 🔔 Notifications

**Preconditions:** Notifications configured per project. Sentri supports exactly **three channels** (see `backend/src/utils/notifications.js` — `fireNotifications`):
- **Microsoft Teams** — Adaptive Card via incoming webhook.
- **Email** — HTML summary via `emailSender.js`.
- **Generic webhook** — POST JSON to user-configured URL.

Note: **Slack and in-app are NOT supported** — do not test them.

The settings API requires **at least one channel** to be enabled (confirmed by `backend/tests/account-compliance.test.js`: saving with all three blank returns 400).

**Delivery model** (`backend/src/utils/notifications.js:270-305`):
- Channels fire **simultaneously** via `Promise.allSettled(dispatches)` — no queue, no retry, no rate-limit.
- All errors are logged (`[notifications] X failed for runId: ...`) but **never propagated** — a failing notification cannot fail the run.
- Notifications fire **only when `run.failed > 0`** (`notifications.js:256-257`). Successful runs send nothing.

**Steps & expected (per channel):**
1. Trigger a failed run → each enabled channel receives one dispatch. Verify backend log line `[notifications] <channel> notification sent for <runId>`.
2. Notification payload includes: project, test name, run ID, failure reason, link to run detail.
3. Link in notification opens the correct run and requires auth.
4. Disable a channel → no notifications sent via that channel for subsequent runs.
5. Save settings with all three channels blank → API returns **400** ("At least one channel is required").
6. Successful run (no failures) → **no notification** sent on any channel (intentional, `notifications.js:256`).
7. Recovery notifications ("previously failed, now passes") are **not implemented** — do not test for them; file as enhancement if needed.

**Negative / edge:**
- Invalid / non-HTTPS webhook URL → channel call fails; backend log shows `[notifications] Webhook notification failed` warning; **other channels still deliver** (best-effort).
- Slow / hung channel → no timeout in code; the dispatch will wait on the underlying HTTP client default. Verify this does not stall run completion (the run completes regardless because dispatches are best-effort).
- Flood of failures (10+ failed runs in a minute) → **no batching, throttling, or dedup is implemented**. Each failed run sends one notification per enabled channel. File as enhancement if this floods Teams/email.
- User removed from workspace → stops receiving notifications because settings are workspace-scoped.
- Notification payloads contain no PII / secrets / tokens.

---

### 🔒 Security

**Preconditions:** Users A (`admin` WS-1), B (`qa_lead` WS-1), C (`viewer` WS-1), D (outsider, no membership). A owns project P1, test T1, run R1 in WS-1.

**Authorization checks — each must return 403/404, never the resource:**
1. User D opens `/workspaces/WS-1` directly → denied.
2. User D opens `/projects/P1`, `/tests/T1`, `/runs/R1` directly → denied.
3. User D hits any API endpoint for WS-1 resources with their own token → 403.
4. User C (Viewer) issues mutations via direct API calls (POST/PUT/DELETE) → 403.
5. Swap workspace ID in a URL (`/ws/WS-1/...` → `/ws/WS-other/...` where user has no access) → 403, not 200 empty.
6. Change numeric/opaque IDs in URLs (IDOR) on project, test, run, baseline, invite, API key → 403.

**Session / auth:**
- JWT stored in **HttpOnly cookie**; verify `HttpOnly`, `Secure`, `SameSite` flags in DevTools (`README.md` security table).
- Proactive refresh fires **5 min before expiry** (`docs/changelog.md`); leave a tab idle and confirm refresh happens without redirect.
- Logout invalidates cookie server-side (replay fails).
- Password reset uses DB-backed **atomic one-time claim** tokens (`README.md`, `docs/changelog.md`): reusing a claimed token → rejected; requesting a new token invalidates all prior unused **reset tokens** (`#78`).
- ⚠️ **There is no in-app "change password" endpoint** — only `forgot-password` + `reset-password` (`backend/src/routes/auth.js:687`). Password reset **does NOT invalidate active sessions on other devices** (no token version bump / refresh-token clear). Verify this: log in on browsers A and B → run reset flow on A → confirm B's session continues to work. File as `SEC` enhancement; do not log as a bug against the current build.

**Input / injection:**
- XSS probes in test names, project names, workspace names, chat messages, bug titles (`<script>alert(1)</script>`) → rendered as text, never executed.
- SQL-ish payloads in search/filter inputs → no 500; no data leakage.
- Upload malicious file types (`.exe`, oversized image) to recorder / baseline → rejected with clear error.
- CSRF: submit a state-changing request from a third-party origin → blocked.

**Secrets:**
- API keys never appear in URLs, logs, or client-side bundles.
- Notification payloads, chat responses, error messages contain no tokens or passwords.

---

### 📑 Reports (`/reports`) & PDF Export

**Preconditions:** Workspace with completed runs and approved tests.

**Steps & expected:**
1. Sidebar → **Reports** → `/reports` loads without console errors.
2. Verify the report views available (run summary, test status, defect breakdown, etc. — record the actual list shown).
3. Filter / date-range controls update report content; counts match Runs and Tests pages.
4. From **Dashboard**, click **Export PDF** (executive report) → PDF downloads.
5. Open the PDF → contains pass-rate, defect breakdown, recent activity, and matches on-screen Dashboard widgets.
6. CSV export from **Tests** page (full-detail with step rows, file `sentri-tests-YYYY-MM-DD.csv` per `frontend/src/pages/Tests.jsx:564`) → opens in spreadsheet, header row + per-step rows.

**Negative / edge:**
- Empty workspace → reports/PDF render empty states, no errors.
- Viewer can view reports but cannot trigger destructive actions from them.
- Very large dataset → PDF generation completes; no client crash.

---

### 🖥️ System Diagnostics (`/system`)

**Preconditions:** Logged in.

**Steps & expected:**
1. Sidebar → **System** → `/system` loads.
2. Verify the diagnostics surfaces (record what's shown — typically uptime, version, AI provider status, Ollama status, DB stats, queue stats, etc.).
3. Settings → **System** tab shows the same/related info from `sysInfo` (`frontend/src/pages/Settings.jsx`); both should agree.
4. `GET /health` returns `200 { ok: true, uptime, version }` (`backend/src/index.js:270-278`).
5. `GET /config` returns app config including `demoMode` flag and per-user demo quota (see Demo Mode section).

---

### 🆕 New Project Page (`/projects/new`)

**Preconditions:** `qa_lead` or `admin` logged in.

**Steps & expected:**
1. Projects → **New Project** → `/projects/new` loads (separate page, not a modal).
2. Fill name + URL + any optional fields → **Test connection** button probes the URL.
   - Locally, set `ALLOW_PRIVATE_URLS=true` to allow `http://localhost:<port>` (`docs/changelog.md`); off in prod.
3. Save → redirects to ProjectDetail; project appears in `/projects` list.
4. Submit invalid URL / SSRF payload (e.g. `file://`, `http://169.254.169.254/`) → blocked.
5. Submit duplicate name → handled with clear error.
6. Viewer attempts to open `/projects/new` → blocked / 403.

---

### 📋 Runs List (`/runs`)

**Preconditions:** Workspace with multiple runs in different states.

**Steps & expected:**
1. Sidebar → **Runs** → `/runs` loads with table/list of runs.
2. Filter by status (passed / failed / running / stopped) → list updates.
3. Filter by project → only that project's runs.
4. Click a row → navigates to `/runs/:runId` (RunDetail).
5. Sort by date / duration → ordering correct.
6. Pagination (if present) → next/prev pages load without losing filter state.

---

### 📁 Project Detail (`/projects/:id`)

**Preconditions:** Project with approved tests + at least one run.

**Steps & expected:**
1. Open a project → `/projects/:id` loads with project-scoped command center.
2. **Run regression** from this page → uses the project's defaults; opens RunRegressionModal.
3. **Review / approve / reject** tests scoped to this project (does not show other projects' tests).
4. **Export** Zephyr CSV / TestRail CSV / Traceability scoped to this project.
5. **⚡ Automation** quick-link → opens `/automation?project=<id>` with project pre-expanded.
6. Per-status counts widget reflects `GET /api/v1/projects/:id/tests/counts`.
7. Project-scoped **Notification settings** entry point visible to admin.

---

### ☑️ Bulk Actions & Keyboard Shortcuts

**Preconditions:** Tests page (`/tests`) with ≥ 5 tests in mixed statuses.

**Bulk actions** (`POST /api/v1/projects/:id/tests/bulk`, see `backend/src/routes/tests.js:19`):
1. Select multiple tests via checkboxes → bulk bar appears showing "N selected" with **Approve**, **Reject**, **Clear selection** (`frontend/src/pages/Tests.jsx:914-927`).
2. **Bulk approve** → all selected tests move to active suite; **one audit-log entry per test**, each tagged with the acting user (`docs/changelog.md` #78).
3. **Bulk reject** → all selected archived; one activity per test.
4. **Bulk delete** → soft-deletes selected tests into Recycle Bin.
5. **Bulk restore** (from Recycle Bin) → restores all selected.
6. Mixing roles: Viewer cannot use bulk actions → buttons hidden or 403.

**Keyboard shortcuts** (`frontend/src/pages/Tests.jsx:508-518`):
7. `/` → focuses search input (when no input is focused).
8. `a` (with selection) → triggers bulk approve.
9. `r` (with selection) → triggers bulk reject.
10. `Esc` → clears selection.
11. Typing in inputs/textareas / contenteditable → shortcuts **must NOT** fire (verify `INPUT`/`TEXTAREA`/`isContentEditable` guard).

**Command palette** (`⌘K` / `Ctrl+K`):
12. Press `⌘K` (mac) or `Ctrl+K` (win/linux) → palette opens with navigation entries + AI chat entry.
13. Type a page name → fuzzy match; `Enter` navigates.
14. `Esc` closes the palette.

**Negative / edge:**
- Bulk action with 0 selected → action button disabled.
- Bulk action mid-run on the same tests → handled gracefully (queued or rejected with clear error).
- Refresh after partial bulk failure → state consistent (no half-applied bulk).

---

### 🪟 Modals (Tests page)

**Preconditions:** Tests page open.

For each modal: open → fill → submit → close behavior.

| Modal | Trigger | Verify |
|---|---|---|
| **CrawlProjectModal** | "Crawl" quick action | Default project pre-selected; mode picker (Link Crawl / State Exploration); Test Dials presets; submit kicks off crawl + closes modal. **Output: UI / browser tests** (Draft) — `page.goto` + role selectors + `safeClick` / `safeFill`; same-origin fetch/XHR additionally yields API tests |
| **GenerateTestModal** | "Generate Test" | **Default output: UI / browser tests** from the crawl context. API-shaped inputs (plain-English endpoint, OpenAPI upload, HAR upload, `METHOD /path` paste) produce API tests only when explicitly used; submit creates Draft tests |
| **RunRegressionModal** | "Run Regression" | Project picker, browser selector (Chromium/Firefox/WebKit), device dropdown, locale/timezone/geolocation (AUTO-007), network condition (`fast` / `slow3g` / `offline`, AUTO-006), parallelism 1–10; submit opens RunDetail |
| **ReviewModal** | "Review" / opening a Draft | Step-by-step approval queue; Approve/Reject/Skip; advances to next test |
| **RecorderModal** | "Record a test" | Live CDP screencast; record/stop controls; on stop saves Draft |
| **AiFixPanel** | "Fix with AI" on failed test | SSE token stream; diff vs current code; Accept/Discard |

**Common checks for every modal:**
- Click outside or `Esc` closes (only if no unsaved input — otherwise warns).
- Required fields validated inline; submit blocked with clear errors.
- Loading state shown during submission; double-click does not double-submit.

---

### 📤 API Test Imports (OpenAPI, HAR, plain-English API)

> Scope: this section covers **API test** generation paths only. UI / browser tests are generated from crawls and the Recorder — see [Tests Page §3](#-tests-page) and [Recorder](#-recorder).

**Preconditions:** GenerateTestModal open.

**Steps & expected:**
1. **OpenAPI import** — upload a valid OpenAPI 3.x spec → tests generated cover documented endpoints with status + JSON-shape assertions.
2. **HAR import** — upload a captured HAR file → tests generated for same-origin fetch/XHR calls in the HAR.
3. **Plain-English** — describe an endpoint ("POST /api/login expects 200 + token") → API test generated.
4. **`METHOD /path` patterns** — paste lines like `GET /api/users` → matching tests generated.

**Negative / edge:**
- Malformed OpenAPI / HAR → clear error, no crash.
- HAR with cross-origin / sensitive data → only same-origin requests included; auth headers stripped or masked in generated tests.
- Oversized HAR → rejected with size limit message.

---

### 🚀 Onboarding Tour ("Getting Started")

**Preconditions:** Fresh user OR Settings → "Restart Tour" clicked (`frontend/src/pages/Settings.jsx:1219-1243`).

**Steps & expected:**
1. First login → onboarding tour appears on `/dashboard`.
2. Tour walks through the primary surfaces (record what steps are shown).
3. Skip → tour dismissed; doesn't reappear on next login.
4. Settings → **Restart Tour** → page navigates to `/dashboard` and tour replays.
5. After restart, the previous "completed" state is cleared (verify via localStorage `onboarding` keys).

---

### 🎟️ Demo Mode & Per-User Quotas

**Preconditions:** Hosted deployment with `DEMO_GOOGLE_API_KEY` set (`docs/changelog.md` #94).

**Steps & expected:**
1. `GET /config` returns `{ demoMode: true, quota: { crawls, runs, generations } }`.
2. As a demo user (no own AI key), per-day quotas enforced: **2 crawls**, **3 runs**, **5 generations** (`demoQuota` middleware).
3. Hit each quota → next call returns 429 / "quota exceeded" with reset time.
4. Add own AI key (BYOK) → quotas bypass, `/config` reflects new state.
5. Counters use Redis when available, in-memory fallback otherwise — verify either by inspecting Redis or restarting backend (in-memory resets, Redis persists).

**Skip in self-hosted / unset env:** confirm `demoMode: false` and no quota headers in responses.

---

### ⚙️ Settings → Data tab (destructive admin actions)

**Preconditions:** Admin logged in. Settings → Data tab.

**Steps & expected:** (per `frontend/src/pages/Settings.jsx:1202-1213`)
1. **Clear Run History** — confirms intent → `api.clearRuns()` → all run records + logs/results gone; counts on Dashboard reset.
2. **Clear Activity Log** — `api.clearActivities()` → audit log empty.
3. **Clear Self-Healing History** — `api.clearHealing()` → next run starts the selector waterfall fresh (no remembered winners).
4. Counts displayed reflect current state (`sysInfo.runs`, `sysInfo.activities`, `sysInfo.healingEntries`).
5. Recycle Bin section also accessible from this tab — verify same behavior as `Recycle Bin` section above.

**Negative / edge:**
- Non-admin opens Settings → 403 (route is `requiredRole="admin"`, `frontend/src/App.jsx:66`).
- Clear actions show a confirmation step (no one-click destruction).
- Concurrent runs while clearing → in-flight runs handled gracefully (record observed behavior).

---

### 🔀 Workspace Switcher

**Preconditions:** User belongs to ≥ 2 workspaces.

**Steps & expected:**
1. Workspace switcher visible in sidebar/topbar.
2. Switch workspace → URL updates, all entity lists (projects/tests/runs/activity) scoped to the new workspace; no data leak from previous.
3. JWT carries `workspaceId` hint; role re-resolved from DB on every request (`docs/changelog.md` ACL-001/002 #88) → role change in DB takes effect within one request.
4. Direct API call with mismatched workspace ID → 403.

---

## 📱 Cross-Cutting Checks

Run these against the full browser matrix (Chrome, Firefox, Safari, Edge):

**Responsive / visual:**
- Mobile (375px), tablet (768px), desktop (1440px) — no broken layouts, no horizontal scroll, all buttons reachable.
- Dark mode — **automatic** via `prefers-color-scheme` (no manual toggle exists, `README.md:77`). Toggle the OS setting and reload; verify no illegible text, no white flashes, all icons visible.
- High-DPI / Retina — images crisp, no pixelation.

**State & navigation:**
- Refresh mid-flow on every page — no lost unsaved work without a warning; no broken state.
- Browser back / forward — URL and UI stay in sync; no stale modals.
- Open any page in a new tab via URL paste — loads correctly with auth.
- Deep-link to a run/test/project while logged out — redirected to login, then back to the target.

**Sidebar collapse / expand** (PR #1, `frontend/src/components/layout/Layout.jsx`, `frontend/src/components/layout/Sidebar.jsx`):
- Click the `PanelLeftClose` icon in the sidebar header → sidebar collapses to a 64px icon-only rail. Logo, workspace avatar, nav icons (with `title` tooltips), and Settings icon (admin only) remain visible. Active route shows the accent indicator.
- Click the logo or workspace avatar in the rail → sidebar expands back to 216px.
- Refresh any page → collapsed/expanded state persists via `localStorage` key `ui.sidebar.collapsed` (`Layout.jsx:21`). Clearing that key restores the default expanded state.
- Switch between pages while collapsed → main content fills the reclaimed horizontal space; no horizontal scroll.
- Workspace switcher dropdown is closed automatically on collapse (so it doesn't float into the main content area).
- Each rail nav item has a `title` attribute so hovering shows the page name (Dashboard, Projects, Tests, Runs, Reports, Automation, System, Settings).

**Performance:**
- Initial page load ≤ 3s on a local dev build over loopback (no formal SLO documented — file regressions against prior release).
- No memory leaks after 10 minutes of navigation (check DevTools heap snapshot).
- No unbounded network polling (check Network tab).

**Accessibility (spot check):**
- Keyboard-only navigation works on primary flows (tab order, focus rings visible, Enter/Space activates).
- Screen reader announces form errors and modals.
- No formal WCAG compliance target is documented — treat **WCAG 2.1 AA** as the working goal and file contrast / ARIA gaps as Minor.

**Internationalization:**
- Sentri does not document i18n / locale support — the app is effectively English-only. Long English strings must not break layouts; RTL testing is out of scope until locales are added.

---

## 🚨 Known Issues

> Do **not** re-file these. Link the ticket in your report if you encounter them.

Per the codebase, recorder (DIF-015) and visual diff (DIF-001) were implemented/fixed in `docs/changelog.md`; there is no live "known issues" register in the repo. Treat the rows below as **claims to verify** — if you reproduce any, open a ticket and replace this table with the real IDs.

> **Note:** "Deploy pages failing" and "image push failures" referenced in earlier drafts of this doc apply to the **CD GitHub Actions workflow** (`.github/workflows/cd.yml` — GitHub Pages + GHCR). They are **not user-facing flows** and are out of scope for manual QA. If they fail, escalate to engineering, do not log against a tester's session.

| Issue | Ticket | Repro | Workaround |
|---|---|---|---|
| Recorder empty-steps | ✅ Fixed in PR #118 — `filterEmittableActions` (`backend/src/runner/recorder.js:634-665`) drops ill-formed actions from both `steps[]` and `playwrightCode`. Locked down by a regression test in `backend/tests/recorder.test.js`. Leave the row here for one release as a verification reference. | Record a simple flow; verify `steps.length` equals the number of `// Step N:` comments in the Source tab. | n/a — should not reproduce. File a P1 bug if it does. |
| Visual diff false positives | _open_ | Re-run unchanged suite; check flagged steps | Tune `VISUAL_DIFF_THRESHOLD` / `VISUAL_DIFF_PIXEL_TOLERANCE` |

---

## 🐞 Bug Reporting Template

```
**Title:** [Area] Short description

**Severity:** Blocker / Critical / Major / Minor / Trivial
**Environment:** local / staging / preview — URL: ...
**Build / commit SHA:** ...
**Browser + version + OS:** e.g. Chrome 131 / macOS 14.6
**User role:** admin / qa_lead / viewer / outsider
**Workspace / Project / Test / Run IDs:** ...

**Preconditions:**
- ...

**Steps to reproduce:**
1. ...
2. ...

**Expected:**
- ...

**Actual:**
- ...

**Evidence:**
- Screenshot / screen recording
- Console errors (paste)
- Network request/response (paste or HAR)
- Server logs (if accessible)

**Reproducibility:** Always / Intermittent (N of M) / Once
**Regression?** First seen on build ...
```

---

## 📋 Coverage Checklist

Mark status per browser: ✅ pass · ❌ fail · ⚠️ partial · ⬜ not tested.

| Area | Chrome | Firefox | Safari | Edge | Notes / Bug links |
|---|---|---|---|---|---|
| **Golden E2E Happy Path (all 51 steps)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| Authentication | ⬜ | ⬜ | ⬜ | ⬜ | |
| Email Verification | ⬜ | ⬜ | ⬜ | ⬜ | |
| Workspaces | ⬜ | ⬜ | ⬜ | ⬜ | |
| Projects | ⬜ | ⬜ | ⬜ | ⬜ | |
| Tests (crawl modes, generate, search, exports) | ⬜ | ⬜ | ⬜ | ⬜ | |
| **UI / Browser Test Generation (default output)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| API Test Generation (additional output) | ⬜ | ⬜ | ⬜ | ⬜ | |
| Recorder | ⬜ | ⬜ | ⬜ | ⬜ | |
| Runs (cross-browser, mobile, parallel, abort, self-heal) | ⬜ | ⬜ | ⬜ | ⬜ | |
| **AI Fix (manual + auto feedback loop)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Test Code Editing (Steps ↔ Source)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| Automation (trigger tokens + schedules) | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Quality Gates (AUTO-012 — CRUD, evaluator, trigger response)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Run comparison (AUTO-019 — Compare action, prior-run picker, summary + diff rows)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| Visual Testing | ⬜ | ⬜ | ⬜ | ⬜ | |
| Dashboard | ⬜ | ⬜ | ⬜ | ⬜ | |
| AI Chat + Chat History | ⬜ | ⬜ | ⬜ | ⬜ | |
| AI Provider switching | ⬜ | ⬜ | ⬜ | ⬜ | |
| Settings | ⬜ | ⬜ | ⬜ | ⬜ | |
| Account / GDPR (export, delete) | ⬜ | ⬜ | ⬜ | ⬜ | |
| Recycle Bin | ⬜ | ⬜ | ⬜ | ⬜ | |
| Audit Log | ⬜ | ⬜ | ⬜ | ⬜ | |
| Notifications | ⬜ | ⬜ | ⬜ | ⬜ | |
| Security | ⬜ | ⬜ | ⬜ | ⬜ | |
| Permissions matrix | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Reports + Dashboard PDF + CSV** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **System diagnostics (`/system` + Settings → System)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **New Project page (`/projects/new`)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Runs list (`/runs`)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Project Detail (`/projects/:id`)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Bulk actions + keyboard shortcuts + ⌘K palette** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Modals (Crawl / Generate / Run / Review / Recorder / AiFix)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Imports (OpenAPI / HAR / API description)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Onboarding tour** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Demo mode + per-user quotas** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Settings → Data tab (destructive clears)** | ⬜ | ⬜ | ⬜ | ⬜ | |
| **Workspace switcher** | ⬜ | ⬜ | ⬜ | ⬜ | |
| Cross-cutting checks | ⬜ | ⬜ | ⬜ | ⬜ | |

> **Out of scope (not yet shipped):** MFA/2FA (`SEC-004`), public/shareable test report links, Jira integration, billing, CLI. Do not test these — file enhancement requests instead. The `/reports` page, Dashboard PDF export, standalone Playwright project export (`DIF-006`), and the embedded Playwright trace viewer (`DIF-005`, verified inline at Golden E2E step 31) **are** shipped and must be tested.

---

## ✅ Sign-off Criteria

A release is QA-approved only when **all** of the following are true:
- The **Golden E2E Happy Path** (51 steps) passes end-to-end on Chrome **and** at least one other browser from the matrix.
- Every row in the coverage checklist is ✅ across the required browser matrix.
- The permissions matrix has been verified end-to-end, including Outsider access attempts.
- All Security authorization checks return 403/404 (never the resource).
- No Blocker or Critical bugs are open; Major bugs have owners and ETAs.
- Known issues list is up to date (no new occurrences filed as duplicates).
- Bug reports include the full template (env, build SHA, browser, evidence).

---

## ❗ Rules

- Do NOT stop after the first bug — continue testing the remaining flows.
- Do NOT report a bug without a build/commit SHA and browser+OS.
- Do NOT file duplicates of Known Issues.
- Do NOT mark a flow as passing until **every** expected result is observed.
