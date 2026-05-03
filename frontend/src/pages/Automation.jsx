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

import React, { useState, useRef, useCallback } from "react";
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
import ProjectQualityCard from "../components/automation/ProjectConfigPanel.jsx";
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

        {/* Top-level tab bar */}
        <div className="auto-page-tabs">
          {PAGE_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`auto-page-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
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
          <div className="auto-tab-body">
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
          <div className="auto-tab-body">
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
        <div className="auto-tab-body">
          <IntegrationCards onScrollToSnippets={() => setActiveTab("snippets")} />
        </div>
      )}

      {/* ── Tab: Snippets ── */}
      {activeTab === "snippets" && (
        <div className="auto-tab-body">
          <IntegrationSnippets
            projects={projects}
            defaultProjectId={focusProjectId || projects[0]?.id}
          />
        </div>
      )}
    </div>
  );
}