/**
 * @module tests/approval-provenance
 * @description Tests for the AUTO-003b auto-approval frontend surface.
 *
 * Scope of this file:
 *   - `api.revokeApproval(testId)` POSTs to /api/v1/tests/:testId/revoke
 *   - `api.getApprovalStats(projectId)` GETs /api/v1/projects/:id/approval-stats
 *     and returns the server payload unchanged
 *
 * Deferred (intentionally not covered here):
 *   - DOM/RTL tests for the 🤖 sub-badge in `frontend/src/pages/Tests.jsx` and
 *     the "Revoke approval" button in `frontend/src/pages/TestDetail.jsx`.
 *     The frontend test runner is plain Node (`frontend/tests/run-tests.js`)
 *     with no Vitest/Jest, jsdom, or React Testing Library wired up — every
 *     existing `*.test.js` operates on pure utilities or stubbed `fetch`.
 *     Adding RTL is its own infra PR; this file exercises the API contract
 *     that those components depend on instead.
 *   - The ⚠ failed-first-run overlay on auto-approved tests is not yet
 *     implemented in this PR (no overlay markup in Tests.jsx / TestDetail.jsx,
 *     no `firstRunStatus`-style field on the test response). Tracking as
 *     follow-up work; do not add tests for it until the feature lands.
 *
 * Runs with plain Node.js (no framework) — matches project test convention.
 *
 * Usage: node frontend/tests/approval-provenance.test.js
 */

import assert from "node:assert/strict";

function makeStorage(seed = {}) {
  const state = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, String(value));
    },
    removeItem(key) {
      state.delete(key);
    },
  };
}

function makeJsonResponse(status, payload, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

async function run() {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;
  const originalDocument = global.document;

  const requests = [];

  global.localStorage = makeStorage({
    app_auth_user: JSON.stringify({ id: "U-1" }),
  });
  global.window = { location: { pathname: "/tests/TC-1", href: "/tests/TC-1" } };
  global.document = { cookie: "_csrf=test-csrf-token" };
  global.fetch = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith("/api/v1/tests/TC-1/revoke") && init.method === "POST") {
      // Server returns the updated test row with provenance columns cleared.
      return makeJsonResponse(200, {
        id: "TC-1",
        reviewStatus: "draft",
        reviewedAt: null,
        approvalSource: null,
        approvalThreshold: null,
        approvedAt: null,
        approvedBy: null,
      });
    }
    if (url.endsWith("/api/v1/projects/PRJ-1/approval-stats") && (init.method === "GET" || !init.method)) {
      return makeJsonResponse(200, {
        human: 3,
        auto: 5,
        draft: 2,
        rejected: 0,
        total: 10,
        revertRate7d: 0.2,
        autoApprovals7d: 5,
        reverts7d: 1,
      });
    }
    return makeJsonResponse(500, { error: `Unexpected path: ${url}` });
  };

  try {
    const { api } = await import("../src/api.js");

    // ── api.revokeApproval ───────────────────────────────────────────────
    const revoked = await api.revokeApproval("TC-1");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.method, "POST");
    assert.match(requests[0].url, /\/api\/v1\/tests\/TC-1\/revoke$/);
    // Cookie-based auth contract — same as api.integration.test.js.
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(revoked.reviewStatus, "draft");
    assert.equal(revoked.approvalSource, null);
    assert.equal(revoked.approvalThreshold, null);
    assert.equal(revoked.approvedAt, null);
    assert.equal(revoked.approvedBy, null);
    assert.equal(revoked.reviewedAt, null);

    // ── api.getApprovalStats ─────────────────────────────────────────────
    const stats = await api.getApprovalStats("PRJ-1");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].init.method, "GET");
    assert.match(requests[1].url, /\/api\/v1\/projects\/PRJ-1\/approval-stats$/);
    assert.equal(stats.human, 3);
    assert.equal(stats.auto, 5);
    assert.equal(stats.draft, 2);
    assert.equal(stats.total, 10);
    assert.equal(stats.revertRate7d, 0.2);
    assert.equal(stats.autoApprovals7d, 5);
    assert.equal(stats.reverts7d, 1);

    console.log("✅ approval-provenance: all checks passed");
  } finally {
    global.fetch = originalFetch;
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
    global.document = originalDocument;
  }
}

run().catch((err) => {
  console.error("❌ approval-provenance failed:", err);
  process.exit(1);
});
