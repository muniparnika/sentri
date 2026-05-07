import assert from "node:assert/strict";
import { resetDb } from "./helpers/test-base.js";
import * as testRepo from "../src/database/repositories/testRepo.js";
import * as projectRepo from "../src/database/repositories/projectRepo.js";
import * as activityRepo from "../src/database/repositories/activityRepo.js";
import { persistGeneratedTests } from "../src/pipeline/testPersistence.js";

let projectCounter = 0;

function makeRun() {
  return { tests: [] };
}

// Inserts a real project row so the FK on `tests.projectId` is satisfied
// when `persistGeneratedTests` calls `testRepo.create()`. Each call gets a
// unique id to avoid PK collisions across the test blocks below.
function makeProject(overrides = {}) {
  const project = {
    id: `PRJ-${++projectCounter}`,
    name: "Proj",
    url: "https://example.com",
    // Omit workspaceId — `projects.workspaceId` has a FK to `workspaces`,
    // and this unit test exercises pipeline logic (not ACL). Leave null so
    // the FK isn't checked.
    workspaceId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  projectRepo.create(project);
  return project;
}

// `confidenceScore` is on the 0–1 scale in production: the deduplicator
// normalises `scoreTestWithFactors().score` (0–100) via `quality / 100` at
// `backend/src/pipeline/deduplicator.js:334`, and the route validates
// `autoApproveThreshold` to `(0, 1]` at `backend/src/routes/projects.js:162`.
// Use the production scale here so the test would catch a regression that
// removes the `/ 100` normalisation — a 0–100 score against a 0–1 threshold
// would auto-approve every test, and these assertions exist to lock that
// invariant. `_quality` is kept on its native 0–100 scale (matches what
// `scoreTest()` actually produces) so the fallback path in
// `testPersistence.js:78` is also exercised correctly.
function makeTest(confidenceScore) {
  return { name: "Generated", steps: ["step"], confidenceScore, _quality: confidenceScore * 100 };
}

async function main() {
  resetDb();

  {
    const run = makeRun();
    const project = makeProject({ autoApproveThreshold: null });
    const ids = persistGeneratedTests([makeTest(0.95)], project, run);
    const saved = testRepo.getById(ids[0]);
    assert.equal(saved.reviewStatus, "draft");
    assert.equal(saved.approvalSource, null);
  }

  {
    const run = makeRun();
    const project = makeProject({ autoApproveThreshold: 0.8 });
    const ids = persistGeneratedTests([makeTest(0.4)], project, run);
    const saved = testRepo.getById(ids[0]);
    assert.equal(saved.reviewStatus, "draft");
  }

  {
    const run = makeRun();
    const project = makeProject({ autoApproveThreshold: 0.8 });
    const ids = persistGeneratedTests([makeTest(0.9)], project, run);
    const saved = testRepo.getById(ids[0]);
    assert.equal(saved.reviewStatus, "approved");
    assert.equal(saved.approvalSource, "auto");
    assert.equal(saved.approvalThreshold, 0.8);
    assert.equal(saved.approvedBy, "auto-approver");
    const activities = activityRepo.getFiltered({ type: "test.auto_approve", projectId: project.id });
    assert.ok(activities.some((a) => a.testId === ids[0] && a.userName === "auto-approver"));
  }

  // Revoke (AUTO-003b): an auto-approved test returns to draft with all
  // four provenance columns cleared. We mirror the route handler in
  // backend/src/routes/tests.js (POST /tests/:testId/revoke) directly via
  // the repo so this stays a unit test — HTTP-level coverage can come from
  // a sibling integration test once the supertest harness is wired in.
  {
    const run = makeRun();
    const project = makeProject({ autoApproveThreshold: 0.8 });
    const ids = persistGeneratedTests([makeTest(0.95)], project, run);
    const before = testRepo.getById(ids[0]);
    assert.equal(before.reviewStatus, "approved");
    assert.equal(before.approvalSource, "auto");

    testRepo.update(ids[0], {
      reviewStatus: "draft",
      reviewedAt: null,
      approvalSource: null,
      approvalThreshold: null,
      approvedAt: null,
      approvedBy: null,
    });
    activityRepo.create({
      type: "test.revoke",
      projectId: project.id,
      projectName: "Proj",
      testId: ids[0],
      testName: before.name,
      userName: "tester",
      detail: `Approval revoked — "${before.name}" (was auto-approved)`,
      createdAt: new Date().toISOString(),
    });

    const after = testRepo.getById(ids[0]);
    assert.equal(after.reviewStatus, "draft");
    assert.equal(after.approvalSource, null);
    assert.equal(after.approvalThreshold, null);
    assert.equal(after.approvedAt, null);
    assert.equal(after.approvedBy, null);
    assert.equal(after.reviewedAt, null);
    const revokeActivities = activityRepo.getFiltered({ type: "test.revoke", projectId: project.id });
    assert.ok(revokeActivities.some((a) => a.testId === ids[0]));
  }

  // Revoking a human-approved test also clears provenance and returns to draft.
  {
    const run = makeRun();
    const project = makeProject({ autoApproveThreshold: null });
    const ids = persistGeneratedTests([makeTest(0.5)], project, run);
    // Simulate a human approval (mirrors PATCH /projects/:id/tests/:testId/approve).
    testRepo.update(ids[0], { reviewStatus: "approved", reviewedAt: new Date().toISOString() });
    testRepo.update(ids[0], {
      reviewStatus: "draft",
      reviewedAt: null,
      approvalSource: null,
      approvalThreshold: null,
      approvedAt: null,
      approvedBy: null,
    });
    const after = testRepo.getById(ids[0]);
    assert.equal(after.reviewStatus, "draft");
    assert.equal(after.approvalSource, null);
  }

  console.log("✅ auto-approval passed");
}

main().catch((err) => {
  console.error("❌ auto-approval failed:", err);
  process.exit(1);
});
