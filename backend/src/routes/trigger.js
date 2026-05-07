/**
 * @module routes/trigger
 * @description CI/CD webhook trigger routes (ENH-011). Mounted at `/api/v1` (INF-005)
 * without `requireAuth` — this router handles its own token-based authentication so
 * CI pipelines can call it with a per-project Bearer token rather than a user JWT.
 *
 * ### Endpoints
 * | Method   | Path                                        | Auth              | Description                        |
 * |----------|---------------------------------------------|-------------------|------------------------------------|
 * | `POST`   | `/api/v1/projects/:id/trigger`              | Bearer token      | Start a CI/CD test run             |
 * | `GET`    | `/api/v1/projects/:id/trigger-tokens`       | JWT (requireAuth) | List tokens — see runs.js          |
 * | `POST`   | `/api/v1/projects/:id/trigger-tokens`       | JWT (requireAuth) | Create token — see runs.js         |
 * | `DELETE` | `/api/v1/projects/:id/trigger-tokens/:tid`  | JWT (requireAuth) | Revoke token — see runs.js         |
 *
 * Token management endpoints (list/create/delete) live in `runs.js` and are
 * protected by `requireAuth`.  Only `POST /trigger` is here, unprotected.
 */

import { Router } from "express";
import crypto from "node:crypto";
import * as runRepo from "../database/repositories/runRepo.js";
import * as testRepo from "../database/repositories/testRepo.js";
import * as webhookTokenRepo from "../database/repositories/webhookTokenRepo.js";
import { generateRunId } from "../utils/idGenerator.js";
import { logActivity } from "../utils/activityLogger.js";
import { runWithAbort } from "../utils/runWithAbort.js";
import { resolveDialsConfig, resolveDialsPrompt } from "../testDials.js";
import { runTests } from "../testRunner.js";
import { crawlAndGenerateTests } from "../crawler.js";
import { classifyError } from "../utils/errorClassifier.js";
import { expensiveOpLimiter, signRunArtifacts } from "../middleware/appSetup.js";
import { requireTrigger } from "../middleware/authenticate.js";
import { fireNotifications } from "../utils/notifications.js";
import { validateUrl, safeFetch } from "../utils/ssrfGuard.js";

// ─── SSRF protection for callbackUrl ──────────────────────────────────────────
// Two-layer defence provided by utils/ssrfGuard.js:
//   1. validateUrl() — synchronous string checks + async DNS resolution
//      to block domains that resolve to private/reserved IPs.
//   2. safeFetch() — fires the actual request with `redirect: "error"` to
//      prevent open-redirect bypasses (302 → http://169.254.169.254/…),
//      and re-resolves DNS to mitigate DNS rebinding.

/**
 * Thin wrapper around safeFetch for the callbackUrl POST.
 * Best-effort: errors are silently caught so a failing callback never
 * affects the run outcome.
 *
 * @param {string} url      - The validated callbackUrl.
 * @param {string} payload  - JSON string body.
 */
async function safeFetchCallback(url, payload) {
  await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
}

const router = Router();

// Trigger-token authentication is handled by `requireTrigger` from
// middleware/authenticate.js — the centralised strategy-pattern middleware.
// It sets req.triggerToken and req.triggerProject on success, with
// detailed error messages (401/403/404) on failure.

/**
 * POST /api/projects/:id/trigger
 * Token-authenticated endpoint for CI/CD pipelines (ENH-011).
 *
 * ### Authentication
 * Pass the project trigger token as a Bearer token:
 * ```
 * Authorization: Bearer <plaintext-token>
 * ```
 * This endpoint does NOT accept JWTs — only tokens created via
 * `POST /api/projects/:id/trigger-tokens`.
 *
 * ### Request body (all fields optional)
 * ```json
 * {
 *   "callbackUrl":  "https://ci.example.com/hooks/sentri",
 *   "dialsConfig":  { "parallelWorkers": 2 }
 * }
 * ```
 *
 * ### Response `202 Accepted`
 * ```json
 * { "runId": "RUN-42", "statusUrl": "https://sentri.example.com/api/runs/RUN-42" }
 * ```
 * Poll `statusUrl` until `status` is no longer `"running"`.
 *
 * ### Error responses
 * | Code | Reason                                         |
 * |------|------------------------------------------------|
 * | 400  | No approved tests                              |
 * | 401  | Missing or invalid Bearer token                |
 * | 403  | Token belongs to a different project           |
 * | 404  | Project not found                              |
 * | 409  | Another run already in progress                |
 * | 429  | Rate limit exceeded (expensiveOpLimiter)       |
 *
 * @param {Object}  req - Express request
 * @param {Object} res - Express response
 */
router.post("/projects/:id/trigger", expensiveOpLimiter, requireTrigger, async (req, res) => {
  const { triggerToken: tokenRow, triggerProject: project } = req;

  // ── 3. Extract and validate optional config (async) ────────────────
  // callbackUrl validation includes DNS resolution, so it must happen
  // BEFORE the synchronous concurrent-run guard to avoid a TOCTOU race
  // (an await between the guard and runRepo.create would let a second
  // request slip through).
  const { dialsConfig, callbackUrl } = req.body || {};

  if (callbackUrl && typeof callbackUrl === "string") {
    // Length cap — prevent abuse via extremely long URLs
    if (callbackUrl.length > 2048) {
      return res.status(400).json({ error: "callbackUrl exceeds maximum length (2048 characters)." });
    }
    const urlErr = await validateUrl(callbackUrl);
    if (urlErr) return res.status(400).json({ error: urlErr });
  }

  // SSRF protection for previewUrl — same DNS-resolving validation used for
  // callbackUrl. Without this, a valid trigger token could redirect the
  // browser crawl at an internal address (e.g. cloud metadata, RFC1918).
  if (req.body?.previewUrl && typeof req.body.previewUrl === "string") {
    if (req.body.previewUrl.length > 2048) {
      return res.status(400).json({ error: "previewUrl exceeds maximum length (2048 characters)." });
    }
    const previewErr = await validateUrl(req.body.previewUrl);
    if (previewErr) return res.status(400).json({ error: previewErr });
  }

  const validatedDials = resolveDialsConfig(dialsConfig);
  const parallelWorkers = validatedDials?.parallelWorkers ?? 1;
  // AUTO-002 / AUTO-015: honour dialsConfig on the crawl path too — `runs.js`
  // already derives these from the same `validatedDials` and forwards them to
  // crawlAndGenerateTests at runs.js:108. Without this the trigger path
  // silently runs every crawl with defaults regardless of caller config.
  const dialsPrompt = resolveDialsPrompt(dialsConfig);
  const testCount = validatedDials?.testCount || "ai_decides";
  const explorerMode = validatedDials?.exploreMode || "crawl";
  const explorerTuning = {
    maxStates:     validatedDials?.exploreMaxStates     ?? 30,
    maxDepth:      validatedDials?.exploreMaxDepth      ?? 3,
    maxActions:    validatedDials?.exploreMaxActions    ?? 8,
    actionTimeout: validatedDials?.exploreActionTimeout ?? 5000,
  };

  // ── 4. Guard: no concurrent run ───────────────────────────────────────
  // From here to runRepo.create() the code is fully synchronous, so no
  // other request can interleave and pass the same guard.
  const existingRun = runRepo.findActiveByProjectId(project.id);
  if (existingRun) {
    return res.status(409).json({
      error: `A run is already in progress (${existingRun.id}).`,
      runId: existingRun.id,
    });
  }

  const triggerCrawl = req.body?.triggerCrawl === true;
  const previewUrl = typeof req.body?.previewUrl === "string" ? req.body.previewUrl : null;
  const allTests = testRepo.getByProjectId(project.id);
  const tests = allTests.filter((t) => t.reviewStatus === "approved");
  if (!triggerCrawl) {
    if (!allTests.length) return res.status(400).json({ error: "No tests found — crawl first." });
    if (!tests.length) return res.status(400).json({ error: "No approved tests — review generated tests before triggering." });
  }

  // ── 6. Create and start the run ──────────────────────────────────────
  const runId = generateRunId();
  const run = {
    id: runId,
    projectId: project.id,
    type: triggerCrawl ? "crawl" : "test_run",
    status: "running",
    startedAt: new Date().toISOString(),
    logs: [],
    results: [],
    passed: 0,
    failed: 0,
    total: triggerCrawl ? 0 : tests.length,
    parallelWorkers,
    // tests[] is required by persistGeneratedTests (testPersistence.js)
    // which calls run.tests.push(testId) when triggerCrawl runs the
    // crawlAndGenerateTests path. Without this, the crawl crashes at
    // the persistence step with "Cannot read properties of undefined".
    tests: [],
    testQueue: triggerCrawl ? [] : tests.map((t) => ({ id: t.id, name: t.name, steps: t.steps || [] })),
    workspaceId: project.workspaceId || null,
  };
  runRepo.create(run);

  // Record that this token was used (updates lastUsedAt)
  webhookTokenRepo.touch(tokenRow.id);

  logActivity({
    type: "test_run.start",
    projectId: project.id,
    projectName: project.name,
    workspaceId: project.workspaceId,
    detail: `CI/CD triggered test run — ${tests.length} test${tests.length !== 1 ? "s" : ""}${parallelWorkers > 1 ? ` (${parallelWorkers}x parallel)` : ""}`,
    status: "running",
  });

  runWithAbort(runId, run,
    (signal) => triggerCrawl
      // AUTO-002 / AUTO-015: when crawling a preview URL we overwrite
      // `project.url` with `previewUrl`, but we MUST preserve the original
      // production URL as `canonicalUrl` so the diff-aware baseline guard
      // in crawler.js can detect this is a preview crawl and skip
      // replacing the production baselines. Without this, the sameOrigin
      // check sees preview === preview (both sides equal because project.url
      // was already overridden) and silently destroys the real fingerprints.
      ? crawlAndGenerateTests(
          { ...project, url: previewUrl || project.url, canonicalUrl: project.url },
          run,
          { dialsPrompt, testCount, explorerMode, explorerTuning, signal }
        )
      : runTests(project, tests, run, { parallelWorkers, signal }),
    {
      onSuccess: () => {
        logActivity({
          type: "test_run.complete",
          projectId: project.id,
          projectName: project.name,
          workspaceId: project.workspaceId,
          detail: `CI/CD run completed — ${run.passed || 0} passed, ${run.failed || 0} failed`,
        });
      },
      onFailActivity: (err) => ({
        type: "test_run.fail",
        projectId: project.id,
        projectName: project.name,
        workspaceId: project.workspaceId,
        detail: `CI/CD run failed: ${classifyError(err, "run").message}`,
      }),
      // Fire optional callback URL with run summary on ANY terminal state
      // (completed, failed, aborted) so CI pipelines always get notified.
      // Uses safeFetchCallback which re-resolves DNS (mitigates rebinding)
      // and blocks redirects (mitigates open-redirect SSRF bypass).
      onComplete: async (finishedRun) => {
        // FEA-001: Fire failure notifications — best-effort
        try { await fireNotifications(finishedRun, project); } catch { /* best-effort */ }

        if (!callbackUrl || typeof callbackUrl !== "string") return;
        const payload = JSON.stringify({
          runId,
          status: finishedRun.status,
          passed: finishedRun.passed,
          failed: finishedRun.failed,
          total: finishedRun.total,
          error: finishedRun.error || null,
          gateResult: finishedRun.gateResult || null,
          webVitalsResult: finishedRun.webVitalsResult || null,
        });
        safeFetchCallback(callbackUrl, payload)
          .catch(() => { /* best-effort — never fails the run */ });
      },
    },
  );

  // ── 7. Return 202 immediately — client polls statusUrl ───────────────
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"]  || req.get("host");
  // Point to the token-authenticated status endpoint so CI pipelines can
  // poll without a JWT — they reuse the same Bearer token.
  const statusUrl = `${proto}://${host}/api/v1/projects/${project.id}/trigger/runs/${runId}`;

  res.status(202).json({ runId, statusUrl });
});

function verifyWebhookSignature(provider, rawBody, signatureHeader) {
  const secret = provider === "vercel" ? process.env.VERCEL_WEBHOOK_SECRET : process.env.NETLIFY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader || !rawBody) return false;
  const algo = provider === "vercel" ? "sha1" : "sha256";
  const expected = crypto.createHmac(algo, secret).update(rawBody).digest("hex");
  const provided = signatureHeader.startsWith(`${algo}=`) ? signatureHeader.slice(algo.length + 1) : signatureHeader;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Launch a crawl run against a deployment-preview URL. Shared by the Vercel
 * and Netlify webhook handlers below — kept in one place so the run-object
 * shape and runWithAbort wiring stay aligned with `runs.js:71-127`
 * (the canonical crawl entry point).
 *
 * The caller must have already (a) verified the provider's HMAC signature,
 * (b) authenticated the trigger token via requireTrigger, and (c) validated
 * `previewUrl` via SSRF guard.
 *
 * AUTO-015b: emits a dedicated `crawl.start.deployment` activity row (see
 * below) alongside the standard `crawl.start`, so the "Last deployment run"
 * badge on the project header can distinguish webhook-launched crawls from
 * manually-triggered ones via the activity log without a schema change.
 */
async function launchPreviewCrawl({ project, previewUrl, provider, tokenRow, dialsConfig }) {
  // AUTO-002 / AUTO-015: derive crawl options from optional dialsConfig in the
  // webhook payload. Provider webhook bodies don't carry these today, but
  // future Vercel/Netlify integrations (or Sentri-side admin overrides) can
  // pass them through — keeping the signature uniform with POST /trigger
  // means there's no second config-routing path to maintain.
  const validatedDials = resolveDialsConfig(dialsConfig);
  const dialsPrompt = resolveDialsPrompt(dialsConfig);
  const testCount = validatedDials?.testCount || "ai_decides";
  const explorerMode = validatedDials?.exploreMode || "crawl";
  const explorerTuning = {
    maxStates:     validatedDials?.exploreMaxStates     ?? 30,
    maxDepth:      validatedDials?.exploreMaxDepth      ?? 3,
    maxActions:    validatedDials?.exploreMaxActions    ?? 8,
    actionTimeout: validatedDials?.exploreActionTimeout ?? 5000,
  };

  // Concurrent-run guard — same as POST /trigger
  const existingRun = runRepo.findActiveByProjectId(project.id);
  if (existingRun) {
    return { status: 409, body: { error: `A run is already in progress (${existingRun.id}).`, runId: existingRun.id } };
  }

  const runId = generateRunId();
  const run = {
    id: runId,
    projectId: project.id,
    type: "crawl",
    status: "running",
    startedAt: new Date().toISOString(),
    logs: [],
    tests: [],
    pagesFound: 0,
    workspaceId: project.workspaceId || null,
  };
  runRepo.create(run);

  if (tokenRow) webhookTokenRepo.touch(tokenRow.id);

  // AUTO-015 / AUTO-015b: log the standard `crawl.start` so dashboard
  // counters treat this like any other crawl, PLUS a dedicated
  // `crawl.start.deployment` marker so the "Last deployment run" badge
  // on the project header (NEXT.md:69) can distinguish webhook-launched
  // runs from manually-triggered ones without a schema change. The
  // `meta` payload carries the provider + preview URL + runId for the
  // badge query in `GET /projects/:id/last-deployment-run`.
  logActivity({
    type: "crawl.start",
    projectId: project.id,
    projectName: project.name,
    workspaceId: project.workspaceId,
    detail: `${provider} deployment webhook — crawl ${previewUrl}`,
    status: "running",
  });
  logActivity({
    type: "crawl.start.deployment",
    projectId: project.id,
    projectName: project.name,
    workspaceId: project.workspaceId,
    detail: `${provider} deployment — ${previewUrl}`,
    status: "running",
    meta: { provider, previewUrl, runId },
  });

  runWithAbort(runId, run,
    // AUTO-015: preserve `canonicalUrl` alongside the preview-URL override —
    // crawler.js's sameOrigin guard needs the original project URL to
    // detect that this is a preview crawl and skip baseline replacement.
    // Without this, production baselines would be overwritten with
    // preview-URL fingerprints every time a deployment webhook fires.
    (signal) => crawlAndGenerateTests(
      { ...project, url: previewUrl, canonicalUrl: project.url },
      run,
      { dialsPrompt, testCount, explorerMode, explorerTuning, signal }
    ),
    {
      onSuccess: () => logActivity({
        type: "crawl.complete",
        projectId: project.id,
        projectName: project.name,
        workspaceId: project.workspaceId,
        detail: `${provider} preview crawl completed — ${run.pagesFound || 0} pages, ${run.tests?.length || 0} test(s) generated`,
      }),
      onFailActivity: (err) => ({
        type: "crawl.fail",
        projectId: project.id,
        projectName: project.name,
        workspaceId: project.workspaceId,
        detail: `${provider} preview crawl failed: ${classifyError(err, "crawl").message}`,
      }),
      onComplete: async (finishedRun) => {
        try { await fireNotifications(finishedRun, project); } catch { /* best-effort */ }
      },
    },
  );

  return { status: 202, body: { ok: true, provider, runId, previewUrl } };
}

/**
 * Webhook handlers require BOTH:
 *   1. A valid HMAC signature from the deployment provider (proves Vercel/
 *      Netlify sent the payload — protects against forged calls).
 *   2. A project-scoped trigger token via `requireTrigger` (proves which
 *      project should run — without this, a single global webhook secret
 *      would let any signed payload trigger any project ID in the URL).
 */
router.post("/projects/:id/trigger/vercel", expensiveOpLimiter, requireTrigger, async (req, res) => {
  const sig = req.get("X-Vercel-Signature");
  if (!verifyWebhookSignature("vercel", req.rawBody, sig)) return res.status(401).json({ error: "invalid signature" });

  const deploymentUrl = req.body?.deployment?.url;
  if (!deploymentUrl) return res.status(400).json({ error: "deployment.url missing from payload" });
  const previewUrl = `https://${String(deploymentUrl).replace(/^https?:\/\//, "")}`;

  // SSRF guard — same DNS-resolving validation used elsewhere in this file
  if (previewUrl.length > 2048) return res.status(400).json({ error: "previewUrl exceeds maximum length (2048 characters)." });
  const previewErr = await validateUrl(previewUrl);
  if (previewErr) return res.status(400).json({ error: previewErr });

  const { triggerProject: project, triggerToken: tokenRow } = req;
  const { status, body } = await launchPreviewCrawl({ project, previewUrl, provider: "vercel", tokenRow });
  res.status(status).json(body);
});

router.post("/projects/:id/trigger/netlify", expensiveOpLimiter, requireTrigger, async (req, res) => {
  const sig = req.get("X-Netlify-Token");
  if (!verifyWebhookSignature("netlify", req.rawBody, sig)) return res.status(401).json({ error: "invalid signature" });

  const previewUrl = req.body?.deploy_ssl_url || req.body?.deploy_url || null;
  if (!previewUrl) return res.status(400).json({ error: "deploy_ssl_url / deploy_url missing from payload" });

  if (previewUrl.length > 2048) return res.status(400).json({ error: "previewUrl exceeds maximum length (2048 characters)." });
  const previewErr = await validateUrl(previewUrl);
  if (previewErr) return res.status(400).json({ error: previewErr });

  const { triggerProject: project, triggerToken: tokenRow } = req;
  const { status, body } = await launchPreviewCrawl({ project, previewUrl, provider: "netlify", tokenRow });
  res.status(status).json(body);
});

/**
 * GET /api/projects/:id/trigger/runs/:runId
 * Token-authenticated run status endpoint for CI/CD pipelines.
 *
 * Uses the same Bearer token auth as POST /trigger so CI pipelines can
 * poll for run completion without a JWT.
 *
 * @param {Object}  req - Express request
 * @param {Object} res - Express response
 */
router.get("/projects/:id/trigger/runs/:runId", requireTrigger, (req, res) => {
  const { triggerProject: project } = req;

  // ── Fetch run ──────────────────────────────────────────────────────
  const run = runRepo.getById(req.params.runId);
  if (!run) return res.status(404).json({ error: "run not found" });
  if (run.projectId !== project.id) {
    return res.status(404).json({ error: "run not found" });
  }

  // Return a minimal status payload (no logs or heavy data)
  res.json(signRunArtifacts({
    id: run.id,
    status: run.status,
    passed: run.passed,
    failed: run.failed,
    total: run.total,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    duration: run.duration || null,
    error: run.error || null,
    gateResult: run.gateResult || null,
    webVitalsResult: run.webVitalsResult || null,
  }));
});

export default router;
