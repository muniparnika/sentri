import React from "react";

export default function TrendChart({ title = "Trend", samples = [], threshold = null }) {
  const max = Math.max(1, ...samples.map((s) => Number(s.value || 0)));
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 140 }}>
        {samples.slice(-30).map((s, i) => (
          <div key={i} title={`${new Date(s.ts).toLocaleString()}: ${s.value}`} style={{ width: 8, height: `${(Number(s.value || 0) / max) * 100}%`, background: "var(--accent)", borderRadius: 3 }} />
        ))}
      </div>
      {threshold != null && <div style={{ marginTop: 8, color: "var(--text2)", fontSize: 12 }}>Threshold: {threshold}</div>}
    </div>
  );
}
