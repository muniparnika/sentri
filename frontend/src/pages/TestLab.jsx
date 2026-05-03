/**
 * @module pages/TestLab
 * @description Dedicated workspace for AI test generation — crawl-based and
 * requirement-based flows live here instead of inside project-detail modals.
 * Provides a three-pane layout: project selector | configuration | launch panel.
 *
 * State machine:
 *   idle      → configure options, hit Start
 *   running   → pipeline steps + live log + real-time stats via SSE
 *   done      → summary stats + link to run detail
 *
 * Tab routing: "crawl" | "requirement" | "queue"
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Link2, Zap, Play, StopCircle, CheckCircle2, Clock,
  ArrowRight, ChevronRight, RotateCcw, FlaskConical,
} from "lucide-react";
import { api } from "../api.js";
import { useRunSSE } from "../hooks/useRunSSE.js";
import useProjectData, { invalidateProjectDataCache } from "../hooks/useProjectData.js";
import usePageTitle from "../hooks/usePageTitle.js";
import { fmtRelativeDate } from "../utils/formatters.js";


// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { label: "Crawl & snapshot",     step: 1, key: "pagesFound",          unit: "pages" },
  { label: "Filter elements",      step: 2, key: "elementsKept",         unit: "kept"  },
  { label: "Classify intents",     step: 3, key: "journeysDetected",     unit: "flows" },
  { label: "Generate tests",       step: 4, key: "rawTestsGenerated",    unit: "raw"   },
  { label: "Deduplicate",          step: 5, key: "duplicatesRemoved",    unit: "removed" },
  { label: "Enhance assertions",   step: 6, key: "assertionsEnhanced",   unit: "enhanced" },
  { label: "Validate",             step: 7, key: "validationRejected",   unit: "rejected" },
  { label: "Done",                 step: 8, key: null,                   unit: null },
];

const COVERAGE_OPTIONS = [
  { id: "full",      label: "Full coverage" },
  { id: "positive",  label: "Positive only" },
  { id: "errors",    label: "Errors & edges" },
  { id: "exploratory", label: "Exploratory" },
];

const PERSPECTIVE_OPTIONS = [
  { id: "full_journey",  label: "Full user journey" },
  { id: "first_time",    label: "First-time user" },
  { id: "multi_role",    label: "Multi-role" },
  { id: "interrupted",   label: "Interrupted flows" },
];

const QUALITY_OPTIONS = [
  { id: "accessibility", label: "Accessibility" },
  { id: "performance",   label: "Performance" },
  { id: "api_responses", label: "API responses" },
  { id: "security",      label: "Security" },
];

const REQ_EXAMPLES = [
  "User login with valid credentials",
  "Add to cart and checkout",
  "Form validation blocks invalid input",
  "Password reset flow end-to-end",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive stage state for a pipeline step given the run's currentStep. */
function stageStatus(step, currentStep, status) {
  if (status === "completed" || status === "completed_empty") {
    return step === 8 ? "done" : "done";
  }
  if (currentStep == null) return "pending";
  if (step < currentStep) return "done";
  if (step === currentStep) return "active";
  return "pending";
}

/** Build a project avatar colour from its initial letter (deterministic). */
function avatarStyle(initial) {
  const hues = {
    A: 210, B: 280, C: 340, D: 170, E: 50, F: 120, G: 15,
    H: 255, I: 190, J: 320, K: 90, L: 200, M: 30, N: 160,
    O: 60, P: 295, Q: 135, R: 0, S: 240, T: 75, U: 215,
    V: 145, W: 350, X: 180, Y: 45, Z: 270,
  };
  const h = hues[(initial || "?").toUpperCase()] ?? 200;
  return {
    background: `hsl(${h},60%,90%)`,
    color: `hsl(${h},60%,30%)`,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Multi-select chip group.
 *
 * @param {{ options: Array<{id:string,label:string}>, selected: string[], onChange: Function }} props
 */
function ChipGroup({ options, selected, onChange }) {
  function toggle(id) {
    onChange(
      selected.includes(id)
        ? selected.filter(x => x !== id)
        : [...selected, id]
    );
  }
  return (
    <div className="tl-chip-row">
      {options.map(opt => (
        <button
          key={opt.id}
          className={`tl-chip${selected.includes(opt.id) ? " tl-chip--on" : ""}`}
          onClick={() => toggle(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Compact project avatar with deterministic colour from the project name initial.
 *
 * @param {{ project: Object }} props
 */
function ProjIcon({ project }) {
  const initial = (project?.name || "?")[0].toUpperCase();
  return (
    <div className="tl-proj-icon" style={avatarStyle(initial)}>
      {initial}
    </div>
  );
}

/**
 * Pipeline stage list shown while a crawl run is active.
 *
 * @param {{ run: Object }} props
 */
function PipelinePanel({ run }) {
  const cs = run?.currentStep ?? null;
  const ps = run?.pipelineStats || {};
  const status = run?.status ?? "running";

  return (
    <div className="tl-pipeline">
      {PIPELINE_STAGES.map(stage => {
        const state = stageStatus(stage.step, cs, status);
        const statVal = stage.key ? ps[stage.key] : null;
        return (
          <div key={stage.step} className={`tl-stage tl-stage--${state}`}>
            <div className={`tl-stage-dot tl-stage-dot--${state}`} />
            <span className="tl-stage-name">{stage.label}</span>
            {statVal != null && (
              <span className="tl-stage-stat">
                {statVal} {stage.unit}
              </span>
            )}
            {state === "active" && statVal == null && (
              <span className="tl-stage-stat" style={{ color: "var(--accent)" }}>running…</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Live log terminal — scrolls to bottom on each new entry.
 *
 * @param {{ lines: string[] }} props
 */
function LiveLog({ lines }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="tl-live-log">
      {lines.slice(-40).map((line, i) => {
        const cls = line.startsWith("✓") ? "tl-log-ok"
                  : line.startsWith("→") ? "tl-log-info"
                  : "tl-log-dim";
        return <div key={i} className={cls}>{line}</div>;
      })}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Single queue row for the Queue tab.
 *
 * @param {{ run: Object, project: Object, onStop: Function, onView: Function }} props
 */
function QueueRow({ run, project, onStop, onView }) {
  const navigate = useNavigate();
  const isActive = run.status === "running";
  const isDone   = run.status === "completed" || run.status === "completed_empty" || run.status === "failed";

  const pct = run.currentStep != null
    ? Math.round(((run.currentStep - 1) / 7) * 100)
    : 0;

  return (
    <div className={`tl-queue-row${isDone ? " tl-queue-row--done" : ""}`}>
      <ProjIcon project={project} />
      <div className="tl-queue-info">
        <div className="tl-queue-name">
          {project?.name ?? "Unknown"} · {run.type === "crawl" ? "Crawl & Generate" : "Requirement"}
        </div>
        <div className="tl-queue-sub">
          {isActive && run.currentStep != null
            ? `Step ${run.currentStep}/8 · ${PIPELINE_STAGES[run.currentStep - 1]?.label ?? ""} · started ${fmtRelativeDate(run.startedAt)}`
            : isDone
              ? `Completed · ${run.testsGenerated ?? 0} tests generated · ${fmtRelativeDate(run.startedAt)}`
              : `Queued · ${fmtRelativeDate(run.startedAt)}`
          }
        </div>
      </div>

      {isActive && (
        <div className="tl-queue-progress">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {isDone && (
        <span className="badge badge-green" style={{ flexShrink: 0 }}>done</span>
      )}

      {isActive ? (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onStop(run.id)}
          style={{ flexShrink: 0 }}
        >
          <StopCircle size={14} />
          Stop
        </button>
      ) : (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(`/runs/${run.id}`)}
          style={{ flexShrink: 0 }}
        >
          View <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TestLab() {
  usePageTitle("Test Lab");
  const navigate = useNavigate();
  const { id: routeProjectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Data ──
  // Shared TanStack Query hook — participates in the app-wide project/run cache
  // (30 s staleTime) so mutations elsewhere (e.g. Tests page approve/reject,
  // Projects create/delete) refresh Test Lab automatically via
  // `invalidateProjectDataCache()`.
  const { projects, allRuns, loading: loadingProjectData } = useProjectData({ fetchTests: false });
  const loadingProjects = loadingProjectData;
  const [selectedId, setSelectedId]       = useState(routeProjectId ?? null);

  // ── Config state ──
  const [tab, setTab]                     = useState(searchParams.get("tab") || "crawl");
  const [discoveryMode, setDiscoveryMode] = useState("link");
  const [coverage, setCoverage]           = useState(["full"]);
  const [perspectives, setPerspectives]   = useState(["full_journey", "first_time"]);
  const [quality, setQuality]             = useState(["accessibility", "api_responses"]);
  const [testCount, setTestCount]         = useState("ai");
  const [profile, setProfile]             = useState("balanced");
  const [requirement, setRequirement]     = useState("");

  // ── Run state ──
  const [activeRun, setActiveRun]   = useState(null); // { runId, projectId, type }
  const [runData, setRunData]       = useState(null);  // live run object from SSE
  const [logLines, setLogLines]     = useState([]);
  const [launching, setLaunching]   = useState(false);
  const [innerTab, setInnerTab]     = useState("pipeline");
  const [stopLoading, setStopLoading] = useState(false);
  const [error, setError]           = useState(null);

  // ── Queue state ──
  const [queueFilter, setQueueFilter]   = useState("all");

  // ── Seed selected project from route / project list ──
  // `useProjectData` owns the actual fetch; this effect just syncs the
  // currently-selected project id to whatever the route / loaded project list
  // implies, without re-triggering any network calls.
  useEffect(() => {
    if (!projects.length) return;
    const routeMatch = routeProjectId && projects.some(p => p.id === routeProjectId)
      ? routeProjectId
      : null;
    setSelectedId(prev => routeMatch ?? prev ?? projects[0].id);
  }, [routeProjectId, projects]);

  // ── Derive runs grouped by project (replaces the old `projectRuns` state) ──
  const projectRuns = useMemo(() => {
    const byProj = {};
    for (const r of allRuns) {
      if (!byProj[r.projectId]) byProj[r.projectId] = [];
      byProj[r.projectId].push(r);
    }
    return byProj;
  }, [allRuns]);

  // ── Sync tab to URL param ──
  useEffect(() => {
    setSearchParams(tab === "crawl" ? {} : { tab }, { replace: true });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SSE handler for active run ──
  const handleSSEEvent = useCallback((event) => {
    if (event.type === "run_update" || event.type === "update") {
      setRunData(prev => ({ ...prev, ...event.run }));
    }
    if (event.type === "log" && event.message) {
      setLogLines(prev => [...prev, event.message]);
    }
    if (event.type === "done" || event.run?.status === "completed" || event.run?.status === "failed") {
      setRunData(prev => ({ ...prev, ...(event.run || {}), status: event.run?.status ?? "completed" }));
    }
  }, []);

  useRunSSE(
    activeRun?.runId ?? null,
    handleSSEEvent,
    activeRun ? "running" : null,
  );

  // ── Derived ──
  const selectedProject = projects.find(p => p.id === selectedId) ?? null;
  const lastCrawlRun = useMemo(() => {
    const runs = projectRuns[selectedId] || [];
    return runs.find(r => r.type === "crawl") ?? null;
  }, [projectRuns, selectedId]);

  // `allRuns` from useProjectData is already sorted newest-first.
  const activeQueueRuns = useMemo(
    () => allRuns.filter(r => r.status === "running"),
    [allRuns],
  );
  const recentQueueRuns = useMemo(
    () => allRuns.filter(r => r.status !== "running").slice(0, 8),
    [allRuns],
  );

  // ── Actions ──
  /**
   * Build the backend-compatible `dialsConfig` payload from the Test Lab UI
   * state. The backend (`POST /projects/:id/crawl` and `/tests/generate`) only
   * reads `dialsConfig` from the request body — flat top-level fields like
   * `mode`, `coverage`, `profile`, etc. are ignored silently, so we roll them
   * all up here to preserve parity with the old `CrawlProjectModal` /
   * `GenerateTestModal` contract.
   */
  function buildDialsConfig() {
    // Backend's `resolveDialsConfig` accepts: "one" | "small" | "medium" |
    // "large" | "ai_decides". The UI select stores numeric-ish strings; map
    // them to the nearest bucket so the prompt selects the right size.
    const countMap = {
      ai: "ai_decides",
      "5":  "small",
      "10": "small",
      "20": "medium",
      "50": "large",
    };
    return {
      // "link" in the UI ↔ "crawl" in the backend validator
      exploreMode: discoveryMode === "state" ? "state" : "crawl",
      testCount: countMap[testCount] ?? "ai_decides",
      coverage,
      perspectives,
      quality,
      profile,
    };
  }

  async function handleStartCrawl() {
    if (!selectedId) return;
    setError(null);
    setLaunching(true);
    setLogLines([]);
    setRunData(null);
    try {
      const { runId } = await api.crawl(selectedId, { dialsConfig: buildDialsConfig() });
      setActiveRun({ runId, projectId: selectedId, type: "crawl" });
      setInnerTab("pipeline");
    } catch (err) {
      setError(err.message || "Failed to start crawl.");
    } finally {
      setLaunching(false);
    }
  }

  async function handleGenerateFromRequirement() {
    if (!selectedId || !requirement.trim()) return;
    setError(null);
    setLaunching(true);
    setLogLines([]);
    setRunData(null);
    try {
      // Backend requires `name` — derive it from the first line of the
      // requirement (trimmed to a reasonable length). The full requirement
      // becomes the `description`, which is what the prompt pipeline consumes.
      const reqText = requirement.trim();
      const firstLine = reqText.split("\n")[0].trim();
      const derivedName = firstLine.length > 80
        ? firstLine.slice(0, 77) + "…"
        : firstLine;
      const { runId } = await api.generateTest(selectedId, {
        name: derivedName,
        description: reqText,
        dialsConfig: {
          coverage,
          quality,
          profile,
        },
      });
      setActiveRun({ runId, projectId: selectedId, type: "requirement" });
      setInnerTab("pipeline");
    } catch (err) {
      setError(err.message || "Failed to generate tests.");
    } finally {
      setLaunching(false);
    }
  }

  async function handleStop() {
    if (!activeRun?.runId) return;
    setStopLoading(true);
    try {
      await api.abortRun(activeRun.runId);
      setRunData(prev => ({ ...prev, status: "failed" }));
    } catch { /* non-fatal */ } finally {
      setStopLoading(false);
    }
  }

  async function handleQueueStop(runId) {
    try {
      await api.abortRun(runId);
      // Bust the shared project/run cache so the Queue reflects the abort on
      // the next refetch — no ad-hoc local state to keep in sync.
      invalidateProjectDataCache();
    } catch { /* non-fatal */ }
  }

  function handleReset() {
    setActiveRun(null);
    setRunData(null);
    setLogLines([]);
    setError(null);
  }

  // ── Compute launch panel data ──
  const pagesFound    = lastCrawlRun?.pagesFound ?? selectedProject?.pagesFound ?? null;
  const existingTests = (projectRuns[selectedId] || []).length > 0
    ? (projectRuns[selectedId] || []).filter(r => r.type === "crawl" && r.testsGenerated)
        .reduce((s, r) => s + (r.testsGenerated || 0), 0)
    : null;

  const isRunActive = !!activeRun && (runData?.status === "running" || runData?.status == null);
  const isRunDone   = runData?.status === "completed" || runData?.status === "completed_empty";
  const ps          = runData?.pipelineStats || {};

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="tl-wrap">

      {/* ── Tab bar ── */}
      <div className="tl-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 24, paddingRight: 24, borderRight: "1px solid var(--border)" }}>
          <FlaskConical size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>Test Lab</span>
          <span style={{ fontSize: "0.78rem", color: "var(--text3)", fontWeight: 400 }}>AI test generation workspace</span>
        </div>

        <button
          className={`tl-tab-btn${tab === "crawl" ? " tl-tab-btn--active" : ""}`}
          onClick={() => setTab("crawl")}
        >
          <Link2 size={14} />
          Crawl &amp; Generate
        </button>
        <button
          className={`tl-tab-btn${tab === "requirement" ? " tl-tab-btn--active" : ""}`}
          onClick={() => setTab("requirement")}
        >
          <Zap size={14} />
          Generate from Requirement
        </button>
        <button
          className={`tl-tab-btn${tab === "queue" ? " tl-tab-btn--active" : ""}`}
          onClick={() => setTab("queue")}
        >
          Queue
          {activeQueueRuns.length > 0 && (
            <span className="tl-tab-badge">{activeQueueRuns.length}</span>
          )}
        </button>
      </div>

      {/* ── Queue tab ── */}
      {tab === "queue" && (
        <div className="tl-queue-wrap fade-in">
          <div className="tl-queue-header">
            <div>
              <h2 className="page-title" style={{ marginBottom: 2 }}>Queue</h2>
              <p className="page-subtitle">All active and recent generation runs across projects</p>
            </div>
            <div className="flex-between gap-sm">
              <span className="badge badge-blue">{activeQueueRuns.length} active</span>
              {activeQueueRuns.length > 0 && (
                <span className="badge badge-green" style={{ animation: "pulse 1.5s infinite" }}>running</span>
              )}
            </div>
          </div>

          {activeQueueRuns.length === 0 && recentQueueRuns.length === 0 && (
            <div className="empty-state card">
              <div className="empty-state-icon">⏳</div>
              <div className="empty-state-title">No runs yet</div>
              <div className="empty-state-desc">
                Start a crawl or generate tests from a requirement to see them here.
              </div>
            </div>
          )}

          {activeQueueRuns.length > 0 && (
            <>
              <div className="section-label mb-sm">Active</div>
              {activeQueueRuns.map(run => (
                <QueueRow
                  key={run.id}
                  run={run}
                  project={projects.find(p => p.id === run.projectId)}
                  onStop={handleQueueStop}
                />
              ))}
            </>
          )}

          {recentQueueRuns.length > 0 && (
            <>
              <div className="section-label mb-sm" style={{ marginTop: 20 }}>Recent</div>
              {recentQueueRuns.map(run => (
                <QueueRow
                  key={run.id}
                  run={run}
                  project={projects.find(p => p.id === run.projectId)}
                  onStop={handleQueueStop}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Crawl & Generate / Requirement tabs — 3-pane grid ── */}
      {(tab === "crawl" || tab === "requirement") && (
        <div className="tl-grid fade-in">

          {/* ── Left: Project sidebar ── */}
          <div className="tl-projects">
            <div className="tl-col-header">Projects</div>
            <div className="tl-proj-list">
              {loadingProjects
                ? [1, 2].map(i => (
                    <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 4 }} />
                  ))
                : projects.map(p => (
                    <div
                      key={p.id}
                      className={`tl-proj-item${p.id === selectedId ? " tl-proj-item--active" : ""}`}
                      onClick={() => {
                        setSelectedId(p.id);
                        handleReset();
                        // Keep the URL in sync when we're on the nested route so
                        // the current project is deep-linkable. Leave the top-level
                        // /test-lab URL alone.
                        if (routeProjectId) {
                          const qs = searchParams.toString();
                          navigate(`/projects/${p.id}/test-lab${qs ? `?${qs}` : ""}`, { replace: true });
                        }
                      }}
                    >
                      <ProjIcon project={p} />
                      <div className="tl-proj-info">
                        <div className="tl-proj-name">{p.name}</div>
                        <div className="tl-proj-url">{p.url?.replace(/^https?:\/\//, "")}</div>
                      </div>
                    </div>
                  ))
              }
            </div>

            {/* Last crawl meta */}
            {lastCrawlRun && (
              <div className="tl-proj-meta">
                <div className="tl-proj-meta-label">Last Crawl</div>
                <div className="tl-proj-meta-value">
                  {fmtRelativeDate(lastCrawlRun.startedAt)}
                </div>
                <div className="tl-proj-meta-value" style={{ marginTop: 2 }}>
                  {lastCrawlRun.pagesFound ?? "?"} pages · {lastCrawlRun.testsGenerated ?? "?"} tests
                </div>
              </div>
            )}
          </div>

          {/* ── Middle: Configuration / Running view ── */}
          {isRunActive ? (
            // ── Running: pipeline + live log ──
            <div className="tl-run-center">
              <div className="tl-run-label">
                {selectedProject?.name?.toUpperCase()} · {activeRun?.type === "crawl" ? "LINK CRAWL" : "REQUIREMENT"}
              </div>

              <div className="tl-inner-tabs">
                {["pipeline", "logs"].map(t => (
                  <button
                    key={t}
                    className={`tl-inner-tab${innerTab === t ? " tl-inner-tab--active" : ""}`}
                    onClick={() => setInnerTab(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {innerTab === "pipeline" && (
                <PipelinePanel run={runData} />
              )}

              {innerTab === "logs" && (
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <LiveLog lines={logLines} />
                </div>
              )}

              {/* Always show log preview at bottom in pipeline view */}
              {innerTab === "pipeline" && logLines.length > 0 && (
                <LiveLog lines={logLines} />
              )}
            </div>
          ) : (
            // ── Idle / Done: configuration ──
            <div className="tl-config">
              <div className="tl-config-scroll">

                {/* Error banner */}
                {error && (
                  <div className="banner banner-error mb-md">
                    {error}
                  </div>
                )}

                {/* Done banner */}
                {isRunDone && (
                  <div className="banner banner-success mb-md">
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>Generation complete</strong> — {runData?.testsGenerated ?? 0} tests generated.
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ marginLeft: 10 }}
                        onClick={() => navigate(`/runs/${activeRun.runId}`)}
                      >
                        View run <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Crawl tab config ── */}
                {tab === "crawl" && (
                  <>
                    <div className="tl-section">
                      <div className="tl-section-label">Discovery Mode</div>
                      <div className="tl-mode-grid">
                        <div
                          className={`tl-mode-card${discoveryMode === "link" ? " tl-mode-card--selected" : ""}`}
                          onClick={() => setDiscoveryMode("link")}
                        >
                          <div className="tl-mode-icon">🔗</div>
                          <div className="tl-mode-title">Link crawl</div>
                          <div className="tl-mode-desc">Follow links from homepage, discover all pages</div>
                        </div>
                        <div
                          className={`tl-mode-card${discoveryMode === "state" ? " tl-mode-card--selected" : ""}`}
                          onClick={() => setDiscoveryMode("state")}
                        >
                          <div className="tl-mode-icon">⚡</div>
                          <div className="tl-mode-title">State exploration</div>
                          <div className="tl-mode-desc">Click UI elements, discover app states dynamically</div>
                        </div>
                      </div>
                    </div>

                    <div className="tl-section">
                      <div className="tl-section-label">Coverage Approach</div>
                      <ChipGroup options={COVERAGE_OPTIONS} selected={coverage} onChange={setCoverage} />
                    </div>

                    <div className="tl-section">
                      <div className="tl-section-label">Test Perspectives</div>
                      <ChipGroup options={PERSPECTIVE_OPTIONS} selected={perspectives} onChange={setPerspectives} />
                    </div>

                    <div className="tl-section">
                      <div className="tl-section-label">Quality Checks</div>
                      <ChipGroup options={QUALITY_OPTIONS} selected={quality} onChange={setQuality} />
                    </div>

                    <div className="tl-controls-row">
                      <div className="tl-select-wrap">
                        <label className="tl-section-label" htmlFor="tl-count">Test Count</label>
                        <select
                          id="tl-count"
                          className="tl-select"
                          value={testCount}
                          onChange={e => setTestCount(e.target.value)}
                        >
                          <option value="ai">AI decides</option>
                          <option value="5">5 tests</option>
                          <option value="10">10 tests</option>
                          <option value="20">20 tests</option>
                          <option value="50">50 tests</option>
                        </select>
                      </div>
                      <div className="tl-select-wrap">
                        <label className="tl-section-label" htmlFor="tl-profile">Profile</label>
                        <select
                          id="tl-profile"
                          className="tl-select"
                          value={profile}
                          onChange={e => setProfile(e.target.value)}
                        >
                          <option value="balanced">Balanced</option>
                          <option value="aggressive">Aggressive</option>
                          <option value="conservative">Conservative</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Requirement tab config ── */}
                {tab === "requirement" && (
                  <>
                    <div className="tl-section">
                      <div className="tl-section-label">Requirement / User Story</div>
                      <textarea
                        className="tl-req-area"
                        placeholder={"As a user I want to search for items so that I can find what I'm looking for…"}
                        value={requirement}
                        onChange={e => setRequirement(e.target.value)}
                        rows={5}
                      />
                      <div className="tl-req-hint">
                        Plain English, user stories, Gherkin, or paste a Jira ticket.
                      </div>
                    </div>

                    <div className="tl-section">
                      <div className="tl-section-label">Coverage Approach</div>
                      <ChipGroup options={COVERAGE_OPTIONS.slice(0, 3)} selected={coverage} onChange={setCoverage} />
                    </div>

                    <div className="tl-section">
                      <div className="tl-section-label">Quality Checks</div>
                      <ChipGroup options={QUALITY_OPTIONS.slice(0, 3)} selected={quality} onChange={setQuality} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Right: Launch panel / Run stats ── */}
          <div className="tl-panel">
            <div className="tl-panel-scroll">

              {isRunActive ? (
                // ── Running: live stats ──
                <>
                  <div className="tl-panel-section-label">So Far</div>
                  <div className="tl-run-stats">
                    <div className="tl-run-stat tl-run-stat--accent">
                      <div className="tl-run-stat-val">{ps.rawTestsGenerated ?? 0}</div>
                      <div className="tl-run-stat-lbl">Generated</div>
                    </div>
                    <div className="tl-run-stat tl-run-stat--amber">
                      <div className="tl-run-stat-val">{ps.duplicatesRemoved ?? 0}</div>
                      <div className="tl-run-stat-lbl">Dupes removed</div>
                    </div>
                    <div className="tl-run-stat tl-run-stat--green">
                      <div className="tl-run-stat-val">
                        {ps.averageQuality != null ? ps.averageQuality : "—"}
                      </div>
                      <div className="tl-run-stat-lbl">Avg quality</div>
                    </div>
                    <div className="tl-run-stat">
                      <div className="tl-run-stat-val" style={{ color: "var(--text)" }}>
                        {ps.pagesFound ?? runData?.pagesFound ?? 0}
                      </div>
                      <div className="tl-run-stat-lbl">Pages crawled</div>
                    </div>
                  </div>

                  <div className="progress-bar mb-md">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: runData?.currentStep != null
                          ? `${Math.round(((runData.currentStep - 1) / 7) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>

                  <button
                    className="btn btn-ghost"
                    style={{ width: "100%", justifyContent: "center", gap: 6 }}
                    onClick={handleStop}
                    disabled={stopLoading}
                  >
                    <StopCircle size={15} />
                    {stopLoading ? "Stopping…" : "Stop run"}
                  </button>
                </>
              ) : (
                // ── Idle / Done: launch panel ──
                <>
                  {tab === "crawl" && (
                    <>
                      <div className="tl-panel-section-label">Ready to Launch</div>
                      <div className="tl-launch-stats">
                        <div className="tl-stat-cell">
                          <div className="tl-stat-val">
                            {pagesFound != null ? pagesFound : <span style={{ color: "var(--text3)" }}>—</span>}
                          </div>
                          <div className="tl-stat-lbl">Pages found</div>
                        </div>
                        <div className="tl-stat-cell">
                          <div className="tl-stat-val">
                            {existingTests != null ? existingTests : <span style={{ color: "var(--text3)" }}>—</span>}
                          </div>
                          <div className="tl-stat-lbl">Existing tests</div>
                        </div>
                      </div>

                      {pagesFound != null && (
                        <div className="tl-estimate">
                          Estimated: <strong>8–15 new tests</strong> · ~4 min
                        </div>
                      )}
                    </>
                  )}

                  {tab === "requirement" && (
                    <>
                      <div className="tl-panel-section-label">Examples</div>
                      {REQ_EXAMPLES.map(ex => (
                        <button
                          key={ex}
                          className="tl-example"
                          onClick={() => setRequirement(ex)}
                        >
                          {ex}
                        </button>
                      ))}
                      <hr className="tl-panel-divider" />
                    </>
                  )}

                  {/* CTA */}
                  {!selectedProject && (
                    <div className="banner banner-warning mb-md">
                      Select a project to continue.
                    </div>
                  )}

                  {tab === "crawl" && (
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", justifyContent: "center", gap: 6, padding: "10px 16px" }}
                      disabled={!selectedProject || launching}
                      onClick={handleStartCrawl}
                    >
                      {launching ? (
                        <><span className="spin"><RotateCcw size={15} /></span> Starting…</>
                      ) : (
                        <><Play size={15} /> Start Crawl &amp; Generate</>
                      )}
                    </button>
                  )}

                  {tab === "requirement" && (
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", justifyContent: "center", gap: 6, padding: "10px 16px" }}
                      disabled={!selectedProject || !requirement.trim() || launching}
                      onClick={handleGenerateFromRequirement}
                    >
                      {launching ? (
                        <><span className="spin"><RotateCcw size={15} /></span> Generating…</>
                      ) : (
                        <><Zap size={15} /> Generate Tests</>
                      )}
                    </button>
                  )}

                  <hr className="tl-panel-divider" />
                  <div className="tl-panel-section-label">Active Runs</div>

                  {activeQueueRuns.length === 0 ? (
                    <div className="tl-active-run-empty">No active runs</div>
                  ) : (
                    activeQueueRuns.slice(0, 3).map(run => {
                      const proj = projects.find(p => p.id === run.projectId);
                      const pct  = run.currentStep != null
                        ? Math.round(((run.currentStep - 1) / 7) * 100)
                        : 0;
                      return (
                        <div key={run.id} className="tl-active-run-card mb-sm">
                          <div className="tl-arc-header">
                            <ProjIcon project={proj} />
                            <span className="tl-arc-name">{proj?.name ?? "—"}</span>
                            <span className="badge badge-blue" style={{ fontSize: "0.65rem", animation: "pulse 1.5s infinite" }}>live</span>
                          </div>
                          <div className="tl-arc-body">
                            <div className="tl-arc-step">
                              Step {run.currentStep ?? "?"}/8 · {PIPELINE_STAGES[(run.currentStep ?? 1) - 1]?.label}
                            </div>
                            <div className="progress-bar">
                              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
