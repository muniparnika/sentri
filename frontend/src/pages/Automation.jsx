/**
 * @module pages/Automation
 * @description Automation hub — CI/CD triggers, scheduled runs, quality gates,
 * integrations, and snippets across all projects.
 *
 * Layout: four top-level tabs separate concerns so users never scroll past
 * empty sections to reach what they need:
 *
 *   Triggers & Schedules — per-project CI/CD tokens + cron schedule
 *   Quality Gates         — pass-rate / failure / flaky gates + Web Vitals budgets
 *   Integrations          — integration card grid (GitHub Actions, GitLab, cURL…)
 *   Snippets              — copy-to-clipboard CI YAML/bash with project picker
 *
 * Each project renders inside its own accordion within the relevant tab.
 */

import React, { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Zap, FolderOpen, ShieldCheck, Plug, Code2,
} from "lucide-react";
import useProjectData from "../hooks/useProjectData.js";
import usePageTitle from "../hooks/usePageTitle.js";
import { useAuth } from "../context/AuthContext.jsx";
import { userHasRole } from "../utils/roles.js";
import { useNotifications } from "../context/NotificationContext.jsx";
import ProjectAutomationCard from "../components/automation/ProjectAutomationCard.jsx";
import ProjectQualityCard from "../components/automation/ProjectQualityCard.jsx";
import IntegrationCards from "../components/automation/IntegrationCards.jsx";
import IntegrationSnippets from "../components/automation/IntegrationSnippets.jsx";

const PAGE_TABS = [
  { id: "triggers",     label: "Triggers & Schedules", icon: Zap        },
  { id: "quality",      label: "Quality Gates",        icon: ShieldCheck },
  { id: "integrations", label: "Integrations",         icon: Plug        },
  { id: "snippets",     label: "Snippets",             icon: Code2       },
];

function EmptyProjects({ navigate }) {
  return (
    <div className="card" style={{ padding: 48, textAlign: "center" }}>
      <FolderOpen size={32} color="var(--text3)" style={{ marginBottom: 14 }} />
      <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 6 }}>No projects yet</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text3)", marginBottom: 20 }}>
        Create a project first, then configure CI/CD triggers and schedules here.
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => navigate("/projects/new")}>
        Create Project
      </button>
    </div>
  );
}

export default function Automation() {
  usePageTitle("Automation");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { projects, loading } = useProjectData({ fetchTests: false, fetchRuns: false });
  const { user: authUser } = useAuth();
  const canEdit = userHasRole(authUser, "qa_lead");
  const { addNotification } = useNotifications();

  const onPanelToast = useCallback((msg, type = "info") => {
    addNotification({
      type: type === "error" ? "error" : type === "success" ? "success" : "info",
      title: msg,
    });
  }, [addNotification]);

  const focusProjectId = searchParams.get("project");

  // Active top-level tab — default to triggers
  const [activeTab, setActiveTab] = useState("triggers");

  if (loading) return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      <div className="skeleton" style={{ height: 48, borderRadius: 10, marginBottom: 20 }} />
      {[80, 120, 120].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 12, marginBottom: 14 }} />
      ))}
    </div>
  );

  return (
    <div className="fade-in page-container" style={{ maxWidth: 900 }}>

      {/* ── Page header ── */}
      <div className="auto-page-header">
        <h1 className="auto-page-title">
          <Zap size={20} color="var(--accent)" />
          Automation
        </h1>
        <p className="auto-page-subtitle">
          CI/CD triggers, scheduled runs, and integrations for your projects
        </p>

        {/* Top-level tab bar — WAI-ARIA tabs pattern with arrow-key navigation */}
        <div className="auto-page-tabs" role="tablist" aria-label="Automation sections">
          {PAGE_TABS.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`auto-tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`auto-tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`auto-page-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
                  e.preventDefault();
                  let nextIdx = idx;
                  if (e.key === "ArrowRight") nextIdx = (idx + 1) % PAGE_TABS.length;
                  else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + PAGE_TABS.length) % PAGE_TABS.length;
                  else if (e.key === "Home") nextIdx = 0;
                  else if (e.key === "End") nextIdx = PAGE_TABS.length - 1;
                  setActiveTab(PAGE_TABS[nextIdx].id);
                  document.getElementById(`auto-tab-${PAGE_TABS[nextIdx].id}`)?.focus();
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab: Triggers & Schedules ── */}
      {activeTab === "triggers" && (
        projects.length === 0 ? <EmptyProjects navigate={navigate} /> : (
          <div className="auto-tab-body" role="tabpanel" id="auto-tabpanel-triggers" aria-labelledby="auto-tab-triggers">
            {projects.map((p, i) => (
              <ProjectAutomationCard
                key={p.id}
                project={p}
                defaultExpanded={focusProjectId ? p.id === focusProjectId : i === 0}
                canEdit={canEdit}
                onToast={onPanelToast}
              />
            ))}
          </div>
        )
      )}

      {/* ── Tab: Quality Gates ── */}
      {activeTab === "quality" && (
        projects.length === 0 ? <EmptyProjects navigate={navigate} /> : (
          <div className="auto-tab-body" role="tabpanel" id="auto-tabpanel-quality" aria-labelledby="auto-tab-quality">
            {projects.map((p, i) => (
              <ProjectQualityCard
                key={p.id}
                project={p}
                defaultExpanded={focusProjectId ? p.id === focusProjectId : i === 0}
                canEdit={canEdit}
                onToast={onPanelToast}
              />
            ))}
          </div>
        )
      )}

      {/* ── Tab: Integrations ── */}
      {activeTab === "integrations" && (
        <div className="auto-tab-body" role="tabpanel" id="auto-tabpanel-integrations" aria-labelledby="auto-tab-integrations">
          <IntegrationCards onScrollToSnippets={() => setActiveTab("snippets")} />
        </div>
      )}

      {/* ── Tab: Snippets ── */}
      {activeTab === "snippets" && (
        <div className="auto-tab-body" role="tabpanel" id="auto-tabpanel-snippets" aria-labelledby="auto-tab-snippets">
          <IntegrationSnippets
            projects={projects}
            defaultProjectId={focusProjectId || projects[0]?.id}
          />
        </div>
      )}
    </div>
  );
}