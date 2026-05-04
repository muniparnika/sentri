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
  useState, useMemo, useEffect, useRef,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, XCircle, ArrowLeft,
  Search, X, Loader2, ExternalLink, Copy,
  ThumbsUp, ThumbsDown, AlertCircle, Trash2,
} from "lucide-react";
import { api } from "../api.js";
import useProjectData, { invalidateProjectDataCache } from "../hooks/useProjectData.js";
import useReviewQueueQuery, { invalidateReviewQueueCache } from "../hooks/queries/useReviewQueueQuery.js";
import usePageTitle from "../hooks/usePageTitle.js";
import { useAuth } from "../context/AuthContext.jsx";
import { userHasRole } from "../utils/roles.js";
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
function qualityColor(score) {
  if (score == null) return "var(--text3)";
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

// ── Quality score explainer popover ──────────────────────────────────────────
// "Why was this drafted?" — surfaces the factor breakdown that produced
// `qualityScore` (e.g. `+20 URL assertion`, `-30 No assertions`) so reviewers
// don't have to read the test code to grade it. Backed by the `qualityScoreFactors`
// JSON column populated by `scoreTestWithFactors()` in the pipeline.
function QualityScoreChip({ score, factors }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (score == null) return null;
  const hasFactors = Array.isArray(factors) && factors.length > 0;

  return (
    <div className="rq-quality-chip-wrap" ref={wrapRef}>
      <button
        className="rq-quality-chip"
        onClick={() => hasFactors && setOpen(v => !v)}
        disabled={!hasFactors}
        title={hasFactors ? "Why this score?" : "No factor breakdown available"}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ color: qualityColor(score) }}
      >
        Q:{score}{hasFactors ? " ▾" : ""}
      </button>
      {open && hasFactors && (
        <div className="rq-quality-popover" role="dialog" aria-label="Quality score breakdown">
          <div className="rq-quality-popover__header">
            Quality {score} / 100
          </div>
          <ul className="rq-quality-popover__list">
            {factors.map(f => (
              <li key={f.id} className={`rq-quality-popover__item rq-quality-popover__item--${f.kind}`}>
                <span className="rq-quality-popover__icon" aria-hidden="true">
                  {f.kind === "reward" ? "✓" : "✗"}
                </span>
                <span className="rq-quality-popover__label">{f.label}</span>
                <span className="rq-quality-popover__delta">
                  {f.delta > 0 ? `+${f.delta}` : f.delta} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
          className="btn btn-ghost btn-xs rq-code-toolbar__copy"
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
          <div className="rq-quality-row rq-quality-row--flush">
            <span className="rq-quality-score" style={{ color: qualityColor(score) }}>
              {score}
            </span>
            <div
              className="rq-quality-bar"
              role="progressbar"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Quality score"
            >
              <div
                className="rq-quality-fill"
                style={{ width: `${score}%`, background: qualityColor(score) }}
              />
            </div>
          </div>
          {/* Click-to-expand factor breakdown — same component used in the
              list pane so reviewers can audit the score without leaving the
              detail view. */}
          <div className="rq-quality-explain">
            <QualityScoreChip score={score} factors={test.qualityScoreFactors} />
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
        <div className="rq-info-val rq-info-val--sm">
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
            className="rq-source-url"
          >
            {test.sourceUrl.replace(/^https?:\/\/[^/]+/, "") || "/"}
            <ExternalLink size={9} className="rq-source-url__icon" />
          </a>
        </div>
      )}

      <hr className="rq-sidebar-divider" />

      {/* Quick decision buttons */}
      <div className="rq-info-label rq-info-label--gap">Quick decision</div>
      <div className="rq-decision-btns">
        {tab !== "approved" && (
          <button
            className="btn-approve btn-block"
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
            className="btn-reject btn-block"
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
            className="btn-approve btn-block"
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
          className="btn btn-ghost btn-sm btn-block btn-block--gap"
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
// Tests created within this window are highlighted with a "NEW" badge.
// Mirrors the threshold previously used by `ProjectDetail.jsx`.
const NEW_TEST_THRESHOLD_MS = 5 * 60 * 1000;

export default function ReviewQueue() {
  usePageTitle("Review Queue");
  const navigate   = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser } = useAuth();
  const canEdit = userHasRole(authUser, "qa_lead");

  // Projects list only — tests now flow through the server-paginated
  // `useReviewQueueQuery` hook, so we no longer fetch every test in the
  // workspace just to render this page.
  const { projects, loading: projectsLoading } = useProjectData({ fetchTests: false, fetchRuns: false });

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
  const [page,          setPage]          = useState(1);
  const PAGE_SIZE = 50;
  const sortMenuRef = useRef(null);

  // Reset to page 1 whenever the filter set changes — otherwise a "page 4"
  // cursor on the Draft tab would still apply when the user switches to
  // Approved (which may have <4 pages of items).
  useEffect(() => { setPage(1); }, [tab, projectId, listSearch, catFilter]);

  // ── Server-paginated tests for the current view ─────────────────────────────
  const reviewQuery = useReviewQueueQuery({
    tab, projectId, search: listSearch, category: catFilter, page, pageSize: PAGE_SIZE,
  });
  const pageTests = reviewQuery.data;
  const meta      = reviewQuery.meta;

  // Tab counts — three lightweight queries that ask the backend for `total`
  // only (pageSize: 1) per status. Keeps the badges accurate without
  // re-fetching the whole list.
  const draftCount    = useReviewQueueQuery({ tab: "draft",    projectId, search: listSearch, category: catFilter, page: 1, pageSize: 1 }).meta.total;
  const rejectedCount = useReviewQueueQuery({ tab: "rejected", projectId, search: listSearch, category: catFilter, page: 1, pageSize: 1 }).meta.total;
  const approvedCount = useReviewQueueQuery({ tab: "approved", projectId, search: listSearch, category: catFilter, page: 1, pageSize: 1 }).meta.total;
  const tabCounts = { draft: draftCount, rejected: rejectedCount, approved: approvedCount };

  const loading = projectsLoading || reviewQuery.isLoading;

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

  // ── "NEW" badge for recently-created tests ──────────────────────────────────
  // `now` ticks every 60s so the badge auto-expires without requiring a manual
  // refresh. Mirrors the tick cadence used by `ProjectDetail.jsx`.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const newTestIds = useMemo(() => {
    const cutoff = now - NEW_TEST_THRESHOLD_MS;
    const ids = new Set();
    for (const t of pageTests) {
      if (t.createdAt && new Date(t.createdAt).getTime() > cutoff) ids.add(t.id);
    }
    return ids;
  }, [pageTests, now]);

  // ── Page-local filter + sort ─────────────────────────────────────────────────
  // Server already filtered by tab, projectId, search, and api/web category.
  // Only `journey` (no backend column) is applied here, plus all sorts —
  // sorting is intentionally page-local so the user can re-order what they
  // currently see without paying a round-trip. Tab/project/search filter
  // changes reset the page to 1, so this never spans pages by accident.
  const visibleTests = useMemo(() => {
    let list = pageTests;

    if (catFilter === "journey") {
      list = list.filter(t => t.isJourneyTest);
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "oldest")  return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === "quality") return (b.qualityScore ?? -1) - (a.qualityScore ?? -1);
      if (sortBy === "project") return (projMap[a.projectId]?.name ?? "").localeCompare(projMap[b.projectId]?.name ?? "");
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;
  }, [pageTests, catFilter, sortBy, projMap]);

  const totalPages = Math.max(1, Math.ceil(meta.total / PAGE_SIZE));

  // Auto-select first item when list changes and nothing is selected
  useEffect(() => {
    if (!activeTestId && visibleTests.length > 0) {
      setActiveTestId(visibleTests[0].id);
    } else if (activeTestId && !visibleTests.find(t => t.id === activeTestId)) {
      // Active test left the list (e.g. was approved while on draft tab).
      // The handleApprove/handleReject callbacks already attempt to advance to
      // the next item before the cache update lands; this is the fallback when
      // those callbacks aren't responsible for the disappearance (filter
      // change, refetch from another tab, etc.). Reset to the first item.
      setActiveTestId(visibleTests[0]?.id ?? null);
    }
  }, [visibleTests, activeTestId]);

  // Clear selection when tab changes
  useEffect(() => { setSelected(new Set()); }, [tab]);

  const activeTest    = useMemo(() => visibleTests.find(t => t.id === activeTestId) ?? null, [visibleTests, activeTestId]);
  const activeProject = activeTest ? projMap[activeTest.projectId] : null;
  const activeIdx     = useMemo(() => visibleTests.findIndex(t => t.id === activeTestId), [visibleTests, activeTestId]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  // With server-side pagination, optimistic edits to the page array would be
  // invalidated by the next refetch anyway — and they couldn't keep tab counts
  // honest since those are separate queries. We instead invalidate the
  // review-queue cache on settle and let the next render show the truth.
  async function handleApprove(test) {
    setActionLoading(`approve-${test.id}`);
    try {
      await api.approveTest(test.projectId, test.id);
      // Advance to next item on the current page before refetch lands.
      const next = visibleTests.find((t, i) => i > activeIdx && t.id !== test.id);
      setActiveTestId(next?.id ?? null);
      invalidateReviewQueueCache();
      invalidateProjectDataCache();
    } catch (err) {
      console.error("Approve failed:", err);
      setBulkError(`Approve failed: ${err.message}`);
      setTimeout(() => setBulkError(null), 5000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(test) {
    setActionLoading(`reject-${test.id}`);
    try {
      await api.rejectTest(test.projectId, test.id);
      const next = visibleTests.find((t, i) => i > activeIdx && t.id !== test.id);
      setActiveTestId(next?.id ?? null);
      invalidateReviewQueueCache();
      invalidateProjectDataCache();
    } catch (err) {
      console.error("Reject failed:", err);
      setBulkError(`Reject failed: ${err.message}`);
      setTimeout(() => setBulkError(null), 5000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(test) {
    // Per AGENT.md, destructive actions need confirmation. Soft-delete only —
    // tests land in the recycle bin and are recoverable from Settings.
    if (!window.confirm(`Delete "${cleanTestName(test.name)}"? It will move to the recycle bin.`)) return;
    setActionLoading(`delete-${test.id}`);
    try {
      await api.deleteTest(test.projectId, test.id);
      // Advance to next item, same pattern as approve/reject.
      const next = visibleTests.find((t, i) => i > activeIdx && t.id !== test.id);
      setActiveTestId(next?.id ?? null);
      invalidateReviewQueueCache();
      invalidateProjectDataCache();
    } catch (err) {
      console.error("Delete failed:", err);
      setBulkError(`Delete failed: ${err.message}`);
      setTimeout(() => setBulkError(null), 5000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBulkAction(action) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkError(null);
    setActionLoading(`bulk-${action}`);

    // Group by project from the *current page* — selection only ever spans
    // tests that are visible, so we don't need a global test list.
    const byProject = {};
    for (const testId of ids) {
      const t = pageTests.find(x => x.id === testId);
      if (t) {
        if (!byProject[t.projectId]) byProject[t.projectId] = [];
        byProject[t.projectId].push(testId);
      }
    }

    const results = await Promise.allSettled(
      Object.entries(byProject).map(([pid, testIds]) =>
        api.bulkUpdateTests(pid, testIds, action),
      ),
    );

    const failedCount = results.filter(r => r.status === "rejected").length;
    if (failedCount > 0) {
      setBulkError(`${failedCount} project group${failedCount !== 1 ? "s" : ""} failed to ${action}. Others updated.`);
      setTimeout(() => setBulkError(null), 5000);
    }

    invalidateReviewQueueCache();
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
  // The handler reads `handleApprove` / `handleReject` via refs so the closure
  // always sees the latest functions without forcing every render to re-bind
  // the global `keydown` listener. The `actionLoading` guard prevents rapid
  // `a`/`r` keypresses from firing concurrent requests for the same test.
  const handleApproveRef = useRef(handleApprove);
  const handleRejectRef  = useRef(handleReject);
  handleApproveRef.current = handleApprove;
  handleRejectRef.current  = handleReject;

  useEffect(() => {
    function handler(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "a" && !e.metaKey && !e.ctrlKey && activeTest && !actionLoading) {
        handleApproveRef.current(activeTest);
      }
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && activeTest && !actionLoading) {
        handleRejectRef.current(activeTest);
      }
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
  }, [activeTest, activeIdx, visibleTests, actionLoading]);

  // ── Render ──────────────────────────────────────────────────────────────────
  // `data-mobile-view` toggles which pane is visible on narrow viewports.
  // Desktop ignores the attribute (both panes always rendered side-by-side);
  // mobile CSS reads it to show only the list ("list") or only the detail
  // ("detail"). Picking a row sets it to "detail"; the back-button in the
  // detail header sets it to "list".
  const [mobileView, setMobileView] = useState("list");
  useEffect(() => {
    if (activeTestId) setMobileView("detail");
  }, [activeTestId]);

  return (
    <div className="rq-page" data-mobile-view={mobileView}>

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
            className="input rq-header-select"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Tab bar ──
          WAI-ARIA authoring practices: tablist + tab + aria-selected +
          aria-controls. The body panes below carry matching `id` + `role="tabpanel"`
          so screen readers announce the relationship. */}
      <div className="rq-tabs" role="tablist" aria-label="Review status">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            id={`rq-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`rq-tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`rq-tab ${tab === t.id ? "rq-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className={`badge rq-tab__badge ${
              t.id === "draft"    ? "badge-amber" :
              t.id === "rejected" ? "badge-red"   : "badge-green"
            }`}>
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="rq-loading">
          <Loader2 size={18} className="spin" />
          <span className="rq-loading__text">Loading tests…</span>
        </div>
      ) : (
        <div
          className="rq-body"
          role="tabpanel"
          id={`rq-tabpanel-${tab}`}
          aria-labelledby={`rq-tab-${tab}`}
        >

          {/* ── Left: list pane ── */}
          <div className="rq-list-pane">

            {/* List header with sort */}
            <div className="rq-list-pane__header">
              <span className="rq-list-pane__count">
                {meta.total === 0
                  ? "0 tests"
                  : `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + visibleTests.length} of ${meta.total}`}
                {reviewQuery.isFetching && !reviewQuery.isLoading && " · refreshing…"}
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

            {/* Select-all when items exist — real <label> + <input> so the
                checkbox is in the tab order, screen-reader announced, and
                togglable via Space per native semantics. */}
            {visibleTests.length > 0 && (
              <label className="rq-select-all">
                <input
                  type="checkbox"
                  className="rq-item__check rq-select-all__check"
                  checked={selected.size === visibleTests.length && visibleTests.length > 0}
                  onChange={toggleAll}
                  aria-label={selected.size === visibleTests.length ? "Deselect all tests" : "Select all tests"}
                />
                <span className="rq-select-all__label">
                  {selected.size === visibleTests.length ? "Deselect all" : "Select all"}
                </span>
              </label>
            )}

            {/* Test rows */}
            <div className="rq-list">
              {visibleTests.length === 0 ? (
                <div className="rq-empty rq-empty--list">
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
                  const isNew      = newTestIds.has(t.id);
                  const proj       = projMap[t.projectId];
                  const score      = t.qualityScore;
                  const isApi      = t.generatedFrom === "api_har_capture" || t.generatedFrom === "api_user_described";

                  return (
                    <div
                      key={t.id}
                      className={`rq-item ${isActive ? "rq-item--active" : ""} ${isNew ? "rq-item--new" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isActive}
                      aria-label={`${cleanTestName(t.name)}${isActive ? ", currently selected" : ""}`}
                      onClick={() => setActiveTestId(t.id)}
                      onKeyDown={e => {
                        // Enter / Space activate the row, matching the native
                        // <button> contract that `role="button"` inherits.
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveTestId(t.id);
                        }
                      }}
                    >
                      {/* Real checkbox — in the tab order so keyboard users
                          can multi-select independently of row activation.
                          `onClick` with stopPropagation prevents a click on
                          the checkbox from also triggering the row-level
                          `setActiveTestId`. */}
                      <input
                        type="checkbox"
                        className="rq-item__check"
                        checked={isSelected}
                        onChange={() => toggleItem(t.id)}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Select ${cleanTestName(t.name)}`}
                      />

                      <div className="rq-item__body">
                        <div className="rq-item__name">
                          {cleanTestName(t.name)}
                          {isNew && <span className="rq-new-badge">NEW</span>}
                        </div>
                        <div className="rq-item__meta">
                          {isApi
                            ? <span className="badge badge-blue badge--xs">API</span>
                            : t.isJourneyTest
                              ? <span className="badge badge-amber badge--xs">Journey</span>
                              : <span className="badge badge-gray badge--xs">Web</span>}
                          {proj && (
                            <span className="rq-item__meta-text">
                              {proj.name}
                            </span>
                          )}
                          <span className="rq-item__meta-text">
                            · {(t.steps ?? []).length} steps
                          </span>
                          {score != null && (
                            <span
                              className="rq-item__score"
                              onClick={e => e.stopPropagation()}
                            >
                              <QualityScoreChip score={score} factors={t.qualityScoreFactors} />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Per-row delete (qa_lead+). Soft-deletes — the test
                          lands in the recycle bin and can be restored from
                          Settings. Stops propagation so it doesn't also
                          select the row. */}
                      {canEdit && (
                        <button
                          className="rq-item__delete"
                          onClick={e => { e.stopPropagation(); handleDelete(t); }}
                          disabled={actionLoading === `delete-${t.id}`}
                          title="Delete (move to recycle bin)"
                          aria-label={`Delete ${cleanTestName(t.name)}`}
                        >
                          {actionLoading === `delete-${t.id}`
                            ? <Loader2 size={11} className="spin" />
                            : <Trash2 size={11} />}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pager — only visible when more than one page exists. */}
            {totalPages > 1 && (
              <div className="rq-pager">
                <button
                  className="rq-pager__btn"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || reviewQuery.isFetching}
                >
                  ← Prev
                </button>
                <span className="rq-pager__pos">
                  Page {page} / {totalPages}
                </span>
                <button
                  className="rq-pager__btn"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || reviewQuery.isFetching}
                >
                  Next →
                </button>
              </div>
            )}

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
              <div className="rq-bulk-error" role="alert">
                <AlertCircle size={12} />
                <span className="rq-bulk-error__msg">{bulkError}</span>
                <button
                  className="rq-bulk-error__close"
                  onClick={() => setBulkError(null)}
                  aria-label="Dismiss error"
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
                  {/* Mobile-only back-to-list button. The `.rq-back-to-list`
                      class is `display: none` above 640px and `display: flex`
                      below, so it never shows on desktop where the list is
                      always visible. */}
                  <button
                    className="rq-back-to-list"
                    onClick={() => setMobileView("list")}
                    aria-label="Back to test list"
                    title="Back to test list"
                  >
                    <ArrowLeft size={14} />
                  </button>
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
                        <p className="rq-description">
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
                      <div className="rq-empty-inline">
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
