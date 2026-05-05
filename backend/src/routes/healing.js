import { Router } from "express";
import * as testRepo from "../database/repositories/testRepo.js";
import * as projectRepo from "../database/repositories/projectRepo.js";
import * as healingRepo from "../database/repositories/healingRepo.js";
import * as metricSamplesRepo from "../database/repositories/metricSamplesRepo.js";

const router = Router();

router.get("/healing/summary", (req, res) => {
  const projectIds = projectRepo.getAll(req.workspaceId).map((p) => p.id);
  const tests = testRepo.getAllByProjectIds(projectIds);
  const testIds = tests.map(t => t.id);
  const all = healingRepo.getAllAsDict();
  const rows = Object.values(all).filter((r) => testIds.some((id) => String(r.key).startsWith(`${id}::`) || String(r.key).startsWith(`${id}@v`)));
  const byStrategy = new Map();
  const topSelectors = [];
  let wouldFail = 0;
  for (const r of rows) {
    const key = r.strategyIndex >= 0 ? String(r.strategyIndex) : "failed";
    const prev = byStrategy.get(key) || { strategyIndex: r.strategyIndex, total: 0, successes: 0 };
    prev.total += 1;
    if (r.strategyIndex >= 0 && r.succeededAt) prev.successes += 1;
    byStrategy.set(key, prev);
    if (r.strategyIndex > 0) wouldFail += 1;
    const parts = String(r.key).split("::");
    topSelectors.push({ selector: parts.slice(2).join("::") || "unknown", healed: r.strategyIndex > 0 });
  }
  topSelectors.sort((a,b)=> Number(b.healed)-Number(a.healed));
  const savingsTrend = projectIds.length ? metricSamplesRepo.getSeries(projectIds[0], "healing.savings", { limit: 90 }) : [];
  res.json({
    strategies: [...byStrategy.values()].map(s => ({ ...s, successRate: s.total ? s.successes / s.total : 0 })),
    topSelectors: topSelectors.slice(0, 10),
    estimates: { testsThatWouldHaveFailed: wouldFail },
    savingsTrend,
  });
});

export default router;
