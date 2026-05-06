// Integration tests for AUTO-003b HTTP routes:
//   - POST /api/v1/tests/:testId/revoke      (qa_lead+)
//   - GET  /api/v1/projects/:id/approval-stats
//
// Companion to backend/tests/auto-approval.test.js, which covers the
// pipeline-level auto-approval + revoke logic via direct repo calls. This
// file exercises the actual Express handlers end-to-end so the route
// guards, workspace scoping, and JSON shape are covered.

import assert from "node:assert/strict";
import authRouter, { requireAuth } from "../src/routes/auth.js";
import projectsRouter from "../src/routes/projects.js";
import testsRouter from "../src/routes/tests.js";
import * as testRepo from "../src/database/repositories/testRepo.js";
import { createTestContext } from "./helpers/test-base.js";

const t = createTestContext();
const { app, workspaceScope } = t;

let mounted = false;
function mountRoutesOnce() {
  if (mounted) return;
  app.use("/api/auth", authRouter);
  app.use("/api/v1/projects", requireAuth, workspaceScope, projectsRouter);
  app.use("/api/v1", requireAuth, workspaceScope, testsRouter);
  mounted = true;
}

async function main() {
  mountRoutesOnce();
  t.resetDb();
  const env = t.setupEnv({ SKIP_EMAIL_VERIFICATION: "true" });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { token } = await t.registerAndLogin(base, {
      name: "QA", email: `qa-${Date.now()}@example.com`, password: "Password123!",
    });

    // Create a project and seed an auto-approved test directly via the repo
    // (mirrors what `persistGeneratedTests` writes when threshold is met).
    const created = await t.req(base, "/api/v1/projects", {
      method: "POST", token, body: { name: "P", url: "https://example.com" },
    });
    assert.equal(created.res.status, 201);
    const projectId = created.json.id;

    const testId = "TST-AUTO-1";
    testRepo.create({
      id: testId,
      projectId,
      name: "auto-approved test",
      steps: [],
      reviewStatus: "approved",
      reviewedAt: new Date().toISOString(),
      confidenceScore: 0.92,
      approvalSource: "auto",
      approvalThreshold: 0.8,
      approvedAt: Date.now(),
      approvedBy: "auto-approver",
      createdAt: new Date().toISOString(),
    });

    // ── approval-stats: counts the auto-approved test ─────────────────────
    let out = await t.req(base, `/api/v1/projects/${projectId}/approval-stats`, { token });
    assert.equal(out.res.status, 200);
    assert.equal(out.json.auto, 1);
    assert.equal(out.json.human, 0);
    assert.equal(typeof out.json.revertRate7d, "number");

    // ── revoke: clears all five provenance columns + reviewedAt ───────────
    out = await t.req(base, `/api/v1/tests/${testId}/revoke`, { method: "POST", token });
    assert.equal(out.res.status, 200);
    assert.equal(out.json.reviewStatus, "draft");
    assert.equal(out.json.approvalSource, null);
    assert.equal(out.json.approvalThreshold, null);
    assert.equal(out.json.approvedAt, null);
    assert.equal(out.json.approvedBy, null);
    assert.equal(out.json.reviewedAt, null);

    // ── revoke is idempotent-guarded: drafts can't be revoked ─────────────
    out = await t.req(base, `/api/v1/tests/${testId}/revoke`, { method: "POST", token });
    assert.equal(out.res.status, 400);

    // ── 404: revoke unknown test ──────────────────────────────────────────
    out = await t.req(base, `/api/v1/tests/NOPE/revoke`, { method: "POST", token });
    assert.equal(out.res.status, 404);

    // ── 404: cross-workspace ACL (second user can't see this project) ─────
    const { token: otherToken } = await t.registerAndLogin(base, {
      name: "U2", email: `u2-${Date.now()}@example.com`, password: "Password123!",
    });
    out = await t.req(base, `/api/v1/projects/${projectId}/approval-stats`, { token: otherToken });
    assert.equal(out.res.status, 404);

    console.log("✅ auto-approval-routes: all checks passed");
  } finally {
    env.restore();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error("❌ auto-approval-routes failed:", err);
  process.exit(1);
});
