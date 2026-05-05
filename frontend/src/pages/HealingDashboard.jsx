import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import TrendChart from "../components/shared/TrendChart.jsx";

const EMPTY_SUMMARY = {
  strategies: [],
  topSelectors: [],
  estimates: { testsThatWouldHaveFailed: 0 },
  savingsTrend: [],
};

/**
 * Self-healing telemetry dashboard (CAP-004).
 *
 * Renders workspace-wide healing summary: per-strategy success rates,
 * top healed selectors, "tests that would have failed" estimate, and
 * a savings trend chart backed by MET-001's `<TrendChart>`.
 */
export default function HealingDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getHealingSummary()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(EMPTY_SUMMARY); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page" style={{ padding: 16 }}>
      <h2>Self-healing telemetry</h2>
      <p>
        Tests that would have failed:{" "}
        <b>{data?.estimates?.testsThatWouldHaveFailed ?? 0}</b>
      </p>
      <TrendChart title="Savings over time" samples={data?.savingsTrend || []} />
      <h3>Strategy success rates</h3>
      <ul>
        {(data?.strategies || []).map((s) => (
          <li key={String(s.strategyIndex)}>
            Strategy {s.strategyIndex}: {(s.successRate * 100).toFixed(1)}%
          </li>
        ))}
      </ul>
      <h3>Top healed selectors</h3>
      <ul>
        {(data?.topSelectors || []).map((s) => (
          <li key={s.selector}>{s.selector}</li>
        ))}
      </ul>
    </div>
  );
}
