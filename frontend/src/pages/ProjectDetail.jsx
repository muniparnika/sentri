import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { queryClient, projectDetailQueryKeys } from "../queryClient.js";
import {
  useProjectDetailQuery,
  useTraceabilityQuery,
} from "../hooks/queries/useProjectDetailQueries.js";
import usePageTitle from "../hooks/usePageTitle.js";
import useProjectRunMonitor from "../hooks/useProjectRunMonitor.js";
import { useNotifications } from "../context/NotificationContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { userHasRole } from "../utils/roles.js";
import ActiveRunBanner from "../components/project/ActiveRunBanner.jsx";
import RunToast from "../components/project/RunToast.jsx";
import RunsTab from "../components/project/RunsTab.jsx";
import TraceabilityTab from "../components/project/TraceabilityTab.jsx";
import ProjectHeader from "../components/project/ProjectHeader.jsx";

// Tests created within this window are considered "new" and highlighted.
const NEW_TEST_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeRun, setActiveRun]         = useState(null);
  const [activeRunId, setActiveRunId]     = useState(null); // for toast link
  const [actionLoading, setActionLoading] = useState(null);
  const [parallelWorkers, setParallelWorkers] = useState(1);
  const [tab, setTab]                     = useState("runs");
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "ui" | "api"
  const [searchInput, setSearchInput]     = useState("");
  const [search, setSearch]               = useState("");
  const PAGE_SIZE = 10;
  const [runsPage, setRunsPage]           = useState(1);
  const [toast, setToast]                 = useState({ msg: "", type: "info", visible: false, showLink: false, runId: null });
  const [showNewBadges, setShowNewBadges] = useState(true);
  const [now, setNow] = useState(Date.now);

  // ── TanStack Query: composite project detail + traceability ─────────────
  const detailQuery = useProjectDetailQuery({
    projectId: id,
    runsPage,
    categoryFilter,
    search,
  });
  const data = detailQuery.data;
  const project = data?.project ?? null;
  const tests = data?.tests ?? [];
  const testsMeta = data?.testsMeta ?? { total: 0, page: 1, pageSize: PAGE_SIZE, hasMore: false };
  const runs = data?.runs ?? [];
  const runsMeta = data?.runsMeta ?? { total: 0, page: 1, pageSize: PAGE_SIZE, hasMore: false };
  const testCounts = data?.testCounts ?? { draft: 0, approved: 0, rejected: 0, total: 0, passed: 0, failed: 0, api: 0, ui: 0 };
  const loading = detailQuery.isLoading;

  const traceabilityQuery = useTraceabilityQuery(id, tab === "traceability");
  const traceability = traceabilityQuery.data ?? null;
  const traceLoading = traceabilityQuery.isLoading && tab === "traceability";

  usePageTitle(project?.name ? `${project.name} — Project` : "Project");
  const { addNotification } = useNotifications();
  const { user: authUser } = useAuth();
  const canEdit = userHasRole(authUser, "qa_lead");

  // ── Debounce search input → search state (300ms) ───────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Highlight recently created tests ──────────────────────────────────────
  // Any test created within the last 5 minutes is "new" — works regardless of
  // how the user navigated here (breadcrumbs, back button, direct link, etc.)
  const newTestIds = useMemo(() => {
    if (!showNewBadges) return new Set();
    const cutoff = now - NEW_TEST_THRESHOLD_MS;
    const ids = new Set();
    for (const t of tests) {
      if (t.createdAt && new Date(t.createdAt).getTime() > cutoff) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [tests, showNewBadges, now]);

  // Auto-expire "NEW" badges: tick `now` every 60s so the useMemo re-evaluates
  // and drops tests that have aged past the 5-minute threshold.
  useEffect(() => {
    if (!showNewBadges) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [showNewBadges]);

  const showToast = (msg, type = "info", runId = null) => {
    setToast({ msg, type, visible: true, showLink: !!runId, runId });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), type === "error" ? 5000 : 3500);
  };

  // Cache invalidation: bust every cached projectDetail query for this project
  // (across any combination of paging/filter inputs). The composite useQuery
  // re-runs automatically because its key includes the same project id.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: projectDetailQueryKeys.root }),
    [],
  );

  useEffect(() => {
    const total = Math.max(1, Math.ceil(runsMeta.total / PAGE_SIZE));
    if (runsPage > total) setRunsPage(total);
  }, [runsMeta.total, runsPage]);

  const handleRunSettled = useCallback((evt) => {
    setActiveRun(null);
    refresh();

    // Push in-app notification when a run finishes on the project page.
    // evt may be a "done" SSE payload ({ status, passed, failed, ... }) or
    // a full run object from a snapshot ({ status, passed, failed, tests, ... }).
    if (evt) {
      const status = evt.status ?? "completed";
      const passed = evt.passed;
      const failed = evt.failed;
      const testsGenerated = evt.testsGenerated ?? (Array.isArray(evt.tests) ? evt.tests.length : undefined);
      const isTestRun = passed != null || failed != null;
      const notifType = status === "completed"       ? "success"
                      : status === "completed_empty" ? "warning"
                      : status === "aborted"         ? "warning"
                      : "error";
      addNotification({
        type: notifType,
        title: status === "completed_empty" ? "No tests generated"
             : status === "aborted" ? "Run aborted"
             : status === "failed"  ? "Run failed"
             : "Run complete",
        body: isTestRun
          ? `${passed ?? 0} passed · ${failed ?? 0} failed`
          : status === "completed_empty"
            ? "Crawl completed but generated 0 tests — check project settings"
            : `${testsGenerated ?? 0} test(s) generated`,
        link: activeRunId ? `/runs/${activeRunId}` : null,
      });
    }
  }, [refresh, addNotification, activeRunId]);
  const { sseDown, retryIn } = useProjectRunMonitor(activeRun, handleRunSettled);

  async function doRun() {
    setActionLoading("run");
    try {
      const body = parallelWorkers > 1 ? { dialsConfig: { parallelWorkers } } : undefined;
      const { runId } = await api.runTests(id, body);
      setActiveRun(runId);
      setActiveRunId(runId);
      const modeHint = parallelWorkers > 1 ? ` (${parallelWorkers}x parallel)` : "";
      showToast(`Regression run started${modeHint}`, "info", runId);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  }


  if (loading) return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      {[80, 400].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 12, marginBottom: 16 }} />)}
    </div>
  );
  if (!project) return (
    <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text2)", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔍</div>
      <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Project not found</div>
      <div style={{ fontSize: "0.875rem", marginBottom: 24 }}>This project may have been deleted or the link is invalid.</div>
      <button className="btn btn-primary" onClick={() => navigate("/projects")}>Back to Projects</button>
    </div>
  );

  return (
    <div className="fade-in" style={{ maxWidth: 980, margin: "0 auto" }}>

      {/* Project header */}
      <ProjectHeader
        project={project}
        projectId={id}
        tests={tests}
        totalTests={testCounts.total}
        parallelWorkers={parallelWorkers}
        onWorkersChange={setParallelWorkers}
        actionLoading={actionLoading}
        onRun={doRun}
        stats={{
          draftTests: { length: testCounts.draft },
          approvedTests: { length: testCounts.approved },
          rejectedTests: { length: testCounts.rejected },
          apiTests: { length: testCounts.api ?? 0 },
          uiTests: { length: testCounts.ui ?? 0 },
          passed: testCounts.passed ?? 0,
          failed: testCounts.failed ?? 0,
        }}
      />

      {/* Active run banner — now the primary CTA to view run, tab stays put */}
      <ActiveRunBanner
        activeRun={activeRun}
        sseDown={sseDown}
        retryIn={retryIn}
        onAbort={async () => {
          try {
            await api.abortRun(activeRun);
            setActiveRun(null);
            showToast("Run aborted", "info");
            refresh();
          } catch (err) { showToast(err.message, "error"); }
        }}
        onViewLive={() => navigate(`/runs/${activeRun}`)}
      />

      {/* Draft-pending reminder — only show on Runs tab or when viewing non-draft filter */}
      {testCounts.draft > 0 && (
        <div className="banner banner-info" style={{ margin: "0 0 16px" }}>
          <span role="img" aria-label="info">ℹ️</span>
          <div style={{ flex: 1 }}>
            <strong>{testCounts.draft} draft test{testCounts.draft !== 1 ? "s" : ""}</strong> waiting for review — approve to add to regression suite.
          </div>
          <button
            className="btn btn-ghost btn-xs"
            style={{ flexShrink: 0 }}
            onClick={() => navigate(`/review-queue?projectId=${id}`)}
          >
            Review Queue →
          </button>
        </div>
      )}

      {/* Tabs — review/Tests removed in PR #7; the Tests tab content was
          migrated to /review-queue. Keeping it here would render an empty
          area when clicked. */}
      <div className="pd-tab-bar">
        {[
          ["runs",         `Runs (${runsMeta.total})`],
          ["traceability", "Traceability"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`pd-tab${tab === key ? " pd-tab--active" : ""}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── RUNS TAB ── */}
      {tab === "runs" && (
        <RunsTab
          runs={runs}
          meta={runsMeta}
          page={runsPage}
          onPageChange={setRunsPage}
        />
      )}

      {/* ── TRACEABILITY TAB ── */}
      {tab === "traceability" && (
        <TraceabilityTab traceability={traceability} traceLoading={traceLoading} />
      )}

      <RunToast msg={toast.msg} type={toast.type} visible={toast.visible} onViewRun={toast.showLink} runId={toast.runId} />

    </div>
  );
}