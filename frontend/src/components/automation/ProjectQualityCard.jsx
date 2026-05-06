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

import { useState } from "react";
import { ChevronDown, Globe, ShieldCheck, Gauge } from "lucide-react";
import QualityGatesPanel from "../project/QualityGatesPanel.jsx";
import WebVitalsBudgetsPanel from "../project/WebVitalsBudgetsPanel.jsx";
import TrendChart from "../shared/TrendChart.jsx";
import { useAutomationStatusQuery } from "../../hooks/queries/useAutomationStatusQueries.js";
import { useProjectMetricQuery } from "../../hooks/queries/useProjectMetricQuery.js";

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
];

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
