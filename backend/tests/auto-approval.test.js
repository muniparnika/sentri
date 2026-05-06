import assert from "node:assert/strict";
import { resetDb } from "./helpers/test-base.js";
import * as testRepo from "../src/database/repositories/testRepo.js";
import * as activityRepo from "../src/database/repositories/activityRepo.js";
import { persistGeneratedTests } from "../src/pipeline/testPersistence.js";

function makeRun() {
  return { tests: [] };
}

function makeProject(overrides = {}) {
  return {
    id: "PRJ-1",
    name: "Proj",
    url: "https://example.com",
    workspaceId: "ws-1",
    ...overrides,
  };
}

function makeTest(confidenceScore) {
  return { name: "Generated", steps: ["step"], confidenceScore, _quality: confidenceScore };
}

async function main() {
  resetDb();

  {
    const run = makeRun();
    const ids = persistGeneratedTests([makeTest(0.95)], makeProject({ autoApproveThreshold: null }), run);
    const saved = testRepo.getById(ids[0]);
    assert.equal(saved.reviewStatus, "draft");
    assert.equal(saved.approvalSource, null);
  }

  {
    const run = makeRun();
    const ids = persistGeneratedTests([makeTest(0.4)], makeProject({ autoApproveThreshold: 0.8 }), run);
    const saved = testRepo.getById(ids[0]);
    assert.equal(saved.reviewStatus, "draft");
  }

  {
    const run = makeRun();
    const ids = persistGeneratedTests([makeTest(0.9)], makeProject({ autoApproveThreshold: 0.8 }), run);
    const saved = testRepo.getById(ids[0]);
    assert.equal(saved.reviewStatus, "approved");
    assert.equal(saved.approvalSource, "auto");
    assert.equal(saved.approvalThreshold, 0.8);
    assert.equal(saved.approvedBy, "auto-approver");
    const activities = activityRepo.getFiltered({ type: "test.auto_approved", projectId: "PRJ-1" });
    assert.ok(activities.some((a) => a.testId === ids[0] && a.userName === "auto-approver"));
  }

  console.log("✅ auto-approval passed");
}

main().catch((err) => {
  console.error("❌ auto-approval failed:", err);
  process.exit(1);
});
