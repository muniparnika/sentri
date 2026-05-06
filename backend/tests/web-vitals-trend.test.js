/**
 * @module tests/web-vitals-trend
 * @description Integration test for the AUTO-017.3 metric-write block in
 * `backend/src/testRunner.js` — proves that after a run finishes,
 * `recordMetric()` writes per-run Web Vitals **averages** under
 * `webVitals.<key>` and the matching project budget thresholds under
 * `webVitals.<key>.budget`. Locks down the regression where the recorded
 * sample value is accidentally the budget instead of the average.
 *
 * Conventions follow `backend/tests/metric-samples.test.js` per REVIEW.md
 * § Backend Test Conventions: synchronous custom `test()` harness, manual
 * passed/failed counters, final summary line, `process.exit(1)` on any
 * failure. No `node:test` framework.
 */

import assert from "node:assert/strict";
import { getDatabase } from "../src/database/sqlite.js";
import { runTests } from "../src/testRunner.js";
import * as metricSamplesRepo from "../src/database/repositories/metricSamplesRepo.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.stack || err.message}`);
    failed++;
  }
}

console.log("\n── AUTO-017.3 Web Vitals trend metric write ──");

await test("runTests records per-run Web Vitals averages and budget thresholds", async () => {
  const db = getDatabase();
  const projectId = `PRJ-WVT-${Date.now()}`;
  db.prepare(`INSERT INTO projects (id, name, url, createdAt) VALUES (?, ?, ?, ?)`)
    .run(projectId, "Vitals Project", "https://example.com", new Date().toISOString());

  const project = {
    id: projectId,
    name: "Vitals Project",
    url: "https://example.com",
    webVitalsBudgets: { lcp: 2500, cls: 0.1, inp: 200, ttfb: 800 },
  };

  // Chosen so the average (2200) is distinct from the budget (2500) — this
  // catches a regression where the recorded sample is the budget threshold
  // instead of the per-run average.
  //
  // NB: `logs: []` is required even though we pre-populate `results[]` —
  // `runLogger.log()` (called from inside `runTests` during finalisation
  // at `backend/src/utils/runLogger.js:82`) does `run.logs.push(entry)`.
  // Every production call site initialises this array on the run record
  // (`backend/src/routes/runs.js`, `backend/src/scheduler.js`,
  // `backend/src/routes/trigger.js`); a missing `logs` causes a TypeError
  // before the AUTO-017.3 metric-write block runs.
  const run = {
    id: `RUN-WVT-${Date.now()}`,
    status: "running",
    passed: 0,
    failed: 0,
    total: 0,
    logs: [],
    results: [
      { testId: "T1", testName: "a", webVitals: { lcp: 2000, cls: 0.08, inp: 140, ttfb: 420 } },
      { testId: "T2", testName: "b", webVitals: { lcp: 2400, cls: 0.12, inp: 180, ttfb: 500 } },
    ],
  };

  await runTests(project, [], run, {});

  const lcpSeries    = metricSamplesRepo.getSeries(projectId, "webVitals.lcp",        { limit: 5 });
  const clsSeries    = metricSamplesRepo.getSeries(projectId, "webVitals.cls",        { limit: 5 });
  const budgetSeries = metricSamplesRepo.getSeries(projectId, "webVitals.lcp.budget", { limit: 5 });

  assert.ok(lcpSeries.length    >= 1, "expected at least one webVitals.lcp sample");
  assert.ok(clsSeries.length    >= 1, "expected at least one webVitals.cls sample");
  assert.ok(budgetSeries.length >= 1, "expected at least one webVitals.lcp.budget sample");

  // Sample value must be the per-run average (2200), not the budget (2500).
  assert.equal(lcpSeries.at(-1).value, 2200, "lcp sample must be the per-run average, not the budget");
  // Budget series must carry the threshold, not the average.
  assert.equal(budgetSeries.at(-1).value, 2500, ".budget series must carry the threshold, not the average");
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
