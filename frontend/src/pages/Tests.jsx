import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, X, CheckCircle2, XCircle, Clock,
  Loader2, Play,
  AlertCircle, ArrowUpDown, Trash2, Inbox, Atom,
} from "lucide-react";
import { api } from "../api.js";
import useProjectData, { invalidateProjectDataCache } from "../hooks/useProjectData.js";
import { queryClient, projectDataQueryKeys } from "../queryClient.js";
import AgentTag from "../components/shared/AgentTag.jsx";
import RunRegressionModal from "../components/run/RunRegressionModal.jsx";
import ModalShell from "../components/shared/ModalShell.jsx";
import ProjectExportMenu from "../components/project/ProjectExportMenu.jsx";
import { cleanTestName } from "../utils/formatTestName.js";
import { fmtRelativeTimeFull } from "../utils/formatters.js";
import { testTypeBadgeClass, testTypeLabel, isBddTest } from "../utils/testTypeLabels.js";
import { StatusBadge, ScenarioBadges } from "../components/shared/TestBadges.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
import TablePagination from "../components/shared/TablePagination.jsx";

// Exclude "All" sentinel entries — reset is handled by clicking an active filter
// or the explicit clear-all button in the bar.
const STATUS_FILTERS = [
  { key: "Passing", tooltip: "Passing",  activeColor: "#16a34a", activeBg: "rgba(34,197,94,0.12)",   icon: <CheckCircle2 size={14} /> },
  { key: "Failing", tooltip: "Failing",  activeColor: "#dc2626", activeBg: "rgba(239,68,68,0.12)",   icon: <XCircle      size={14} /> },
  { key: "Not Run", tooltip: "Not run",  activeColor: "#64748b", activeBg: "rgba(100,116,139,0.12)", icon: <Clock        size={14} /> },
];
const REVIEW_FILTERS = [
  { key: "Approved", tooltip: "Approved", activeColor: "#16a34a", activeBg: "rgba(34,197,94,0.12)",  icon: <CheckCircle2 size={14} /> },
  { key: "Draft",    tooltip: "Draft",    activeColor: "#d97706", activeBg: "rgba(217,119,6,0.12)",  icon: <AlertCircle size={14} /> },
];
const CATEGORY_FILTERS = [
  { key: "UI",  tooltip: "UI tests",  activeColor: "#7c3aed", activeBg: "rgba(124,58,237,0.12)", label: "UI"  },
  { key: "API", tooltip: "API tests", activeColor: "#2563eb", activeBg: "rgba(37,99,235,0.12)",  label: "🌐 API" },
];

const PAGE_SIZE = 10;

// ── Empty State ────────────────────────────────────────────────────────────────

function EmptyState({ projects, tests, search, reviewFilter, onCreateTest, onClearSearch, onClearFilters, navigate }) {
  // No projects at all — first-time user
  if (projects.length === 0) {
    return (
      <div style={{ padding: "52px 40px", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 14 }}>🚀</div>
        <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 8, color: "var(--text)" }}>
          Welcome to Tests
        </div>
        <div style={{ fontSize: "0.875rem", color: "var(--text2)", marginBottom: 8, lineHeight: 1.7, maxWidth: 380, margin: "0 auto 20px" }}>
          Start by creating a project. Sentri will crawl your app and AI-generate test cases for you to review and run.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/projects/new")}>
            Create first project
          </button>
        </div>
      </div>
    );
  }

  // Has projects, no tests at all — crawl hasn't been run yet
  if (tests.length === 0) {
    return (
      <div style={{ padding: "52px 40px", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 14 }}>🧪</div>
        <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 8, color: "var(--text)" }}>
          No tests generated yet
        </div>
        <div style={{ fontSize: "0.875rem", color: "var(--text2)", lineHeight: 1.7, maxWidth: 400, margin: "0 auto 20px" }}>
          Use <strong>Crawl</strong> above to auto-discover pages and generate tests, or <strong>Generate</strong> from a requirement.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={onCreateTest}>
            Generate with AI ✦
          </button>
        </div>
      </div>
    );
  }

  // Has tests, but the active filter hides them all
  const draftCount  = tests.filter(t => !t.reviewStatus || t.reviewStatus === "draft").length;
  const approvedCount = tests.filter(t => t.reviewStatus === "approved").length;

  // Contextual hint based on which filter is active
  let hint = null;
  if (reviewFilter === "Approved" && draftCount > 0) {
    hint = (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        background: "var(--amber-bg)", border: "1px solid rgba(217,119,6,0.2)",
        borderRadius: "var(--radius)", padding: "10px 16px",
        fontSize: "0.82rem", color: "var(--amber)", marginBottom: 20, textAlign: "left",
      }}>
        <span style={{ fontSize: "1rem" }}>💡</span>
        <span>
          You have <strong>{draftCount} draft {draftCount === 1 ? "test" : "tests"}</strong> waiting for review.
          Switch to <strong>Draft</strong> to approve them and add them to your regression suite.
        </span>
      </div>
    );
  } else if (reviewFilter === "Draft" && approvedCount > 0) {
    hint = (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        background: "var(--blue-bg)", border: "1px solid rgba(37,99,235,0.15)",
        borderRadius: "var(--radius)", padding: "10px 16px",
        fontSize: "0.82rem", color: "var(--blue)", marginBottom: 20, textAlign: "left",
      }}>
        <span style={{ fontSize: "1rem" }}>ℹ️</span>
        <span>No draft tests — all <strong>{approvedCount}</strong> tests have already been reviewed.</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "52px 40px", textAlign: "center" }}>
      <div style={{ fontSize: "2rem", marginBottom: 14 }}>🔍</div>
      <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 8, color: "var(--text)" }}>
        No tests match your filters
      </div>
      {hint && <div style={{ marginBottom: 4 }}>{hint}</div>}
      <div style={{ fontSize: "0.875rem", color: "var(--text2)", marginBottom: 20 }}>
        {search ? `No results for "${search}".` : "Try adjusting your filters."}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClearFilters}>
          Clear filters
        </button>
        <button className="btn btn-primary btn-sm" onClick={onCreateTest}>
          Generate with AI ✦
        </button>
      </div>
    </div>
  );
}

// ── Tests Page ─────────────────────────────────────────────────────────────────

export default function Tests() {
  usePageTitle("Tests");
  const { projects, allTests: tests, loading } = useProjectData({ fetchRuns: false });
  const [searchParams, setSearchParams] = useSearchParams();

  // Mutate every cached tests query (regardless of projectIds suffix) so
  // optimistic updates surface immediately on every consumer.
  const updateTestsCache = useCallback((updater) => {
    queryClient.setQueriesData({ queryKey: projectDataQueryKeys.tests }, (prev) =>
      Array.isArray(prev) ? updater(prev) : prev,
    );
  }, []);
  const search        = searchParams.get("q")        || "";
  const filter        = searchParams.get("status")   || "All";
  const reviewFilter  = searchParams.get("review")   || "All Tests";
  const categoryFilter= searchParams.get("category") || "All";
  const staleFilter   = searchParams.get("stale")    === "true";

  const setSearch        = useCallback((v) => setSearchParams(p => { const n = new URLSearchParams(p); v ? n.set("q", v) : n.delete("q"); return n; }, { replace: true }), [setSearchParams]);
  const setFilter        = useCallback((v) => setSearchParams(p => { const n = new URLSearchParams(p); v !== "All" ? n.set("status", v) : n.delete("status"); return n; }, { replace: true }), [setSearchParams]);
  const setReviewFilter  = useCallback((v) => setSearchParams(p => { const n = new URLSearchParams(p); v !== "All Tests" ? n.set("review", v) : n.delete("review"); return n; }, { replace: true }), [setSearchParams]);
  const setCategoryFilter= useCallback((v) => setSearchParams(p => { const n = new URLSearchParams(p); v !== "All" ? n.set("category", v) : n.delete("category"); return n; }, { replace: true }), [setSearchParams]);
  const setStaleFilter   = useCallback((v) => setSearchParams(p => { const n = new URLSearchParams(p); v ? n.set("stale", "true") : n.delete("stale"); return n; }, { replace: true }), [setSearchParams]);

  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState(null);   // "status" | "lastRun" | "project"
  const [sortDir, setSortDir] = useState("asc");   // "asc" | "desc"
  const [selected, setSelected] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(null); // {action, ids}
  const [bulkError, setBulkError] = useState(null);    // partial failure feedback
  const [hoveredRow, setHoveredRow] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const navigate = useNavigate();
  const searchRef = useRef(null);

  // ── Filter counts ────────────────────────────────────────────────────────────
  const statusCounts = useMemo(() => ({
    All:      tests.length,
    Passing:  tests.filter(t => t.lastResult === "passed").length,
    Failing:  tests.filter(t => t.lastResult === "failed").length,
    "Not Run": tests.filter(t => !t.lastResult).length,
  }), [tests]);

  const reviewCounts = useMemo(() => ({
    "All Tests": tests.length,
    Approved:    tests.filter(t => t.reviewStatus === "approved").length,
    Draft:       tests.filter(t => !t.reviewStatus || t.reviewStatus === "draft").length,
  }), [tests]);

  const isApiTest = useCallback(t => t.generatedFrom === "api_har_capture" || t.generatedFrom === "api_user_described", []);
  const categoryCounts = useMemo(() => ({
    All: tests.length,
    API: tests.filter(isApiTest).length,
    UI:  tests.filter(t => !isApiTest(t)).length,
  }), [tests, isApiTest]);

  const projMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p])),
    [projects]
  );

  const filtered = useMemo(() => {
    const list = tests.filter(t => {
      // Project filter — mirrors the Review Queue's project dropdown
      if (selectedProjectId !== "all" && t.projectId !== selectedProjectId) return false;
      const matchReview =
        reviewFilter === "All Tests" ? true :
        reviewFilter === "Approved" ? t.reviewStatus === "approved" :
        reviewFilter === "Draft" ? (!t.reviewStatus || t.reviewStatus === "draft") : true;
      const matchSearch = !search
        || t.name?.toLowerCase().includes(search.toLowerCase())
        || t.description?.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === "All" ? true :
        filter === "Passing" ? t.lastResult === "passed" :
        filter === "Failing" ? t.lastResult === "failed" :
        filter === "Not Run" ? !t.lastResult : true;
      const matchCategory =
        categoryFilter === "All" ? true :
        categoryFilter === "API" ? isApiTest(t) :
        categoryFilter === "UI" ? !isApiTest(t) : true;
      const matchStale = !staleFilter || t.isStale;
      return matchReview && matchSearch && matchFilter && matchCategory && matchStale;
    });
    // Sorting
    if (sortCol) {
      list.sort((a, b) => {
        let av, bv;
        if (sortCol === "status") { av = a.lastResult || ""; bv = b.lastResult || ""; }
        else if (sortCol === "lastRun") { av = a.lastRunAt || ""; bv = b.lastRunAt || ""; }
        else if (sortCol === "project") { av = projMap[a.projectId]?.name || ""; bv = projMap[b.projectId]?.name || ""; }
        else if (sortCol === "reviewStatus") { av = a.reviewStatus || "draft"; bv = b.reviewStatus || "draft"; }
        else if (sortCol === "type") { av = a.type || ""; bv = b.type || ""; }
        else if (sortCol === "priority") { av = a.priority || "medium"; bv = b.priority || "medium"; }
        else { av = ""; bv = ""; }
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [tests, reviewFilter, search, filter, categoryFilter, staleFilter, selectedProjectId, sortCol, sortDir, projMap]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filter, reviewFilter, categoryFilter, staleFilter, selectedProjectId]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function SortHeader({ col, children }) {
    const active = sortCol === col;
    return (
      <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(col)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {children}
          <ArrowUpDown size={10} style={{ opacity: active ? 1 : 0.3, color: active ? "var(--accent)" : "var(--text3)" }} />
        </span>
      </th>
    );
  }

  // ── Bulk select & actions ──────────────────────────────────────────────────
  function toggleSelect(testId) {
    setSelected(s => { const n = new Set(s); n.has(testId) ? n.delete(testId) : n.add(testId); return n; });
  }

  function toggleAll(checked, ids) {
    setSelected(checked ? new Set(ids) : new Set());
  }

  async function executeBulkDelete(ids) {
    setBulkConfirm(null);
    setBulkError(null);
    if (!ids?.length) return;
    setActionLoading("delete");
    try {
      // Group by projectId so we can call the bulk endpoint per project
      const byProject = {};
      ids.forEach(testId => {
        const t = tests.find(x => x.id === testId);
        if (t) {
          if (!byProject[t.projectId]) byProject[t.projectId] = [];
          byProject[t.projectId].push(testId);
        }
      });
      const results = await Promise.allSettled(
        Object.entries(byProject).map(([projectId, testIds]) =>
          api.bulkDeleteTests(projectId, testIds)
        )
      );
      const failedCount = results.filter(r => r.status === "rejected").length;
      if (failedCount > 0) {
        setBulkError(`Some tests failed to delete. The rest were removed successfully.`);
        setTimeout(() => setBulkError(null), 6000);
      }

      // ── Optimistic cache removal ─────────────────────────────────────
      // Drop the successfully-deleted tests from the cache immediately so the
      // UI updates the moment `actionLoading` clears in the finally block —
      // matches the pattern used by deleteSingleTest and executeBulkAction.
      // Without this, the fire-and-forget invalidate below would leave the
      // deleted tests visible until the background refetch resolves.
      const successfullyDeleted = new Set(
        Object.entries(byProject).flatMap(([, ids], i) =>
          results[i].status === "fulfilled" ? ids : [],
        ),
      );
      if (successfullyDeleted.size > 0) {
        updateTestsCache(prev => prev.filter(t => !successfullyDeleted.has(t.id)));
      }

      // Invalidate the shared cache so other pages (Dashboard, ProjectDetail,
      // Reports) see the deletion on next render. Fire-and-forget — the
      // optimistic patch above already updated the local view.
      invalidateProjectDataCache();
      setSelected(new Set());
    } catch (err) {
      console.error("Bulk delete failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Row actions ────────────────────────────────────────────────────────────
  async function runSingleTest(e, testId) {
    e.stopPropagation();
    setActionLoading(testId);
    try {
      const { runId } = await api.runSingleTest(testId);
      navigate(`/runs/${runId}`);
    } catch (err) { console.error("Run failed:", err); }
    finally { setActionLoading(null); }
  }

  async function deleteSingleTest(e, t) {
    e.stopPropagation();
    setActionLoading(t.id);
    try {
      await api.deleteTest(t.projectId, t.id);
      updateTestsCache(prev => prev.filter(x => x.id !== t.id));
      invalidateProjectDataCache();
      setSelected(s => { const n = new Set(s); n.delete(t.id); return n; });
    } catch (err) { console.error("Delete failed:", err); }
    finally { setActionLoading(null); }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, filtered]);

  // Scope the draft chip's count + click target to the selected project so the
  // chip reads the same way the rest of the page does — when the user has
  // narrowed to one project, the Review Queue link should land them there too.
  const draftCount = tests.filter(t =>
    (!t.reviewStatus || t.reviewStatus === "draft") &&
    (selectedProjectId === "all" || t.projectId === selectedProjectId)
  ).length;

  // ── Export: unified with ProjectDetail via ProjectExportMenu (Zephyr / TestRail / Playwright ZIP).
  // All three export targets are project-scoped server-side, so the menu
  // surfaces one dropdown per project that has tests in the current workspace.
  const projectsWithTests = useMemo(() => {
    const counts = {};
    for (const t of tests) {
      if (!counts[t.projectId]) counts[t.projectId] = { total: 0, approved: 0 };
      counts[t.projectId].total += 1;
      if (t.reviewStatus === "approved") counts[t.projectId].approved += 1;
    }
    return projects.filter(p => counts[p.id]?.total > 0).map(p => ({
      ...p,
      totalTests: counts[p.id].total,
      approvedTests: counts[p.id].approved,
    }));
  }, [projects, tests]);

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 className="page-title">Tests</h1>
            <p className="page-subtitle">Manage, run, and review test cases across all projects</p>
          </div>
          {/* The "drafts → Review Queue" entry-point lives in the
              "Review Drafts" quick-action card below — no need for a
              duplicate header button. */}
          <div style={{ flex: 1 }} />
          {/* Project dropdown — mirrors the Review Queue's project filter.
              Scopes the export button to a single project so users with 3+
              projects don't see 3+ export buttons cluttering the header. */}
          {projects.length > 1 && (
            <select
              className="input"
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              style={{ height: 32, fontSize: "0.78rem", padding: "0 28px 0 10px", minWidth: 140 }}
            >
              <option value="all">All projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {projectsWithTests.length > 0 && (() => {
            // Show export for the selected project, or the first project if "all"
            const exportProject = selectedProjectId !== "all"
              ? projectsWithTests.find(p => p.id === selectedProjectId)
              : projectsWithTests[0];
            if (!exportProject) return null;
            return (
              <ProjectExportMenu
                projectId={exportProject.id}
                totalTests={exportProject.totalTests}
                approvedCount={exportProject.approvedTests}
                label="Export"
                buttonClassName="btn btn-ghost btn-sm"
              />
            );
          })()}
        </div>
      </div>

      {/* ── Quick Actions ──
          Three-card grid: Test Lab (creation), Review Drafts (approval),
          Run Tests (execution) — mirrors the three-pane mental model the
          Review Queue PR formalised (creation → approval → execution).
          Cards stay project-aware: when a single project is selected in
          the dropdown, deep-links carry `?projectId=…`/`/projects/:id/…`
          so the user lands in the same scope they're filtering on. */}
      <div className="stat-grid mb-lg" style={{ marginBottom: 20 }}>
        {[
          {
            icon: <Atom size={16} />,
            title: "Test Lab",
            desc: "Crawl an app or generate from a requirement",
            color: "var(--accent-bg)",
            iconColor: "var(--accent)",
            action: () => projects.length === 0
              ? navigate("/projects/new")
              : navigate(selectedProjectId !== "all"
                  ? `/projects/${selectedProjectId}/test-lab`
                  : "/test-lab"),
          },
          {
            icon: <Inbox size={16} />,
            title: "Review Drafts",
            desc: draftCount > 0
              ? `${draftCount} draft${draftCount !== 1 ? "s" : ""} pending review`
              : "Approve or reject generated tests",
            color: "var(--amber-bg)",
            iconColor: "var(--amber)",
            badge: draftCount > 0 ? draftCount : null,
            action: () => projects.length === 0
              ? navigate("/projects/new")
              : navigate(selectedProjectId !== "all"
                  ? `/review-queue?projectId=${selectedProjectId}`
                  : "/review-queue"),
          },
          {
            icon: <Play size={16} />,
            title: "Run Tests",
            desc: "Execute approved regression suite",
            color: "var(--green-bg)",
            iconColor: "var(--green)",
            action: () => projects.length === 0 ? navigate("/projects/new") : setShowRunModal(true),
          },
        ].map((a, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: 16, cursor: "pointer", transition: "box-shadow 0.15s", position: "relative" }}
            onClick={a.action}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ""}
          >
            {a.badge != null && (
              <span style={{
                position: "absolute", top: 10, right: 10,
                minWidth: 20, height: 20, borderRadius: 10,
                background: a.iconColor, color: "#fff",
                fontSize: "0.68rem", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px", lineHeight: 1,
              }}>
                {a.badge > 99 ? "99+" : a.badge}
              </span>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: a.color, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, flexShrink: 0, color: a.iconColor,
              }}>
                {a.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

            {/* Tests table */}
      <div className="card tests-table">
        <div className="tests-filter-bar" style={{
          padding: "14px 16px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", flex: "0 0 auto" }}>
            {categoryFilter !== "All" ? `${categoryFilter} Tests` : reviewFilter === "Draft" ? "Draft Tests" : reviewFilter === "All Tests" ? "All Tests" : "Regression Tests"} ({filtered.length})
          </div>
          {/* Search — constrained width so it doesn't dominate the bar */}
          <div style={{ width: 220, flexShrink: 0, position: "relative" }}>
            <Search size={13} color="var(--text3)" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
            <input
              ref={searchRef}
              className="input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tests… (/)"
              style={{ paddingLeft: 28, paddingRight: search ? 30 : 12, height: 32, fontSize: "0.82rem" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 0, display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Spacer pushes filter group to the right */}
          <div className="tests-filter-spacer" style={{ flex: 1 }} />

          {/* ── Icon-only filter pill bar ─────────────────────────────── */}
          <div className="tests-filter-pills" style={{
            display: "flex", alignItems: "center", gap: 1,
            background: "var(--bg2)", padding: "3px 4px",
            borderRadius: "var(--radius)", border: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: "0.68rem", color: "var(--text3)", fontWeight: 600, padding: "0 6px 0 2px", userSelect: "none", letterSpacing: "0.02em" }}>
              Filters
            </span>

            {/* Status filter icons */}
            {STATUS_FILTERS.map(f => {
              const active = filter === f.key;
              const count  = statusCounts[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  title={`${f.tooltip} · ${count} test${count !== 1 ? "s" : ""} · click again to clear`}
                  onClick={() => setFilter(active ? "All" : f.key)}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 30, height: 28, borderRadius: 6, border: "none",
                    cursor: "pointer", transition: "background 0.12s, color 0.12s, box-shadow 0.12s",
                    background: active ? f.activeBg      : "transparent",
                    color:      active ? f.activeColor   : "var(--text3)",
                    boxShadow:  active ? `0 0 0 1.5px ${f.activeColor}55` : "none",
                  }}
                >
                  {f.icon}
                  {/* Count dot on active */}
                  {active && (
                    <span style={{
                      position: "absolute", top: 2, right: 2,
                      minWidth: 14, height: 14, borderRadius: 7,
                      background: f.activeColor, color: "#fff",
                      fontSize: "0.55rem", fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1, padding: "0 2px",
                    }}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Divider */}
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px", flexShrink: 0 }} />

            {/* Review filter icons */}
            {REVIEW_FILTERS.map(f => {
              const active = reviewFilter === f.key;
              const count  = reviewCounts[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  title={`${f.tooltip} · ${count} test${count !== 1 ? "s" : ""} · click again to clear`}
                  onClick={() => setReviewFilter(active ? "All Tests" : f.key)}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 30, height: 28, borderRadius: 6, border: "none",
                    cursor: "pointer", transition: "background 0.12s, color 0.12s, box-shadow 0.12s",
                    background: active ? f.activeBg      : "transparent",
                    color:      active ? f.activeColor   : "var(--text3)",
                    boxShadow:  active ? `0 0 0 1.5px ${f.activeColor}55` : "none",
                  }}
                >
                  {f.icon}
                  {active && (
                    <span style={{
                      position: "absolute", top: 2, right: 2,
                      minWidth: 14, height: 14, borderRadius: 7,
                      background: f.activeColor, color: "#fff",
                      fontSize: "0.55rem", fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1, padding: "0 2px",
                    }}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Divider */}
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px", flexShrink: 0 }} />

            {/* Category filter buttons (UI / API) */}
            {CATEGORY_FILTERS.map(f => {
              const active = categoryFilter === f.key;
              const count  = categoryCounts[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  title={`${f.tooltip} · ${count} test${count !== 1 ? "s" : ""} · click again to clear`}
                  onClick={() => setCategoryFilter(active ? "All" : f.key)}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 8px", height: 28, borderRadius: 6, border: "none",
                    cursor: "pointer", transition: "background 0.12s, color 0.12s, box-shadow 0.12s",
                    fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap",
                    background: active ? f.activeBg      : "transparent",
                    color:      active ? f.activeColor   : "var(--text3)",
                    boxShadow:  active ? `0 0 0 1.5px ${f.activeColor}55` : "none",
                  }}
                >
                  {f.label}
                  {active && (
                    <span style={{
                      marginLeft: 4,
                      minWidth: 14, height: 14, borderRadius: 7,
                      background: f.activeColor, color: "#fff",
                      fontSize: "0.55rem", fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1, padding: "0 2px",
                    }}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Divider */}
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px", flexShrink: 0 }} />

            {/* Stale filter (AUTO-013) */}
            <button
              title={`Stale tests · ${tests.filter(t => t.isStale).length} test${tests.filter(t => t.isStale).length !== 1 ? "s" : ""} · click again to clear`}
              onClick={() => setStaleFilter(!staleFilter)}
              style={{
                position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 8px", height: 28, borderRadius: 6, border: "none",
                cursor: "pointer", transition: "background 0.12s, color 0.12s, box-shadow 0.12s",
                fontSize: "0.68rem", fontWeight: 600, whiteSpace: "nowrap", gap: 4,
                background: staleFilter ? "rgba(100,116,139,0.12)" : "transparent",
                color:      staleFilter ? "#64748b"                : "var(--text3)",
                boxShadow:  staleFilter ? "0 0 0 1.5px #64748b55"  : "none",
              }}
            >
              <Clock size={12} /> Stale
              {staleFilter && (
                <span style={{
                  marginLeft: 2,
                  minWidth: 14, height: 14, borderRadius: 7,
                  background: "#64748b", color: "#fff",
                  fontSize: "0.55rem", fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  lineHeight: 1, padding: "0 2px",
                }}>
                  {tests.filter(t => t.isStale).length > 99 ? "99+" : tests.filter(t => t.isStale).length}
                </span>
              )}
            </button>

            {/* Clear-all button — only visible when any filter is active */}
            {(filter !== "All" || reviewFilter !== "All Tests" || categoryFilter !== "All" || staleFilter) && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px", flexShrink: 0 }} />
                <button
                  title="Clear all filters"
                  onClick={() => { setFilter("All"); setReviewFilter("All Tests"); setCategoryFilter("All"); setStaleFilter(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: 6, border: "none",
                    cursor: "pointer", background: "rgba(239,68,68,0.08)", color: "var(--red)",
                    transition: "background 0.12s",
                  }}
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8, borderRadius: 8 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            projects={projects}
            tests={tests}
            search={search}
            reviewFilter={reviewFilter}
            onCreateTest={() => navigate(`/projects/${projects[0]?.id || ""}/test-lab?tab=requirement`)}
            onClearSearch={() => setSearch("")}
            onClearFilters={() => { setSearch(""); setFilter("All"); setReviewFilter("All Tests"); setCategoryFilter("All"); setStaleFilter(false); }}
            navigate={navigate}
          />
        ) : (
          <>
            {/* Bulk action bar — delete only (review actions live in Review Queue) */}
            {selected.size > 0 && (
              <div className="tests-bulk-bar" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--accent-bg)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--accent)", fontWeight: 500 }}>
                  {selected.size} selected
                </span>
                <button
                  className="btn btn-sm"
                  style={{ background: "var(--red-bg)", color: "var(--red)", border: "1px solid #fca5a5" }}
                  onClick={() => {
                    const ids = Array.from(selected);
                    if (ids.length > 1) setBulkConfirm({ action: "delete", ids });
                    else executeBulkDelete(ids);
                  }}
                  disabled={!!actionLoading}
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
              </div>
            )}
            {/* Partial failure feedback from bulk actions */}
            {bulkError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--amber-bg)", borderBottom: "1px solid var(--border)", fontSize: "0.82rem", color: "var(--amber)" }}>
                <AlertCircle size={13} />
                {bulkError}
                <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setBulkError(null)}>
                  <X size={11} />
                </button>
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36, paddingRight: 0 }}>
                    <input type="checkbox"
                      checked={paged.length > 0 && paged.every(t => selected.has(t.id))}
                      onChange={e => toggleAll(e.target.checked, paged.map(t => t.id))}
                      style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                  </th>
                  <th>Test ID</th>
                  <th>Test Name</th>
                  <SortHeader col="project">Project</SortHeader>
                  <SortHeader col="priority">Priority</SortHeader>
                  <SortHeader col="type">Type</SortHeader>
                  <SortHeader col="reviewStatus">Review</SortHeader>
                  <SortHeader col="status">Status</SortHeader>
                  <SortHeader col="lastRun">Last Run</SortHeader>
                </tr>
              </thead>
              <tbody>
                {paged.map(t => {
                  const isSelected = selected.has(t.id);
                  const isHovered = hoveredRow === t.id;
                  return (
                    <tr
                      key={t.id}
                      style={{ cursor: "pointer", background: isSelected ? "var(--accent-bg)" : undefined }}
                      onClick={() => navigate(`/tests/${t.id}`)}
                      onMouseEnter={() => setHoveredRow(t.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <td style={{ paddingRight: 0 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.id)}
                          style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                      </td>
                      <td>
                        <span className="mono-id">
                          {t.id.length > 8 ? t.id.slice(0, 8) + "…" : t.id}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <AgentTag type="TA" />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{cleanTestName(t.name)}</div>
                            {t.description && (
                              <div style={{ fontSize: "0.75rem", color: "var(--text3)", marginTop: 1, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.description}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                              <ScenarioBadges test={t} isBddTest={isBddTest} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {projMap[t.projectId] && (
                          <span
                            className="badge badge-gray"
                            style={{ cursor: "pointer" }}
                            onClick={e => { e.stopPropagation(); navigate(`/projects/${t.projectId}`); }}
                          >
                            {projMap[t.projectId].name}
                          </span>
                        )}
                      </td>
                      <td>
                        {t.priority === "high"
                          ? <span className="badge badge-red">High</span>
                          : t.priority === "low"
                            ? <span className="badge badge-gray">Low</span>
                            : t.priority
                              ? <span className="badge badge-gray" style={{ textTransform: "capitalize" }}>{t.priority}</span>
                              : null}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {t.type && (
                            <span className={`badge ${testTypeBadgeClass(t.type)}`}>
                              {testTypeLabel(t.type, true)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {t.reviewStatus === "draft" && <span className="badge badge-amber">Draft</span>}
                          {t.reviewStatus === "approved" && <span className="badge badge-green">Approved</span>}
                          {t.reviewStatus === "rejected" && <span className="badge badge-red">Rejected</span>}
                        </div>
                      </td>
                      <td><StatusBadge result={t.lastResult} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text2)" }} title={t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : undefined}>
                            {fmtRelativeTimeFull(t.lastRunAt)}
                          </span>
                          {isHovered && (
                            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }} onClick={e => e.stopPropagation()}>
                              <button className="btn btn-ghost btn-xs" title="Run test" onClick={e => runSingleTest(e, t.id)} disabled={actionLoading === t.id}>
                                {actionLoading === t.id ? <Loader2 size={11} className="spin" /> : <Play size={11} />}
                              </button>
                              <button className="btn btn-ghost btn-xs" title="Delete test" onClick={e => deleteSingleTest(e, t)} disabled={actionLoading === t.id}>
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <TablePagination
              total={filtered.length}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              label="tests"
            />
          </>
        )}
      </div>



      {/* Modals */}
      {/* CrawlProjectModal and GenerateTestModal have been migrated to the
          dedicated Test Lab page (/projects/:id/test-lab) — the quick-action
          cards above now navigate there instead of opening modals. */}
      {showRunModal && (
        <RunRegressionModal projects={projects} onClose={() => setShowRunModal(false)} defaultProjectId={filtered[0]?.projectId || projects[0]?.id || ""} />
      )}

      {/* Bulk delete confirmation modal */}
      {bulkConfirm && bulkConfirm.action === "delete" && (
        <ModalShell onClose={() => setBulkConfirm(null)} width="min(420px, 95vw)" style={{ padding: "28px 32px" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 10 }}>Delete {bulkConfirm.ids.length} tests?</div>
          <div style={{ fontSize: "0.875rem", color: "var(--text2)", marginBottom: 20, lineHeight: 1.6 }}>
            These tests will be moved to the recycle bin. This cannot be undone easily.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setBulkConfirm(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={() => executeBulkDelete(bulkConfirm.ids)}>
              Delete {bulkConfirm.ids.length} tests
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}