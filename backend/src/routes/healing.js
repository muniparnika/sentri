import { Router } from "express";
import * as testRepo from "../database/repositories/testRepo.js";
import * as projectRepo from "../database/repositories/projectRepo.js";
import * as healingRepo from "../database/repositories/healingRepo.js";
import * as metricSamplesRepo from "../database/repositories/metricSamplesRepo.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.get("/healing/summary", requireRole("viewer"), (req, res) => {
  const projectIds = projectRepo.getAll(req.workspaceId).map((p) => p.id);
  const tests = testRepo.getAllByProjectIds(projectIds);
  const testIds = tests.map((t) => t.id);
  const all = healingRepo.getAllAsDict();
  const rows = Object.values(all).filter((r) =>
    testIds.some((id) => String(r.key).startsWith(`${id}::`) || String(r.key).startsWith(`${id}@v`))
  );

  const byStrategy = new Map();
  const selectorAgg = new Map(); // selector → { selector, healCount, totalCount }
  let wouldFail = 0;

  for (const r of rows) {
    const key = r.strategyIndex >= 0 ? String(r.strategyIndex) : "failed";
    const prev = byStrategy.get(key) || { strategyIndex: r.strategyIndex, total: 0, successes: 0 };
    prev.total += 1;
    if (r.strategyIndex >= 0 && r.succeededAt) prev.successes += 1;
    byStrategy.set(key, prev);
    if (r.strategyIndex > 0) wouldFail += 1;

    const parts = String(r.key).split("::");
    const selector = parts.slice(2).join("::") || "unknown";
    const agg = selectorAgg.get(selector) || { selector, healCount: 0, totalCount: 0 };
    agg.totalCount += 1;
    if (r.strategyIndex > 0 && r.succeededAt) agg.healCount += 1;
    selectorAgg.set(selector, agg);
  }

  // Sort by actual heal count, not by boolean cast.
  const topSelectors = [...selectorAgg.values()]
    .filter((s) => s.healCount > 0)
    .sort((a, b) => b.healCount - a.healCount)
    .slice(0, 10);

  // Aggregate savings trend across ALL workspace projects, merging by timestamp.
  const merged = new Map();
  for (const pid of projectIds) {
    const series = metricSamplesRepo.getSeries(pid, "healing.savings", { limit: 90 });
    for (const s of series) {
      const cur = merged.get(s.ts) || { ts: s.ts, value: 0 };
      cur.value += Number(s.value || 0);
      merged.set(s.ts, cur);
    }
  }
  const savingsTrend = [...merged.values()].sort((a, b) => a.ts - b.ts);

  res.json({
    strategies: [...byStrategy.values()].map((s) => ({
      ...s,
      successRate: s.total ? s.successes / s.total : 0,
    })),
    topSelectors,
    estimates: { testsThatWouldHaveFailed: wouldFail },
    savingsTrend,
  });
});

export default router;
