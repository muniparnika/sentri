import React from "react";

/**
 * Reusable time-series visualization (MET-001).
 *
 * Renders the last 30 samples as a bar chart, scaled to the max value across
 * the visible window. Optional `threshold` line overlays a dashed marker at
 * the threshold value's vertical position so users see budget violations in
 * context (per `NEXT.md` MET-001 spec — "threshold lines"). Optional `band`
 * (`{ lower, upper }`) shades the acceptable range so trends drifting toward
 * a budget edge are visible at a glance — the second half of the spec's
 * "band overlays + threshold lines" deliverable.
 *
 * @param {Object}   props
 * @param {string}   [props.title]      - Chart heading.
 * @param {Array}    [props.samples]    - `[{ ts, value }, ...]` time series.
 * @param {number}   [props.threshold]  - Single threshold line (e.g. budget cap).
 * @param {Object}   [props.band]       - `{ lower, upper }` acceptable range overlay.
 */
export default function TrendChart({ title = "Trend", samples = [], threshold = null, band = null }) {
  const visible = samples.slice(-30);
  // Include threshold + band edges in the max so they don't fall off-chart.
  const candidates = [
    1,
    ...visible.map((s) => Number(s.value || 0)),
    ...(threshold != null ? [Number(threshold)] : []),
    ...(band ? [Number(band.lower || 0), Number(band.upper || 0)] : []),
  ];
  const max = Math.max(...candidates);
  const pct = (v) => `${(Number(v || 0) / max) * 100}%`;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ position: "relative", height: 140 }}>
        {/* Acceptable-range band overlay (drawn behind the bars). */}
        {band && Number.isFinite(Number(band.lower)) && Number.isFinite(Number(band.upper)) && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: pct(band.lower),
              height: `calc(${pct(band.upper)} - ${pct(band.lower)})`,
              background: "var(--accent)",
              opacity: 0.08,
              borderRadius: 3,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          />
        )}
        {/* Threshold line (dashed). */}
        {threshold != null && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: pct(threshold),
              borderTop: "1px dashed var(--text2)",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          />
        )}
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: "100%" }}>
          {visible.map((s, i) => (
            <div
              key={i}
              title={`${new Date(s.ts).toLocaleString()}: ${s.value}`}
              style={{
                width: 8,
                height: pct(s.value),
                background: "var(--accent)",
                borderRadius: 3,
              }}
            />
          ))}
        </div>
      </div>
      {(threshold != null || band) && (
        <div style={{ marginTop: 8, color: "var(--text2)", fontSize: 12 }}>
          {threshold != null && <span>Threshold: {threshold}</span>}
          {threshold != null && band && <span> · </span>}
          {band && <span>Band: {band.lower}–{band.upper}</span>}
        </div>
      )}
      {visible.length === 0 && (
        <div style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>No data yet.</div>
      )}
    </div>
  );
}
