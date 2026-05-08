/**
 * @module tests/healing-summary
 * @description Integration tests for GET /api/v1/healing/summary (CAP-004).
 */

import assert from "node:assert/strict";
import authRouter, { requireAuth } from "../src/routes/auth.js";
import healingRouter from "../src/routes/healing.js";
import * as projectRepo from "../src/database/repositories/projectRepo.js";
import * as testRepo from "../src/database/repositories/testRepo.js";
import * as healingRepo from "../src/database/repositories/healingRepo.js";
import { insertSample } from "../src/database/repositories/metricSamplesRepo.js";
import { createTestContext } from "./helpers/test-base.js";

const t = createTestContext();
const { app, workspaceScope } = t;

let mounted = false;
function mountRoutesOnce() {
  if (mounted) return;
  app.use("/api/auth", authRouter);
  app.use("/api/v1", requireAuth, workspaceScope, healingRouter);
  mounted = true;
}

async function main() {
  mountRoutesOnce();
  t.resetDb();
  const env = t.setupEnv({ SKIP_EMAIL_VERIFICATION: "true" });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { token, payload } = await t.registerAndLogin(base, {
      name: "QA", email: "heal@example.com", password: "Password123!",
    });
    const wsId = payload.workspaceId;

    // ── Empty workspace → empty payload shape ────────────────────────────
    let out = await t.req(base, "/api/v1/healing/summary", { method: "GET", token });
    assert.equal(out.res.status, 200);
    assert.deepEqual(out.json.strategies, []);
    assert.deepEqual(out.json.topSelectors, []);
    assert.equal(out.json.estimates.testsThatWouldHaveFailed, 0);
    assert.deepEqual(out.json.savingsTrend, []);

    // ── Seed two projects with healing histogram + savings samples ───────
    projectRepo.create({ id: "PRJ-HEAL-1", workspaceId: wsId, name: "P1", url: "https://a.test",
      createdAt: new Date().toISOString(), status: "idle" });
    projectRepo.create({ id: "PRJ-HEAL-2", workspaceId: wsId, name: "P2", url: "https://b.test",
      createdAt: new Date().toISOString(), status: "idle" });

    const nowIso = new Date().toISOString();
    testRepo.create({ id: "TC-HEAL-1", projectId: "PRJ-HEAL-1", name: "t1", playwrightCode: null, reviewStatus: "approved", workspaceId: wsId, createdAt: nowIso });
    testRepo.create({ id: "TC-HEAL-2", projectId: "PRJ-HEAL-2", name: "t2", playwrightCode: null, reviewStatus: "approved", workspaceId: wsId, createdAt: nowIso });

    healingRepo.set("TC-HEAL-1::click::Login", { strategyIndex: 0, succeededAt: new Date().toISOString(), failCount: 0 });
    healingRepo.set("TC-HEAL-1::click::Save",  { strategyIndex: 2, succeededAt: new Date().toISOString(), failCount: 1 });
    healingRepo.set("TC-HEAL-2::click::Save",  { strategyIndex: 2, succeededAt: new Date().toISOString(), failCount: 0 });
    healingRepo.set("TC-HEAL-2::fill::Email",  { strategyIndex: -1, succeededAt: null, failCount: 3 });

    insertSample({ projectId: "PRJ-HEAL-1", metricKey: "healing.savings", ts: 1000, value: 1 });
    insertSample({ projectId: "PRJ-HEAL-2", metricKey: "healing.savings", ts: 1000, value: 2 });
    insertSample({ projectId: "PRJ-HEAL-1", metricKey: "healing.savings", ts: 2000, value: 4 });

    out = await t.req(base, "/api/v1/healing/summary", { method: "GET", token });
    assert.equal(out.res.status, 200);

    // 2 entries with strategyIndex > 0 → "would have failed" without healing.
    assert.equal(out.json.estimates.testsThatWouldHaveFailed, 2);

    // Top selectors: only healed ones, sorted by heal count (deduplicated).
    assert.equal(out.json.topSelectors.length, 1, "click::Save merged across two tests");
    assert.equal(out.json.topSelectors[0].selector, "click::Save");
    assert.equal(out.json.topSelectors[0].healCount, 2);

    // Savings trend aggregates ts=1000 across BOTH projects (1+2=3) and
    // includes ts=2000 from project 1 only (=4). This is the regression
    // for the original bug where only projectIds[0] was queried.
    assert.equal(out.json.savingsTrend.length, 2);
    assert.equal(out.json.savingsTrend[0].ts, 1000);
    assert.equal(out.json.savingsTrend[0].value, 3);
    assert.equal(out.json.savingsTrend[1].ts, 2000);
    assert.equal(out.json.savingsTrend[1].value, 4);

    // Strategies: index 0 (1/1), index 2 (2/2), index -1 (0/1).
    const byIdx = Object.fromEntries(out.json.strategies.map((s) => [s.strategyIndex, s]));
    assert.equal(byIdx[0].successRate, 1);
    assert.equal(byIdx[2].successRate, 1);
    assert.equal(byIdx[-1].successRate, 0);

    // ── Viewer role can read the summary (telemetry is viewer-gated) ─────
    const db = t.getDatabase();
    db.prepare("UPDATE workspace_members SET role = 'viewer'").run();
    out = await t.req(base, "/api/v1/healing/summary", { method: "GET", token });
    assert.equal(out.res.status, 200, "viewer role must be allowed to read telemetry");
  } finally {
    env.restore();
    await new Promise((r) => server.close(r));
  }
}

main().then(() => console.log("healing-summary.test.js passed")).catch((e) => { console.error(e); process.exit(1); });
