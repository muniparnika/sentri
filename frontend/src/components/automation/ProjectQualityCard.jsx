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

import { useState, useEffect } from "react";
import { ChevronDown, Globe, ShieldCheck, Gauge } from "lucide-react";
import QualityGatesPanel from "../project/QualityGatesPanel.jsx";
import WebVitalsBudgetsPanel from "../project/WebVitalsBudgetsPanel.jsx";
import { api } from "../../api.js";

const INNER_TABS = [
  { id: "gates",     label: "Quality Gates",   icon: ShieldCheck },
  { id: "webvitals", label: "Web Vitals",       icon: Gauge       },
];

/**
 * Fetch whether this project has any gates or budgets configured,
 * for the header status chips.
 */
function useQualityStatus(projectId) {
  const [hasGates,    setHasGates]    = useState(null);
  const [hasBudgets,  setHasBudgets]  = useState(null);

  useEffect(() => {
    // Backend returns `{ qualityGates: {...} | null }` — unconfigured projects
    // get `null`, not an empty object, so guard before calling Object.values().
    api.getQualityGates(projectId)
      .then(data => {
        const g = data?.qualityGates ?? {};
        setHasGates(Object.values(g).some(v => v !== null && v !== undefined && v !== ""));
      })
      .catch(() => setHasGates(false));

    // Backend returns `{ webVitalsBudgets: {...} | null }` — same shape as above.
    api.getWebVitalsBudgets(projectId)
      .then(data => {
        const b = data?.webVitalsBudgets ?? {};
        setHasBudgets(Object.values(b).some(v => v !== null && v !== undefined && v !== ""));
      })
      .catch(() => setHasBudgets(false));
  }, [projectId]);

  return { hasGates, hasBudgets };
}

export default function ProjectQualityCard({
  project,
  defaultExpanded = false,
  canEdit = false,
  onToast,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [innerTab, setInnerTab] = useState("gates");

  const { hasGates, hasBudgets } = useQualityStatus(project.id);

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
              <WebVitalsBudgetsPanel
                projectId={project.id}
                canEdit={canEdit}
                onToast={onToast}
              />
            )}
          </div>

        </div>
      )}
    </div>
  );
}
