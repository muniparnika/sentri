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
  ArrowRight, ChevronRight, RotateCcw, FlaskConical, Video,
} from "lucide-react";
import { api } from "../api.js";
import { useRunSSE } from "../hooks/useRunSSE.js";
import useProjectData, { invalidateProjectDataCache } from "../hooks/useProjectData.js";
import usePageTitle from "../hooks/usePageTitle.js";
import { fmtRelativeDate } from "../utils/formatters.js";
import SiteGraph from "../components/crawl/SiteGraph.jsx";
import RecorderModal from "../components/run/RecorderModal.jsx";
import TestConfig from "../components/test/TestConfig.jsx";
import { loadSavedConfig } from "../utils/testDialsStorage.js";


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

// Coverage / perspective / quality / test-count / profile option lists used to
// live here; they have moved to the shared <TestConfig /> component which
// composes them from `frontend/src/config/testDialsConfig.js` (the same
// canonical source the legacy CrawlProjectModal / GenerateTestModal used).

const REQ_EXAMPLES = [
  "User login with valid credentials",
  "Add to cart and checkout",
  "Form validation blocks invalid input",
  "Password reset flow end-to-end",
];

// ── Persistence ──────────────────────────────────────────────────────────────
//
// The pipeline + log views are driven by component-local state (`activeRun`,
// `runData`, `logLines`). Without persistence, navigating away from Test Lab
// unmounts the component and wipes the state, so returning mid-run shows an
// empty idle panel instead of the in-flight pipeline. We mirror the live run
// to sessionStorage so soft navigation within the app is seamless; on mount
// we rehydrate and the SSE hook auto-reconnects (its `snapshot` event refills
// pipeline counters, and new log lines resume streaming from the reconnect
// point). sessionStorage is scoped per-tab, which matches the UX we want.

const STORAGE_KEY = "sentri.testLab.activeRun";
const LOG_CAP     = 200; // bound storage size — the LiveLog UI slices at -40

function loadPersistedRun() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.activeRun?.runId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistRun(activeRun, runData, logLines) {
  try {
    if (!activeRun?.runId) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeRun,
      runData,
      logLines: logLines.slice(-LOG_CAP),
    }));
  } catch { /* quota / private mode — non-fatal */ }
}

function clearPersistedRun() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* non-fatal */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive stage state for a pipeline step given the run's currentStep. */
function stageStatus(step, currentStep, status) {
  if (status === "completed" || status === "completed_empty") {
    return step === 8 ? "done" : "done";
  }
  // For failed/aborted runs, freeze the pipeline at the step where it died
  // rather than leaving it pulsing as if still running. The step the run
  // stopped on is marked "done" (we reached it) but no step is "active".
  if (status === "failed" || status === "aborted") {
    if (currentStep == null) return "pending";
    if (step <= currentStep) return "done";
    return "pending";
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
// `ChipGroup` was inlined here for the Crawl/Requirement chip rows; chip
// rendering now lives in `frontend/src/components/test/TestConfig.jsx` and is
// shared with the rest of the app.

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
 * @param {{ run: Object, project: Object, onStop: Function, onAttach: Function }} props
 *   `onAttach` is called for active runs to reattach the live view; it falls
 *   back to navigating to `/runs/:id` for completed runs.
 */
function QueueRow({ run, project, onStop, onAttach }) {
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
        <>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onAttach?.(run)}
            title="Attach the live pipeline view to this run"
            style={{ flexShrink: 0 }}
          >
            View <ArrowRight size={13} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onStop(run.id)}
            style={{ flexShrink: 0 }}
          >
            <StopCircle size={14} />
            Stop
          </button>
        </>
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
  // We need `allTests` so the launch panel's "Existing tests" stat reflects the
  // real test inventory for the selected project, not a cumulative
  // testsGenerated sum across historical runs.
  const { projects, allRuns, allTests, loading: loadingProjectData } = useProjectData();
  const loadingProjects = loadingProjectData;
  const [selectedId, setSelectedId]       = useState(routeProjectId ?? null);

  // ── Config state ──
  // Single source of truth for the full Test Dials surface. Seeded from
  // localStorage via `loadSavedConfig()` so user preferences survive page
  // reloads — matches the legacy CrawlProjectModal / GenerateTestModal
  // behaviour and feeds the unified <TestConfig /> component below.
  const [tab, setTab]                     = useState(searchParams.get("tab") || "crawl");
  const [dialsConfig, setDialsConfig]     = useState(() => loadSavedConfig());
  const [requirement, setRequirement]     = useState("");

  // ── Run state ──
  // Rehydrate from sessionStorage so navigating away and back resumes the live
  // pipeline view without a gap. The SSE hook will auto-reconnect using the
  // persisted `runId` and its first `snapshot` event will refresh pipeline
  // counters from the server's authoritative copy.
  const persisted = useMemo(() => loadPersistedRun(), []);
  const [activeRun, setActiveRun]   = useState(persisted?.activeRun ?? null);
  const [runData, setRunData]       = useState(persisted?.runData ?? null);
  const [logLines, setLogLines]     = useState(persisted?.logLines ?? []);
  const [launching, setLaunching]   = useState(false);
  const [innerTab, setInnerTab]     = useState("pipeline");
  const [stopLoading, setStopLoading] = useState(false);
  const [error, setError]           = useState(null);

  // ── Queue state ──
  const [queueFilter, setQueueFilter]   = useState("all");

  // ── Recorder state ──
  // Recording stays as a modal (not a tab) because it's inherently
  // overlay-oriented — the live screencast preview needs a focused surface.
  // The Test Lab page just provides a launch point so users don't have to
  // bounce back to the Tests page to start a recording session.
  const [showRecorder, setShowRecorder] = useState(false);

  // ── Seed selected project from route / project list ──
  // `useProjectData` owns the actual fetch; this effect just syncs the
  // currently-selected project id to whatever the route / loaded project list
  // implies, without re-triggering any network calls.
  useEffect(() => {
    if (!projects.length) return;
    const routeMatch = routeProjectId && projects.some(p => p.id === routeProjectId)
      ? routeProjectId
      : null;
    // If a run was rehydrated from sessionStorage on the non-project-scoped
    // `/test-lab` route, prefer its project over `projects[0]` so the header
    // label and any subsequent launch target the correct project.
    const activeMatch = activeRun?.projectId && projects.some(p => p.id === activeRun.projectId)
      ? activeRun.projectId
      : null;
    setSelectedId(prev => routeMatch ?? prev ?? activeMatch ?? projects[0].id);
  }, [routeProjectId, projects, activeRun?.projectId]);

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
    if (event.type === "snapshot" && event.run) {
      setRunData(prev => ({ ...prev, ...event.run }));
    }
    if (event.type === "run_update" || event.type === "update") {
      setRunData(prev => ({ ...prev, ...event.run }));
    }
    if (event.type === "log" && event.message) {
      // Cap in-memory log buffer to bound memory + avoid O(n²) re-allocation
      // on long runs. `LiveLog` only renders the last 40 lines anyway, and
      // `persistRun` already caps its sessionStorage copy at LOG_CAP.
      setLogLines(prev => {
        const next = [...prev, event.message];
        return next.length > LOG_CAP ? next.slice(-LOG_CAP) : next;
      });
    }
    // The hook fires its own `type: "done"` event when SSE closes, with
    // `status` at the top level (not under `event.run`). Handle both shapes.
    const terminalStatus =
      event.type === "done" ? (event.status ?? event.run?.status ?? "completed")
      : (event.run?.status === "completed" || event.run?.status === "completed_empty"
         || event.run?.status === "failed"  || event.run?.status === "aborted")
        ? event.run.status
        : null;
    if (terminalStatus) {
      setRunData(prev => ({ ...prev, ...(event.run || {}), status: terminalStatus }));
      // Bust the shared cache so the Queue tab and Active-Runs panel pick up
      // the final test count / failure state without waiting for staleTime.
      invalidateProjectDataCache();
    }
  }, []);

  // Drive the SSE connection with the live run status so the hook auto-closes
  // when the run finishes (`done` event) and *stays* closed on subsequent
  // re-renders. Passing a static "running" string would cause the hook to keep
  // reconnecting after completion — see useRunSSE's `alreadyDone` guard.
  const sseInitialStatus = activeRun
    ? (runData?.status === "running" || runData?.status == null ? "running" : runData.status)
    : undefined;
  useRunSSE(activeRun?.runId ?? null, handleSSEEvent, sseInitialStatus);

  // ── Persist the active run to sessionStorage on every change ──
  // Clearing activeRun (via handleReset / Dismiss) also clears storage so the
  // next mount starts fresh. A terminal status is kept in storage briefly so a
  // navigation round-trip still lands on the done/failed banner rather than
  // the idle config panel.
  useEffect(() => {
    persistRun(activeRun, runData, logLines);
  }, [activeRun, runData, logLines]);

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
  // The unified <TestConfig /> component owns the full dialsConfig shape that
  // the backend's `resolveDialsConfig()` already validates (approach,
  // perspectives[], quality[], format, testCount, exploreMode + tuning,
  // options, language, customInstructions, parallelWorkers). We pass the
  // object straight through — no per-field re-packing — so adding a new dial
  // upstream automatically reaches the backend.

  async function handleStartCrawl() {
    if (!selectedId) return;
    setError(null);
    setLaunching(true);
    // Detach from any previous run BEFORE clearing runData. Otherwise the SSE
    // hook would re-evaluate `sseInitialStatus` as "running" (activeRun still
    // set + runData null) and reconnect to the old completed run during the
    // await window, poisoning runData with stale terminal state and blocking
    // SSE for the new run (`alreadyDone` guard in useRunSSE).
    setActiveRun(null);
    setLogLines([]);
    setRunData(null);
    clearPersistedRun();
    try {
      const { runId } = await api.crawl(selectedId, { dialsConfig });
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
    // See handleStartCrawl — detach from any previous run before clearing
    // runData to avoid an SSE reconnect race.
    setActiveRun(null);
    setLogLines([]);
    setRunData(null);
    clearPersistedRun();
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
        dialsConfig,
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
      // Mark the local copy as aborted so the SSE hook closes (it skips
      // connecting for any non-"running" initialStatus) and the config-panel
      // shows the aborted banner. The eventual SSE `done` event will reconcile
      // with the server's authoritative status.
      setRunData(prev => ({ ...prev, status: "aborted" }));
      invalidateProjectDataCache();
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
    // Explicit clear in addition to the write-through effect — avoids a stale
    // read if the user immediately navigates away before the effect flushes.
    clearPersistedRun();
  }

  /**
   * Attach the Test Lab live-view (pipeline + logs) to an existing run that
   * was either started elsewhere or dropped when the user navigated away.
   * Seeds `activeRun` / `runData` from the cached run row so the SSE hook
   * reconnects and the panel lights up immediately.
   *
   * @param {Object} run - Run row from `allRuns` (has `id`, `projectId`, `type`, `status`, …).
   */
  function handleAttachRun(run) {
    if (!run?.id) return;
    // Switch project scope if the run belongs to a different project.
    if (run.projectId && run.projectId !== selectedId) {
      setSelectedId(run.projectId);
      if (routeProjectId) {
        const qs = searchParams.toString();
        navigate(`/projects/${run.projectId}/test-lab${qs ? `?${qs}` : ""}`, { replace: true });
      }
    }
    setActiveRun({ runId: run.id, projectId: run.projectId, type: run.type });
    // Seed runData with whatever we already have cached — SSE's first
    // `snapshot` event will overwrite with the authoritative server copy.
    setRunData({ ...run, status: run.status });
    setLogLines([]);
    setInnerTab("pipeline");
    setError(null);
    // If we were on the Queue tab, switch to the matching config tab so the
    // user sees the pipeline view (which only renders under crawl/requirement).
    if (tab === "queue") {
      setTab(run.type === "crawl" ? "crawl" : "requirement");
    }
  }

  /**
   * Switch the selected project without orphaning an in-flight run.
   *
   * If a run is active in the panel, we ask the user to confirm — switching
   * detaches the SSE panel from that run but leaves it executing on the
   * server (it remains visible in the Queue tab and can be aborted from
   * there). Without this guard the previous behaviour silently abandoned the
   * run and gave the user no way to return to the live view.
   *
   * @param {string} nextProjectId
   */
  function handleSelectProject(nextProjectId) {
    if (nextProjectId === selectedId) return;
    if (isRunActive) {
      const ok = window.confirm(
        "A generation run is in progress for the current project. " +
        "Switching projects will close this live view — the run keeps executing " +
        "and stays visible in the Queue tab. Continue?",
      );
      if (!ok) return;
    }
    setSelectedId(nextProjectId);
    handleReset();
    if (routeProjectId) {
      const qs = searchParams.toString();
      navigate(`/projects/${nextProjectId}/test-lab${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }

  // ── Compute launch panel data ──
  const pagesFound    = lastCrawlRun?.pagesFound ?? selectedProject?.pagesFound ?? null;
  // Count the project's actual current tests (not cumulative testsGenerated
  // across all historical runs — that double-counts dedup'd / rejected /
  // deleted tests and grows monotonically).
  const existingTests = useMemo(() => {
    if (!selectedId) return null;
    return allTests.filter(t => t.projectId === selectedId).length;
  }, [allTests, selectedId]);

  const runStatus   = runData?.status;
  const isRunActive = !!activeRun && (runStatus === "running" || runStatus == null);
  const isRunDone   = runStatus === "completed" || runStatus === "completed_empty";
  const isRunFailed = runStatus === "failed" || runStatus === "aborted";
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

        {/* Record action — right-aligned, styled as a primary CTA so it
            reads as a peer to the tabs rather than disappearing as a ghost
            button. Recording remains a modal because the live screencast
            preview needs a focused overlay surface; the Test Lab page only
            provides the launch point. Disabled until a project is selected
            so we have a valid `projectId` to seed. */}
        <button
          className="btn btn-primary btn-sm"
          style={{
            marginLeft: "auto",
            marginRight: 16,
            gap: 6,
            fontWeight: 600,
            background: "var(--red)",
            borderColor: "var(--red)",
            color: "#fff",
          }}
          onClick={() => setShowRecorder(true)}
          disabled={!selectedProject}
          title={selectedProject
            ? `Record a test in ${selectedProject.name}`
            : "Select a project first"}
        >
          <Video size={14} />
          Record a test
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
                  onAttach={handleAttachRun}
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
                  onAttach={handleAttachRun}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Recorder modal — launched from the topbar Record button. On save we
          bust the project cache (so the new draft test shows up in the Tests
          page and the launch panel's "Existing tests" stat) and navigate the
          user to the test detail view, mirroring Tests.jsx's onSaved flow. */}
      {showRecorder && selectedProject && (
        <RecorderModal
          open={showRecorder}
          onClose={() => setShowRecorder(false)}
          projectId={selectedProject.id}
          projects={projects}
          defaultUrl={selectedProject.url || ""}
          onSaved={(t) => {
            // Use the saved test's projectId — the user may have switched
            // projects inside the modal before launching the recording.
            invalidateProjectDataCache(t?.projectId || selectedProject.id);
            setShowRecorder(false);
            navigate(`/tests/${t.id}`);
          }}
        />
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
                      onClick={() => handleSelectProject(p.id)}
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

          {/* ── Middle: Configuration / Running / Completed view ── */}
          {/* Show the run view (pipeline / sitegraph / logs) whenever a run is
              attached — running, completed, or failed. The user dismisses
              explicitly via the banner buttons below; without this, completed
              crawls would snap back to the config panel and the pipeline +
              site graph would vanish. */}
          {activeRun ? (
            // ── Attached run: pipeline + site graph + live log ──
            <div className="tl-run-center">
              <div className="tl-run-label">
                {selectedProject?.name?.toUpperCase()} · {activeRun?.type === "crawl" ? "LINK CRAWL" : "REQUIREMENT"}
                {isRunDone && <span style={{ marginLeft: 8, color: "var(--green)", fontWeight: 700 }}>· COMPLETED</span>}
                {isRunFailed && (
                  <span style={{ marginLeft: 8, color: "var(--red)", fontWeight: 700 }}>
                    · {runStatus === "aborted" ? "ABORTED" : "FAILED"}
                  </span>
                )}
              </div>

              {/* Terminal banners — rendered at the top of the run view so the
                  pipeline / logs stay visible underneath for review. */}
              {isRunDone && (
                <div className="banner banner-success" style={{ margin: "10px 14px 0" }}>
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
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ marginLeft: 6 }}
                      onClick={handleReset}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {isRunFailed && (
                <div className="banner banner-error" style={{ margin: "10px 14px 0" }}>
                  <div>
                    <strong>{runStatus === "aborted" ? "Run aborted" : "Run failed"}</strong>
                    {runData?.error ? ` — ${runData.error}` : "."}
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ marginLeft: 10 }}
                      onClick={() => navigate(`/runs/${activeRun.runId}`)}
                    >
                      View run <ChevronRight size={12} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ marginLeft: 6 }}
                      onClick={handleReset}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                // Site Graph is only meaningful for crawl runs — the
                // requirement flow doesn't produce a page graph. Same shape as
                // CrawlView's `graphPages` derivation (`run.pages` or
                // `run.snapshots`, normalised to an array).
                const isCrawl = activeRun?.type === "crawl";
                const rawPages = runData?.pages ?? runData?.snapshots ?? [];
                const graphPages = Array.isArray(rawPages)
                  ? rawPages
                  : (typeof rawPages === "object" ? Object.values(rawPages) : []);
                // Derive the page currently being crawled from the latest log
                // line — mirrors CrawlView.jsx:48-54.
                let activePage = null;
                for (let i = logLines.length - 1; i >= 0; i--) {
                  const m = logLines[i].match(/https?:\/\/[^\s)]+/);
                  if (m) { activePage = m[0]; break; }
                }
                const innerTabs = isCrawl
                  ? ["pipeline", "sitegraph", "logs"]
                  : ["pipeline", "logs"];
                const labelFor = (t) => t === "sitegraph" ? "Site graph"
                  : t.charAt(0).toUpperCase() + t.slice(1);
                return (
                  <>
                    <div className="tl-inner-tabs">
                      {innerTabs.map(t => (
                        <button
                          key={t}
                          className={`tl-inner-tab${innerTab === t ? " tl-inner-tab--active" : ""}`}
                          onClick={() => setInnerTab(t)}
                        >
                          {labelFor(t)}
                        </button>
                      ))}
                    </div>

                    {innerTab === "pipeline" && (
                      <PipelinePanel run={runData} />
                    )}

                    {innerTab === "sitegraph" && isCrawl && (
                      <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
                        <SiteGraph
                          pages={graphPages}
                          activePage={activePage}
                          isRunning={isRunActive}
                        />
                      </div>
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
                  </>
                );
              })()}
            </div>
          ) : (
            // ── Idle / Done: configuration ──
            <div className="tl-config">
              <div className="tl-config-scroll">

                {/* Error banner — launch-time errors only; run-terminal
                    banners live inside the run-center view above. */}
                {error && (
                  <div className="banner banner-error mb-md">
                    {error}
                  </div>
                )}

                {/* ── Requirement textarea (Requirement tab only) ── */}
                {tab === "requirement" && (
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
                )}

                {/* ── Unified Test Dials surface ──
                    Crawl tab gets the Explorer sub-tab (discovery mode + state-
                    explorer tuning); Requirement tab hides it because the
                    requirement flow doesn't crawl. The component is fully
                    controlled — `dialsConfig` is the single source of truth and
                    feeds the API call sites directly. */}
                <TestConfig
                  value={dialsConfig}
                  onChange={setDialsConfig}
                  showExplorer={tab === "crawl"}
                />
              </div>
            </div>
          )}

          {/* ── Right: Launch panel / Run stats ── */}
          <div className="tl-panel">
            <div className="tl-panel-scroll">

              {activeRun ? (
                // ── Attached run: stats persist for running / completed / failed ──
                <>
                  <div className="tl-panel-section-label">
                    {isRunActive ? "So Far" : isRunDone ? "Final" : "At Stop"}
                  </div>
                  <div className="tl-run-stats">
                    <div className="tl-run-stat tl-run-stat--accent">
                      <div className="tl-run-stat-val">{ps.rawTestsGenerated ?? runData?.testsGenerated ?? 0}</div>
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
                        width: isRunDone
                          ? "100%"
                          : runData?.currentStep != null
                            ? `${Math.round(((runData.currentStep - 1) / 7) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>

                  {isRunActive ? (
                    <button
                      className="btn btn-ghost"
                      style={{ width: "100%", justifyContent: "center", gap: 6 }}
                      onClick={handleStop}
                      disabled={stopLoading}
                    >
                      <StopCircle size={15} />
                      {stopLoading ? "Stopping…" : "Stop run"}
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      style={{ width: "100%", justifyContent: "center", gap: 6 }}
                      onClick={handleReset}
                    >
                      Dismiss &amp; configure new run
                    </button>
                  )}
                </>
              ) : (
                // ── Idle: launch panel + cross-project active runs ──
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
                        <button
                          key={run.id}
                          type="button"
                          className="tl-active-run-card mb-sm"
                          onClick={() => handleAttachRun(run)}
                          title="View live pipeline for this run"
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: 0, border: "1px solid var(--border)",
                            background: "var(--surface)", cursor: "pointer",
                            font: "inherit", color: "inherit",
                          }}
                        >
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
                        </button>
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
