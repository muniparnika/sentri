/**
 * @module pages/ReviewQueue
 * @description Two-pane review inbox for AI-generated draft tests.
 *
 * Left pane  — sortable, filterable list of draft (or rejected/approved) tests
 *              across all projects. Checkbox multi-select + bulk approve/reject.
 * Right pane — selected test detail: steps, generated code, quality score,
 *              metadata, and Approve / Reject / Edit decision buttons.
 *
 * Routing: /review-queue   (also reachable with ?projectId=PRJ-x to pre-filter)
 * CSS:     styles/pages/review-queue.css
 *
 * Backend: all required endpoints already exist — no new routes needed.
 *   GET  /projects/:id/tests?reviewStatus=draft   — via useProjectData
 *   PATCH /projects/:id/tests/:testId/approve
 *   PATCH /projects/:id/tests/:testId/reject
 *   POST  /projects/:id/tests/bulk  { testIds, action }
 */

import React, {
  useState, useCallback, useMemo, useEffect, useRef,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, XCircle, ChevronRight, ChevronLeft,
  Search, X, Loader2, ExternalLink, Copy,
  ThumbsUp, ThumbsDown, AlertCircle, MoreHorizontal,
} from "lucide-react";
import { api } from "../api.js";
import useProjectData, { invalidateProjectDataCache } from "../hooks/useProjectData.js";
import { queryClient, projectDataQueryKeys } from "../queryClient.js";
import usePageTitle from "../hooks/usePageTitle.js";
import { cleanTestName } from "../utils/formatTestName.js";
import { testTypeBadgeClass, testTypeLabel } from "../utils/testTypeLabels.js";
import { ReviewBadge, StatusBadge } from "../components/shared/TestBadges.jsx";
import highlightCode from "../utils/highlightCode.js";
import "../styles/pages/review-queue.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "draft",    label: "Draft",    emptyLabel: "No drafts" },
  { id: "rejected", label: "Rejected", emptyLabel: "No rejected tests" },
  { id: "approved", label: "Approved", emptyLabel: "No approved tests" },
];

const SORT_OPTIONS = [
  { id: "newest",  label: "Newest first" },
  { id: "oldest",  label: "Oldest first" },
  { id: "quality", label: "Quality score" },
  { id: "project", label: "Project" },
];

// ── Relative time ─────────────────────────────────────────────────────────────
const RELATIVE_UNITS = [
  { max: 60,       divisor: 1,        unit: "second" },
  { max: 3600,     divisor: 60,       unit: "minute" },
  { max: 86400,    divisor: 3600,     unit: "hour"   },
  { max: 2592000,  divisor: 86400,    unit: "day"    },
  { max: 31536000, divisor: 2592000,  unit: "month"  },
  { max: Infinity, divisor: 31536000, unit: "year"   },
];

function relativeTime(dateStr) {
  if (!dateStr) return "—";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 10) return "just now";
  for (const { max, divisor, unit } of RELATIVE_UNITS) {
    if (diff < max) {
      const val = Math.floor(diff / divisor);
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-val, unit);
    }
  }
  return "—";
}

// ── Quality score colour helper ───────────────────────────────────────────────
function qualityClass(score) {
  if (score == null) return "";
  if (score >= 75) return "rq-score--high";
  if (score >= 50) return "rq-score--medium";
  return "rq-score--low";
}

function qualityColor(score) {
  if (score == null) return "var(--text3)";
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

// ── Inline code viewer with copy ──────────────────────────────────────────────
function CodeView({ code }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable */ });
  }

  const highlighted = useMemo(
    () => code ? highlightCode(code) : null,
    [code],
  );

  if (!code) return null;

  return (
    <div className="rq-code-wrap">
      <div className="rq-code-toolbar">
        <span className="rq-code-lang">TypeScript</span>
        <button
          className="btn btn-ghost btn-xs"
          style={{ gap: 4, fontSize: "0.7rem" }}
          onClick={handleCopy}
        >
          {copied ? <CheckCircle2 size={10} color="var(--green)" /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="rq-code-pre"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

// ── Detail sidebar ────────────────────────────────────────────────────────────
function DetailSidebar({
  test, project, tab, listIdx, listLen,
  actionLoading, onApprove, onReject, onPrev, onNext, navigate,
}) {
  const score = test.qualityScore;

  return (
    <div className="rq-detail-sidebar">
      {/* Quality score */}
      {score != null && (
        <div className="rq-info-row">
          <div className="rq-info-label">Quality score</div>
          <div className="rq-quality-row" style={{ marginBottom: 0 }}>
            <span className="rq-quality-score" style={{ color: qualityColor(score) }}>
              {score}
            </span>
            <div className="rq-quality-bar">
              <div
                className="rq-quality-fill"
                style={{ width: `${score}%`, background: qualityColor(score) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Project */}
      <div className="rq-info-row">
        <div className="rq-info-label">Project</div>
        <div className="rq-info-val">{project?.name ?? "—"}</div>
      </div>

      {/* Type */}
      {test.type && (
        <div className="rq-info-row">
          <div className="rq-info-label">Type</div>
          <span className={`badge ${testTypeBadgeClass(test.type)}`}>
            {testTypeLabel(test.type)}
          </span>
        </div>
      )}

      {/* Priority */}
      {test.priority && (
        <div className="rq-info-row">
          <div className="rq-info-label">Priority</div>
          <span className={`badge ${test.priority === "high" ? "badge-red" : test.priority === "low" ? "badge-gray" : "badge-gray"}`}>
            {test.priority.charAt(0).toUpperCase() + test.priority.slice(1)}
          </span>
        </div>
      )}

      {/* Status */}
      <div className="rq-info-row">
        <div className="rq-info-label">Last run</div>
        <StatusBadge result={test.lastResult} />
      </div>

      {/* Review status */}
      <div className="rq-info-row">
        <div className="rq-info-label">Review</div>
        <ReviewBadge status={test.reviewStatus} />
      </div>

      {/* Generated */}
      <div className="rq-info-row">
        <div className="rq-info-label">Generated</div>
        <div className="rq-info-val" style={{ fontSize: "0.75rem" }}>
          {relativeTime(test.createdAt)}
        </div>
      </div>

      {/* Source URL */}
      {test.sourceUrl && (
        <div className="rq-info-row">
          <div className="rq-info-label">Source URL</div>
          <a
            href={test.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: "0.7rem",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              wordBreak: "break-all",
              display: "flex",
              alignItems: "flex-start",
              gap: 3,
            }}
          >
            {test.sourceUrl.replace(/^https?:\/\/[^/]+/, "") || "/"}
            <ExternalLink size={9} style={{ flexShrink: 0, marginTop: 2 }} />
          </a>
        </div>
      )}

      <hr className="rq-sidebar-divider" />

      {/* Quick decision buttons */}
      <div className="rq-info-label" style={{ marginBottom: 8 }}>Quick decision</div>
      <div className="rq-decision-btns">
        {tab !== "approved" && (
          <button
            className="btn-approve"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => onApprove(test)}
            disabled={!!actionLoading}
          >
            {actionLoading === `approve-${test.id}`
              ? <Loader2 size={12} className="spin" />
              : <CheckCircle2 size={12} />}
            Approve
          </button>
        )}
        {tab !== "rejected" && (
          <button
            className="btn-reject"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => onReject(test)}
            disabled={!!actionLoading}
          >
            {actionLoading === `reject-${test.id}`
              ? <Loader2 size={12} className="spin" />
              : <XCircle size={12} />}
            Reject
          </button>
        )}
        {tab === "rejected" && (
          <button
            className="btn-approve"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => onApprove(test)}
            disabled={!!actionLoading}
          >
            {actionLoading === `approve-${test.id}`
              ? <Loader2 size={12} className="spin" />
              : <CheckCircle2 size={12} />}
            Restore to Approved
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: "100%", justifyContent: "center", gap: 5 }}
          onClick={() => navigate(`/tests/${test.id}`)}
        >
          Open in Test Detail <ExternalLink size={11} />
        </button>
      </div>

      {/* Prev / Next navigator */}
      <div className="rq-navigator">
        <button
          className="rq-navigator__btn"
          onClick={onPrev}
          disabled={listIdx <= 0}
        >
          ← Prev
        </button>
        <span className="rq-navigator__pos">
          {listIdx + 1} / {listLen}
        </span>
        <button
          className="rq-navigator__btn"
          onClick={onNext}
          disabled={listIdx >= listLen - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReviewQueue() {
  usePageTitle("Review Queue");
  const navigate   = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { projects, allTests: allTests, loading } = useProjectData({ fetchRuns: false });

  // Optimistically update the shared tests cache (same pattern as Tests.jsx)
  const updateTestsCache = useCallback((updater) => {
    queryClient.setQueriesData(
      { queryKey: projectDataQueryKeys.tests },
      (prev) => Array.isArray(prev) ? updater(prev) : prev,
    );
  }, []);

  // ── URL-driven state ────────────────────────────────────────────────────────
  const tab       = searchParams.get("tab")       || "draft";
  const projectId = searchParams.get("projectId") || "all";
  const listSearch = searchParams.get("q")        || "";

  const setTab       = (v) => setSearchParams(p => { const n = new URLSearchParams(p); n.set("tab", v); n.delete("q"); return n; }, { replace: true });
  const setProjectId = (v) => setSearchParams(p => { const n = new URLSearchParams(p); v !== "all" ? n.set("projectId", v) : n.delete("projectId"); return n; }, { replace: true });
  const setListSearch = (v) => setSearchParams(p => { const n = new URLSearchParams(p); v ? n.set("q", v) : n.delete("q"); return n; }, { replace: true });

  // ── Local state ─────────────────────────────────────────────────────────────
  const [selected,      setSelected]      = useState(new Set());
  const [activeTestId,  setActiveTestId]  = useState(null);
  const [sortBy,        setSortBy]        = useState("newest");
  const [catFilter,     setCatFilter]     = useState("all");
  const [actionLoading, setActionLoading] = useState(null);
  const [bulkError,     setBulkError]     = useState(null);
  const [showSortMenu,  setShowSortMenu]  = useState(false);
  const sortMenuRef = useRef(null);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    function h(e) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showSortMenu]);

  // ── Project lookup map ──────────────────────────────────────────────────────
  const projMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p])),
    [projects],
  );

  // ── Tab counts ──────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    draft:    allTests.filter(t => !t.reviewStatus || t.reviewStatus === "draft").length,
    rejected: allTests.filter(t => t.reviewStatus === "rejected").length,
    approved: allTests.filter(t => t.reviewStatus === "approved").length,
  }), [allTests]);

  // ── Filtered + sorted list ──────────────────────────────────────────────────
  const visibleTests = useMemo(() => {
    let list = allTests.filter(t => {
      // Tab filter
      const matchTab =
        tab === "draft"    ? (!t.reviewStatus || t.reviewStatus === "draft") :
        tab === "rejected" ? t.reviewStatus === "rejected" :
        tab === "approved" ? t.reviewStatus === "approved" : true;
      if (!matchTab) return false;

      // Project filter
      if (projectId !== "all" && t.projectId !== projectId) return false;

      // Category filter
      const isApi = t.generatedFrom === "api_har_capture" || t.generatedFrom === "api_user_described";
      if (catFilter === "api" && !isApi) return false;
      if (catFilter === "web" && isApi) return false;
      if (catFilter === "journey" && !t.isJourneyTest) return false;

      // Search
      if (listSearch) {
        const q = listSearch.toLowerCase();
        const nameMatch = t.name?.toLowerCase().includes(q);
        const descMatch = t.description?.toLowerCase().includes(q);
        const projMatch = projMap[t.projectId]?.name?.toLowerCase().includes(q);
        if (!nameMatch && !descMatch && !projMatch) return false;
      }

      return true;
    });

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "oldest")  return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === "quality") return (b.qualityScore ?? -1) - (a.qualityScore ?? -1);
      if (sortBy === "project") return (projMap[a.projectId]?.name ?? "").localeCompare(projMap[b.projectId]?.name ?? "");
      // newest (default)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;
  }, [allTests, tab, projectId, catFilter, listSearch, sortBy, projMap]);

  // Auto-select first item when list changes and nothing is selected
  useEffect(() => {
    if (!activeTestId && visibleTests.length > 0) {
      setActiveTestId(visibleTests[0].id);
    } else if (activeTestId && !visibleTests.find(t => t.id === activeTestId)) {
      // Active test left the list (e.g. was approved while on draft tab) — advance
      const idx = visibleTests.indexOf(visibleTests.find(t => t.id === activeTestId));
      setActiveTestId(visibleTests[Math.max(0, idx)]?.id ?? null);
    }
  }, [visibleTests, activeTestId]);

  // Clear selection when tab changes
  useEffect(() => { setSelected(new Set()); }, [tab]);

  const activeTest    = useMemo(() => visibleTests.find(t => t.id === activeTestId) ?? null, [visibleTests, activeTestId]);
  const activeProject = activeTest ? projMap[activeTest.projectId] : null;
  const activeIdx     = useMemo(() => visibleTests.findIndex(t => t.id === activeTestId), [visibleTests, activeTestId]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleApprove(test) {
    const key = `approve-${test.id}`;
    setActionLoading(key);
    // Optimistic update
    updateTestsCache(prev => prev.map(t => t.id === test.id ? { ...t, reviewStatus: "approved" } : t));
    try {
      await api.approveTest(test.projectId, test.id);
      invalidateProjectDataCache();
      // Advance to next item
      const next = visibleTests.find((t, i) => i > activeIdx && t.id !== test.id);
      setActiveTestId(next?.id ?? visibleTests.find(t => t.id !== test.id)?.id ?? null);
    } catch (err) {
      // Rollback
      updateTestsCache(prev => prev.map(t => t.id === test.id ? { ...t, reviewStatus: test.reviewStatus } : t));
      console.error("Approve failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(test) {
    const key = `reject-${test.id}`;
    setActionLoading(key);
    updateTestsCache(prev => prev.map(t => t.id === test.id ? { ...t, reviewStatus: "rejected" } : t));
    try {
      await api.rejectTest(test.projectId, test.id);
      invalidateProjectDataCache();
      const next = visibleTests.find((t, i) => i > activeIdx && t.id !== test.id);
      setActiveTestId(next?.id ?? visibleTests.find(t => t.id !== test.id)?.id ?? null);
    } catch (err) {
      updateTestsCache(prev => prev.map(t => t.id === test.id ? { ...t, reviewStatus: test.reviewStatus } : t));
      console.error("Reject failed:", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBulkAction(action) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkError(null);
    setActionLoading(`bulk-${action}`);

    // Capture originals for rollback
    const originals = {};
    for (const t of allTests) {
      if (selected.has(t.id)) originals[t.id] = t.reviewStatus;
    }

    // Optimistic update
    const newStatus = action === "approve" ? "approved" : "rejected";
    updateTestsCache(prev => prev.map(t => selected.has(t.id) ? { ...t, reviewStatus: newStatus } : t));

    // Fire one bulk request per project group (matching Tests.jsx pattern)
    const byProject = {};
    for (const testId of ids) {
      const t = allTests.find(x => x.id === testId);
      if (t) {
        if (!byProject[t.projectId]) byProject[t.projectId] = [];
        byProject[t.projectId].push(testId);
      }
    }

    const results = await Promise.allSettled(
      Object.entries(byProject).map(([pid, testIds]) =>
        api.bulkTestAction(pid, testIds, action),
      ),
    );

    const failedCount = results.filter(r => r.status === "rejected").length;
    if (failedCount > 0) {
      // Rollback failed groups
      const failedProjects = new Set(
        Object.keys(byProject).filter((_, i) => results[i].status === "rejected"),
      );
      const failedIds = new Set(
        Object.entries(byProject)
          .filter(([pid]) => failedProjects.has(pid))
          .flatMap(([, tids]) => tids),
      );
      updateTestsCache(prev => prev.map(t =>
        failedIds.has(t.id) ? { ...t, reviewStatus: originals[t.id] } : t,
      ));
      setBulkError(`${failedCount} project group${failedCount !== 1 ? "s" : ""} failed to ${action}. Others updated.`);
      setTimeout(() => setBulkError(null), 5000);
    }

    invalidateProjectDataCache();
    setSelected(new Set());
    setActionLoading(null);
  }

  // ── Checkbox helpers ────────────────────────────────────────────────────────
  function toggleItem(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    if (selected.size === visibleTests.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleTests.map(t => t.id)));
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "a" && !e.metaKey && !e.ctrlKey && activeTest) handleApprove(activeTest);
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && activeTest) handleReject(activeTest);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (activeIdx < visibleTests.length - 1) setActiveTestId(visibleTests[activeIdx + 1].id);
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (activeIdx > 0) setActiveTestId(visibleTests[activeIdx - 1].id);
      }
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTest, activeIdx, visibleTests]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rq-page">

      {/* ── Header ── */}
      <div className="rq-header">
        <h1 className="rq-header__title">
          <ThumbsUp size={16} color="var(--accent)" />
          Review Queue
          {tabCounts.draft > 0 && (
            <span className="badge badge-amber">{tabCounts.draft} draft{tabCounts.draft !== 1 ? "s" : ""}</span>
          )}
        </h1>
        <div className="rq-header__spacer" />
        <div className="rq-header__controls">
          {/* Project filter */}
          <select
            className="input"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            style={{ height: 32, fontSize: "0.78rem", padding: "0 28px 0 10px", minWidth: 140 }}
          >
            <option value="all">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="rq-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`rq-tab ${tab === t.id ? "rq-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className={`badge ${
              t.id === "draft"    ? "badge-amber" :
              t.id === "rejected" ? "badge-red"   : "badge-green"
            }`} style={{ marginLeft: 2 }}>
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, gap: 10, color: "var(--text3)" }}>
          <Loader2 size={18} className="spin" />
          <span style={{ fontSize: "0.88rem" }}>Loading tests…</span>
        </div>
      ) : (
        <div className="rq-body">

          {/* ── Left: list pane ── */}
          <div className="rq-list-pane">

            {/* List header with sort */}
            <div className="rq-list-pane__header">
              <span className="rq-list-pane__count">
                {visibleTests.length} test{visibleTests.length !== 1 ? "s" : ""}
              </span>
              <div className="rq-sort-menu-wrap" ref={sortMenuRef}>
                <button
                  className="rq-list-pane__sort"
                  onClick={() => setShowSortMenu(v => !v)}
                >
                  {SORT_OPTIONS.find(s => s.id === sortBy)?.label} ▾
                </button>
                {showSortMenu && (
                  <div className="rq-sort-menu">
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        className={`rq-sort-menu__item ${sortBy === opt.id ? "rq-sort-menu__item--active" : ""}`}
                        onClick={() => { setSortBy(opt.id); setShowSortMenu(false); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="rq-list-search">
              <Search size={12} className="rq-list-search__icon" />
              <input
                className="rq-list-search__input"
                placeholder="Search tests…"
                value={listSearch}
                onChange={e => setListSearch(e.target.value)}
              />
              {listSearch && (
                <button
                  className="rq-list-search__clear"
                  onClick={() => setListSearch("")}
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Category chips */}
            <div className="rq-filter-chips">
              {[
                { id: "all",     label: "All" },
                { id: "web",     label: "Web" },
                { id: "api",     label: "API" },
                { id: "journey", label: "Journey" },
              ].map(c => (
                <button
                  key={c.id}
                  className={`rq-chip ${catFilter === c.id ? "rq-chip--active" : ""}`}
                  onClick={() => setCatFilter(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Select-all when items exist */}
            {visibleTests.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 12px", borderBottom: "1px solid var(--border)",
                background: "var(--bg2)", flexShrink: 0,
              }}>
                <div
                  className={`rq-item__check ${selected.size === visibleTests.length && visibleTests.length > 0 ? "rq-item__check--checked" : ""}`}
                  onClick={toggleAll}
                  style={{ cursor: "pointer" }}
                >
                  {selected.size === visibleTests.length && visibleTests.length > 0 && (
                    <CheckCircle2 size={9} color="#fff" />
                  )}
                </div>
                <span style={{ fontSize: "0.7rem", color: "var(--text3)" }}>
                  {selected.size === visibleTests.length ? "Deselect all" : "Select all"}
                </span>
              </div>
            )}

            {/* Test rows */}
            <div className="rq-list">
              {visibleTests.length === 0 ? (
                <div className="rq-empty" style={{ paddingTop: 32 }}>
                  <div className="rq-empty__icon">✓</div>
                  <div className="rq-empty__title">
                    {listSearch || catFilter !== "all" ? "No matches" : TABS.find(t2 => t2.id === tab)?.emptyLabel}
                  </div>
                  <div className="rq-empty__desc">
                    {listSearch
                      ? `No tests match "${listSearch}"`
                      : tab === "draft"
                        ? "All tests have been reviewed — great work!"
                        : "No tests in this category."}
                  </div>
                </div>
              ) : (
                visibleTests.map(t => {
                  const isActive   = t.id === activeTestId;
                  const isSelected = selected.has(t.id);
                  const proj       = projMap[t.projectId];
                  const score      = t.qualityScore;
                  const isApi      = t.generatedFrom === "api_har_capture" || t.generatedFrom === "api_user_described";

                  return (
                    <div
                      key={t.id}
                      className={`rq-item ${isActive ? "rq-item--active" : ""}`}
                      onClick={() => setActiveTestId(t.id)}
                    >
                      {/* Checkbox */}
                      <div
                        className={`rq-item__check ${isSelected ? "rq-item__check--checked" : ""}`}
                        onClick={e => { e.stopPropagation(); toggleItem(t.id); }}
                      >
                        {isSelected && <CheckCircle2 size={9} color="#fff" />}
                      </div>

                      <div className="rq-item__body">
                        <div className="rq-item__name">{cleanTestName(t.name)}</div>
                        <div className="rq-item__meta">
                          {isApi
                            ? <span className="badge badge-blue" style={{ fontSize: "0.62rem" }}>API</span>
                            : t.isJourneyTest
                              ? <span className="badge badge-amber" style={{ fontSize: "0.62rem" }}>Journey</span>
                              : <span className="badge badge-gray" style={{ fontSize: "0.62rem" }}>Web</span>}
                          {proj && (
                            <span style={{ fontSize: "0.68rem", color: "var(--text3)" }}>
                              {proj.name}
                            </span>
                          )}
                          <span style={{ fontSize: "0.68rem", color: "var(--text3)" }}>
                            · {(t.steps ?? []).length} steps
                          </span>
                          {score != null && (
                            <span className={`rq-item__score ${qualityClass(score)}`}>
                              Q:{score}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="rq-bulk-bar">
                <span className="rq-bulk-bar__label">
                  {selected.size} selected
                </span>
                <button
                  className="btn-approve"
                  disabled={!!actionLoading}
                  onClick={() => handleBulkAction("approve")}
                >
                  {actionLoading === "bulk-approve"
                    ? <Loader2 size={11} className="spin" />
                    : <ThumbsUp size={11} />}
                  Approve {selected.size}
                </button>
                <button
                  className="btn-reject"
                  disabled={!!actionLoading}
                  onClick={() => handleBulkAction("reject")}
                >
                  {actionLoading === "bulk-reject"
                    ? <Loader2 size={11} className="spin" />
                    : <ThumbsDown size={11} />}
                  Reject {selected.size}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </button>
                <span className="rq-bulk-bar__progress">
                  {activeIdx + 1} / {visibleTests.length}
                </span>
              </div>
            )}

            {/* Bulk error feedback */}
            {bulkError && (
              <div style={{
                padding: "8px 12px", background: "var(--amber-bg)",
                borderTop: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 6,
                fontSize: "0.75rem", color: "var(--amber)", flexShrink: 0,
              }}>
                <AlertCircle size={12} />
                <span style={{ flex: 1 }}>{bulkError}</span>
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--amber)" }}
                  onClick={() => setBulkError(null)}
                >
                  <X size={11} />
                </button>
              </div>
            )}
          </div>

          {/* ── Right: detail pane ── */}
          <div className="rq-detail-pane">
            {!activeTest ? (
              <div className="rq-empty">
                <div className="rq-empty__icon">☑</div>
                <div className="rq-empty__title">Select a test to review</div>
                <div className="rq-empty__desc">
                  Click any test in the list to preview its steps and generated code.
                </div>
              </div>
            ) : (
              <>
                {/* Detail header */}
                <div className="rq-detail-pane__header">
                  <div className="rq-detail-pane__title">
                    {cleanTestName(activeTest.name)}
                  </div>
                  <div className="rq-detail-pane__actions">
                    {tab !== "approved" && (
                      <button
                        className="btn-approve"
                        onClick={() => handleApprove(activeTest)}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === `approve-${activeTest.id}`
                          ? <Loader2 size={12} className="spin" />
                          : <CheckCircle2 size={12} />}
                        Approve
                      </button>
                    )}
                    {tab !== "rejected" && (
                      <button
                        className="btn-reject"
                        onClick={() => handleReject(activeTest)}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === `reject-${activeTest.id}`
                          ? <Loader2 size={12} className="spin" />
                          : <XCircle size={12} />}
                        Reject
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/tests/${activeTest.id}`)}
                      title="Open in Test Detail"
                    >
                      <ExternalLink size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/tests/${activeTest.id}`, { state: { editOnOpen: true } })}
                      title="Edit test"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Inner split: main + sidebar */}
                <div className="rq-detail-inner">
                  {/* Main: description + steps + code */}
                  <div className="rq-detail-main">

                    {/* Description */}
                    {activeTest.description && (
                      <div>
                        <div className="rq-section-label">Description</div>
                        <p style={{ fontSize: "0.85rem", color: "var(--text2)", lineHeight: 1.65, margin: 0 }}>
                          {activeTest.description}
                        </p>
                      </div>
                    )}

                    {/* Steps */}
                    {(activeTest.steps ?? []).length > 0 && (
                      <div>
                        <div className="rq-section-label">
                          Steps ({(activeTest.steps ?? []).length})
                        </div>
                        <div className="rq-steps">
                          {(activeTest.steps ?? []).map((step, i) => (
                            <div key={i} className="rq-step-row">
                              <div className="rq-step-num">{i + 1}</div>
                              <div className="rq-step-text">{step}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generated code */}
                    {activeTest.playwrightCode && (
                      <div>
                        <div className="rq-section-label">Generated code</div>
                        <CodeView code={activeTest.playwrightCode} />
                      </div>
                    )}

                    {/* Empty steps state */}
                    {!activeTest.playwrightCode && (activeTest.steps ?? []).length === 0 && (
                      <div style={{
                        padding: "32px 0", textAlign: "center",
                        color: "var(--text3)", fontSize: "0.85rem",
                      }}>
                        No steps or code available for this test.
                      </div>
                    )}
                  </div>

                  {/* Sidebar */}
                  <DetailSidebar
                    test={activeTest}
                    project={activeProject}
                    tab={tab}
                    listIdx={activeIdx}
                    listLen={visibleTests.length}
                    actionLoading={actionLoading}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onPrev={() => activeIdx > 0 && setActiveTestId(visibleTests[activeIdx - 1].id)}
                    onNext={() => activeIdx < visibleTests.length - 1 && setActiveTestId(visibleTests[activeIdx + 1].id)}
                    navigate={navigate}
                  />
                </div>

                {/* Keyboard hint */}
                <div className="rq-kbd-hints">
                  {[
                    ["a", "approve"],
                    ["r", "reject"],
                    ["j / ↓", "next"],
                    ["k / ↑", "prev"],
                  ].map(([key, label]) => (
                    <span key={key} className="rq-kbd-hints__group">
                      <kbd>{key}</kbd>
                      {" "}{label}
                    </span>
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
