import test from "node:test";
import assert from "node:assert/strict";
import { getDatabase } from "../src/database/sqlite.js";
import { runTests } from "../src/testRunner.js";
import * as metricSamplesRepo from "../src/database/repositories/metricSamplesRepo.js";

const db = getDatabase();

test("runTests records Web Vitals metric samples for trend charts", async () => {
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
  const run = {
    id: `RUN-WVT-${Date.now()}`,
    status: "running",
    passed: 0,
    failed: 0,
    total: 0,
    results: [
      { testId: "T1", testName: "a", webVitals: { lcp: 2000, cls: 0.08, inp: 140, ttfb: 420 } },
      { testId: "T2", testName: "b", webVitals: { lcp: 2400, cls: 0.12, inp: 180, ttfb: 500 } },
    ],
  };

  await runTests(project, [], run, {});

  const lcpSeries = metricSamplesRepo.getSeries(projectId, "webVitals.lcp", { limit: 5 });
  const clsSeries = metricSamplesRepo.getSeries(projectId, "webVitals.cls", { limit: 5 });
  const budgetSeries = metricSamplesRepo.getSeries(projectId, "webVitals.lcp.budget", { limit: 5 });

  assert.ok(lcpSeries.length >= 1);
  assert.ok(clsSeries.length >= 1);
  assert.ok(budgetSeries.length >= 1);

  // Sample value must be the per-run average (2200), not the budget (2500).
  const lastLcp = lcpSeries.at(-1);
  assert.equal(lastLcp.value, 2200);

  // Budget series must carry the threshold, not the average.
  const lastBudget = budgetSeries.at(-1);
  assert.equal(lastBudget.value, 2500);
});
