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

  const run = {
    id: `RUN-WVT-${Date.now()}`,
    status: "running",
    passed: 0,
    failed: 0,
    total: 0,
    results: [
      { testId: "T1", testName: "a", webVitals: { lcp: 2300, cls: 0.08, inp: 140, ttfb: 420 } },
      { testId: "T2", testName: "b", webVitals: { lcp: 2700, cls: 0.12, inp: 180, ttfb: 500 } },
    ],
  };

  await runTests(project, [], run, {});

  const lcpSeries = metricSamplesRepo.getSeries(projectId, "webVitals.lcp", { limit: 5 });
  const clsSeries = metricSamplesRepo.getSeries(projectId, "webVitals.cls", { limit: 5 });
  const budgetSeries = metricSamplesRepo.getSeries(projectId, "webVitals.lcp.budget", { limit: 5 });

  assert.ok(lcpSeries.length >= 1);
  assert.ok(clsSeries.length >= 1);
  assert.ok(budgetSeries.length >= 1);

  const lastLcp = lcpSeries.at(-1);
  assert.equal(lastLcp.value, 2500);
});
