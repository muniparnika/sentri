import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import TrendChart from "../components/shared/TrendChart.jsx";

export default function HealingDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.getHealingSummary().then(setData).catch(()=>setData({ strategies:[], topSelectors:[], estimates:{testsThatWouldHaveFailed:0}, savingsTrend:[] })); }, []);
  return <div className="page" style={{ padding: 16 }}>
    <h2>Self-healing telemetry</h2>
    <p>Tests that would have failed: <b>{data?.estimates?.testsThatWouldHaveFailed ?? 0}</b></p>
    <TrendChart title="Savings over time" samples={data?.savingsTrend || []} />
    <h3>Strategy success rates</h3>
    <ul>{(data?.strategies||[]).map((s)=><li key={String(s.strategyIndex)}>Strategy {s.strategyIndex}: {(s.successRate*100).toFixed(1)}%</li>)}</ul>
    <h3>Top healed selectors</h3>
    <ul>{(data?.topSelectors||[]).map((s,i)=><li key={i}>{s.selector}</li>)}</ul>
  </div>;
}
