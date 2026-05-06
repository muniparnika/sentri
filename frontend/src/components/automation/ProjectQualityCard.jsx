/**
 * ProjectQualityCard — expandable accordion for a single project's
 * Quality Gates and Web Vitals Budgets configuration.
 *
 * Lives in the "Quality Gates" top-level tab on the Automation page.
 * Mirrors ProjectAutomationCard's structure but renders QualityGatesPanel
 * and WebVitalsBudgetsPanel side-by-side in an inner tab bar:
 *
 *   Gates | Web Vitals
 *
 * @param {{ project, defaultExpanded?, canEdit?, onToast? }} props
 */

import { useEffect, useState } from "react";
import { ChevronDown, Globe, ShieldCheck, Gauge, Bot } from "lucide-react";
import QualityGatesPanel from "../project/QualityGatesPanel.jsx";
import WebVitalsBudgetsPanel from "../project/WebVitalsBudgetsPanel.jsx";
import TrendChart from "../shared/TrendChart.jsx";
import { useAutomationStatusQuery } from "../../hooks/queries/useAutomationStatusQueries.js";
import { useProjectMetricQuery } from "../../hooks/queries/useProjectMetricQuery.js";
import { api } from "../../api.js";

// AUTO-017.3: the four Web Vital metrics we render trend charts for. Each
// entry's `key` is the `metric_samples.metricKey` written by `recordMetric()`
// in `backend/src/testRunner.js`; `budgetKey` is the matching field on
// `project.webVitalsBudgets` so threshold lines come from project config
// (NEXT.md AUTO-017.3 — "Threshold lines come from the project's
// `webVitalsBudgets` so users see violations in context").
const WEB_VITAL_METRICS = [
  { key: "webVitals.lcp",  budgetKey: "lcp",  title: "LCP (ms)"   },
  { key: "webVitals.cls",  budgetKey: "cls",  title: "CLS"        },
  { key: "webVitals.inp",  budgetKey: "inp",  title: "INP (ms)"   },
  { key: "webVitals.ttfb", budgetKey: "ttfb", title: "TTFB (ms)"  },
];

function WebVitalTrend({ projectId, metricKey, title, threshold }) {
  const { data: samples } = useProjectMetricQuery(projectId, metricKey);
  return (
    <TrendChart
      title={title}
      samples={samples}
      threshold={Number.isFinite(Number(threshold)) ? Number(threshold) : null}
    />
  );
}

const INNER_TABS = [
  { id: "gates",     label: "Quality Gates",   icon: ShieldCheck },
  { id: "webvitals", label: "Web Vitals",       icon: Gauge       },
  { id: "autoapprove", label: "Auto-Approval", icon: Bot         },
];

/**
 * AUTO-003b: configures `project.autoApproveThreshold` and renders the
 * approval-stats calibration line. Empty input → null (feature off).
 */
function AutoApprovalPanel({ project, canEdit, onToast }) {
  const [value, setValue] = useState(
    project.autoApproveThreshold == null ? "" : String(project.autoApproveThreshold),
  );
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  // AUTO-003b: first-time-enable preview. Holds the pending threshold +
  // the last-30-tests sample so the user sees what they're about to
  // greenlight before persisting. `null` means no preview pending.
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getApprovalStats(project.id)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { /* non-fatal — stats line just won't render */ });
    return () => { cancelled = true; };
  }, [project.id]);

  const persist = async (threshold) => {
    setSaving(true);
    try {
      await api.updateProject(project.id, { autoApproveThreshold: threshold });
      onToast?.({ type: "success", message: threshold === null ? "Auto-approval disabled." : `Auto-approval threshold set to ${threshold}.` });
      const fresh = await api.getApprovalStats(project.id);
      setStats(fresh);
    } catch (err) {
      onToast?.({ type: "error", message: err?.message || "Failed to save threshold." });
    } finally {
      setSaving(false);
    }
  };

  // AUTO-003b: first-time enablement guard. When the project goes from
  // "no threshold" → "some threshold", show a preview of which of the last
  // 30 generated tests would have been auto-approved at the proposed
  // threshold so the user can sanity-check before flipping the switch.
  // Re-enables (already had a threshold) and disables (→ null) skip the
  // preview — only the *first* enablement is the dangerous one.
  const save = async () => {
    const trimmed = value.trim();
    const threshold = trimmed === "" ? null : Number(trimmed);
    if (threshold !== null && (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1)) {
      onToast?.({ type: "error", message: "Threshold must be empty or a number greater than 0 and at most 1." });
      return;
    }
    const isFirstEnable = threshold !== null && project.autoApproveThreshold == null;
    if (!isFirstEnable) {
      await persist(threshold);
      return;
    }
    try {
      const tests = await api.getTests(project.id);
      // Most-recent first, last 30. `confidenceScore` is null for
      // pre-AUTO-003 rows — those are excluded from the "would be
      // auto-approved" tally rather than counted as failures.
      const recent = [...tests]
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 30);
      const wouldApprove = recent.filter((t) => Number.isFinite(t.confidenceScore) && t.confidenceScore >= threshold);
      setPreview({ threshold, sample: recent, wouldApprove });
    } catch {
      // If the preview fetch fails, fall through to direct persist rather
      // than block the user — the toast on persist() will surface any save error.
      await persist(threshold);
    }
  };

  const revertPct = stats && stats.autoApprovals7d > 0
    ? Math.round((stats.revertRate7d || 0) * 100)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text2)", marginBottom: 4 }}>
          Confidence threshold (0.05–1) — leave empty to disable
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            min="0.05"
            max="1"
            step="0.05"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canEdit || saving}
            placeholder="e.g. 0.8"
            style={{ width: 120 }}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!canEdit || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {stats && (
        <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
          {stats.auto} auto-approved · {stats.human} human-approved · {stats.draft} draft
          {revertPct !== null && (
            <> · <span title={`${stats.reverts7d} of ${stats.autoApprovals7d} auto-approvals were revoked in the last 7 days`}>
              {revertPct}% revert rate (7d)
            </span></>
          )}
        </div>
      )}
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm auto-approval threshold"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setPreview(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 8, padding: 20, maxWidth: 480, width: "90%",
              maxHeight: "80vh", overflow: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Enable auto-approval at {preview.threshold.toFixed(2)}?</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginTop: 0 }}>
              Of the last {preview.sample.length} generated test{preview.sample.length === 1 ? "" : "s"} on this project,{" "}
              <strong>{preview.wouldApprove.length}</strong> would have been auto-approved at this threshold.
              Sample these before enabling — once on, future tests bypass review automatically.
            </p>
            {preview.wouldApprove.length > 0 && (
              <ul style={{ fontSize: "0.75rem", maxHeight: 200, overflow: "auto", paddingLeft: 18, margin: "8px 0" }}>
                {preview.wouldApprove.slice(0, 10).map((t) => (
                  <li key={t.id}>
                    {t.name} <span style={{ color: "var(--text3)" }}>· {t.confidenceScore.toFixed(2)}</span>
                  </li>
                ))}
                {preview.wouldApprove.length > 10 && (
                  <li style={{ color: "var(--text3)" }}>…and {preview.wouldApprove.length - 10} more</li>
                )}
              </ul>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)} disabled={saving}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => { const t = preview.threshold; setPreview(null); await persist(t); }}
                disabled={saving}
              >
                {saving ? "Enabling…" : "Enable auto-approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectQualityCard({
  project,
  defaultExpanded = false,
  canEdit = false,
  onToast,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [innerTab, setInnerTab] = useState("gates");

  // Each chip is its own query so a gates save doesn't refetch budgets.
  const { data: hasGates }   = useAutomationStatusQuery(project.id, "gates");
  const { data: hasBudgets } = useAutomationStatusQuery(project.id, "budgets");

  return (
    <div className="card auto-card">

      {/* ── Accordion header ── */}
      <button
        className="auto-card__header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <div className="auto-card__icon">
          <Globe size={14} color="var(--purple)" />
        </div>

        <div className="auto-card__title-block">
          <div className="auto-card__name">{project.name}</div>
          <div className="auto-card__url">{project.url}</div>
        </div>

        {/* Status chips */}
        <div className="auto-card__chips">
          {hasGates !== null && (
            <span className={`auto-chip ${hasGates ? "auto-chip--green" : "auto-chip--gray"}`}>
              {hasGates ? "Gates configured" : "No gates"}
            </span>
          )}
          {hasBudgets !== null && (
            <span className={`auto-chip ${hasBudgets ? "auto-chip--blue" : "auto-chip--gray"}`}>
              {hasBudgets ? "Budgets set" : "No budgets"}
            </span>
          )}
        </div>

        <ChevronDown
          size={15}
          color="var(--text3)"
          className="auto-card__chevron"
          style={{ transform: expanded ? "rotate(180deg)" : "none" }}
        />
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="auto-card__expanded">

          {/* Inner tab bar */}
          <div className="auto-inner-tabs">
            {INNER_TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`auto-inner-tab ${innerTab === tab.id ? "active" : ""}`}
                  onClick={() => setInnerTab(tab.id)}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="auto-inner-content">
            {innerTab === "gates" && (
              <QualityGatesPanel
                projectId={project.id}
                canEdit={canEdit}
                onToast={onToast}
              />
            )}
            {innerTab === "autoapprove" && (
              <AutoApprovalPanel
                project={project}
                canEdit={canEdit}
                onToast={onToast}
              />
            )}
            {innerTab === "webvitals" && (
              <>
                <WebVitalsBudgetsPanel
                  projectId={project.id}
                  canEdit={canEdit}
                  onToast={onToast}
                />
                {/* AUTO-017.3: per-metric trend charts. Threshold lines are
                    sourced from the project's `webVitalsBudgets` so users see
                    violations in context (PR checklist NEXT.md:67). */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  {WEB_VITAL_METRICS.map((m) => (
                    <WebVitalTrend
                      key={m.key}
                      projectId={project.id}
                      metricKey={m.key}
                      title={m.title}
                      threshold={project.webVitalsBudgets?.[m.budgetKey]}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
