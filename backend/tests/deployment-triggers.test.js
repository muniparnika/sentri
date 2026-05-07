import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { app } from "../src/middleware/appSetup.js";
import triggerRouter from "../src/routes/trigger.js";
import * as projectRepo from "../src/database/repositories/projectRepo.js";
import * as webhookTokenRepo from "../src/database/repositories/webhookTokenRepo.js";
import * as runRepo from "../src/database/repositories/runRepo.js";
import * as activityRepo from "../src/database/repositories/activityRepo.js";
import { runAbortControllers } from "../src/utils/runWithAbort.js";

let mounted = false;
if (!mounted) {
  app.use("/api", triggerRouter);
  mounted = true;
}

function sign(algo, body, secret) {
  return crypto.createHmac(algo, secret).update(body).digest("hex");
}

async function main() {
  process.env.VERCEL_WEBHOOK_SECRET = "vercel-secret";
  process.env.NETLIFY_WEBHOOK_SECRET = "netlify-secret";

  const server = createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // ── Vercel: requests without a Bearer trigger token are rejected by
    //    requireTrigger BEFORE the HMAC check, even with a valid signature.
    //    This proves the dual-auth model (HMAC + project-scoped token) is
    //    enforced — a leaked global webhook secret alone cannot trigger
    //    crawls on arbitrary project IDs.
    const vercelBody = JSON.stringify({ deployment: { url: "my-app-preview.vercel.app" } });
    const vercelSig = sign("sha1", vercelBody, process.env.VERCEL_WEBHOOK_SECRET);
    let res = await fetch(`${base}/api/projects/PRJ-1/trigger/vercel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vercel-Signature": vercelSig },
      body: vercelBody,
    });
    assert.equal(res.status, 401, "valid HMAC without Bearer token must be rejected");

    // Bogus Bearer token still rejected
    res = await fetch(`${base}/api/projects/PRJ-1/trigger/vercel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vercel-Signature": vercelSig,
        "Authorization": "Bearer not-a-real-token",
      },
      body: vercelBody,
    });
    assert.equal(res.status, 401, "invalid Bearer token must be rejected");

    // ── Netlify: same dual-auth contract
    const netlifyBody = JSON.stringify({ deploy_ssl_url: "https://deploy-preview.netlify.app" });
    const netlifySig = sign("sha256", netlifyBody, process.env.NETLIFY_WEBHOOK_SECRET);
    res = await fetch(`${base}/api/projects/PRJ-1/trigger/netlify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Netlify-Token": netlifySig },
      body: netlifyBody,
    });
    assert.equal(res.status, 401, "Netlify: valid HMAC without Bearer token must be rejected");

    res = await fetch(`${base}/api/projects/PRJ-1/trigger/netlify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: netlifyBody,
    });
    assert.equal(res.status, 401, "Netlify: missing both auth layers must be rejected");

    // ── Happy path (NEXT.md:156): valid HMAC + Bearer → 202, run row created,
    //    `crawl.start.deployment` activity logged with provider + previewUrl
    //    + runId. We abort the in-flight crawl immediately after the 202 so
    //    the Playwright browser never actually launches — this proves the
    //    "deploy → detect → generate" loop is wired without paying for a
    //    real browser session in the unit-test runner.
    const proj = {
      id: "PRJ-DEPLOY-HAPPY",
      name: "Deployment Happy Path",
      url: "https://prod.example.com",
      createdAt: new Date().toISOString(),
      status: "idle",
    };
    projectRepo.create(proj);
    const plaintext = webhookTokenRepo.generateToken();
    webhookTokenRepo.create({
      id: "WH-DEPLOY-HAPPY",
      projectId: proj.id,
      tokenHash: webhookTokenRepo.hashToken(plaintext),
      label: "deploy-test",
    });

    const happyBody = JSON.stringify({ deployment: { url: "preview-deploy-happy.vercel.app" } });
    const happySig = sign("sha1", happyBody, process.env.VERCEL_WEBHOOK_SECRET);
    const happyRes = await fetch(`${base}/api/projects/${proj.id}/trigger/vercel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vercel-Signature": happySig,
        "Authorization": `Bearer ${plaintext}`,
      },
      body: happyBody,
    });
    assert.equal(happyRes.status, 202, "valid HMAC + Bearer should accept and dispatch");
    const happyJson = await happyRes.json();
    assert.equal(happyJson.ok, true);
    assert.equal(happyJson.provider, "vercel");
    assert.equal(happyJson.previewUrl, "https://preview-deploy-happy.vercel.app");
    assert.match(happyJson.runId, /^RUN-/);

    // AUTO-015b: marker activity row logged with provider + previewUrl + runId
    // so the "Last deployment run" badge query can find it.
    const markers = activityRepo.getFiltered({
      type: "crawl.start.deployment",
      projectId: proj.id,
      limit: 1,
    });
    assert.equal(markers.length, 1, "crawl.start.deployment activity row must be logged");
    assert.equal(markers[0].meta?.provider, "vercel");
    assert.equal(markers[0].meta?.previewUrl, "https://preview-deploy-happy.vercel.app");
    assert.equal(markers[0].meta?.runId, happyJson.runId);

    // Run row persisted with type:"crawl" and references the project.
    const run = runRepo.getById(happyJson.runId);
    assert.ok(run, "run row must be persisted");
    assert.equal(run.type, "crawl");
    assert.equal(run.projectId, proj.id);

    // Abort the in-flight crawl so the Playwright browser launch is cancelled
    // before it actually starts a session. This keeps the unit test
    // browser-free without losing the wiring assertions above.
    const entry = runAbortControllers.get(happyJson.runId);
    if (entry) {
      entry.controller.abort();
      runAbortControllers.delete(happyJson.runId);
    }

    console.log("deployment-triggers.test.js passed");
  } finally {
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
