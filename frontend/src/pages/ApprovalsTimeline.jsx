import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, User, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationContext.jsx";
import { fmtRelativeTimeFull } from "../utils/formatters.js";
import "../styles/pages/approvals-timeline.css";

/**
 * AUTO-003b: ApprovalsTimeline — daily-grouped audit feed of approvals.
 *
 * Each day splits into per-actor batches:
 *   🤖 12 auto-approved (avg score 0.89)
 *   👤 @alice approved 3
 *
 * Expanding a batch reveals constituent tests with decision-time confidence
 * + threshold (read from `activity.meta`, persisted as JSON by migration 018).
 * Auto-approval rows expose a per-test "Revoke" button that calls
 * `api.revokeApproval(testId)`; the backend route handles ACL + clears the
 * provenance columns.
 *
 * The activity log is the source of truth here rather than `tests` rows
 * because revoked tests have their provenance cleared, but the audit
 * trail for that historical decision should remain visible.
 */
export default function ApprovalsTimeline() {
  const [autoRows, setAutoRows] = useState([]);
  const [humanRows, setHumanRows] = useState([]);
  // `test.revoke` activity rows — the persistent source of truth for which
  // tests have been revoked. Survives page reload (unlike the previous
  // optimistic `revokedTestIds` Set, which only tracked clicks in the
  // current session). Each row carries `userName`, `createdAt`, `testId`,
  // and `meta.wasAutoApproved`, so the UI can render
  // "revoked by @alice · 3h ago" persistently.
  const [revokeRows, setRevokeRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const { addNotification } = useNotifications();
  const { user } = useAuth();

  // URL-driven project filter — mirrors the ReviewQueue pattern so a
  // deep-link like `/approvals?projectId=PRJ-1` lands in the same scoped
  // view, and changing the dropdown updates the URL (`replace: true` so
  // the browser's back-button isn't polluted with every selection).
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || "all";
  const setProjectId = (v) => setSearchParams((p) => {
    const n = new URLSearchParams(p);
    if (v === "all") n.delete("projectId"); else n.set("projectId", v);
    return n;
  }, { replace: true });

  // Date-range filter — `week` / `30d` / `all`. Default `30d` covers the
  // common "what shipped this month?" audit while keeping the row count
  // bounded for typical workspaces. The compliance contract ("who
  // approved this test six months later?") is now satisfied by switching
  // to `all` + Load more, rather than requiring a 200-row scan.
  const range = searchParams.get("range") || "30d";
  const setRange = (v) => setSearchParams((p) => {
    const n = new URLSearchParams(p);
    if (v === "30d") n.delete("range"); else n.set("range", v);
    return n;
  }, { replace: true });

  // Compute the `after` ISO bound from the active range. `null` means
  // "no lower bound" — the backend then returns the most-recent N rows
  // regardless of age. Recomputed once per `range` change.
  const afterIso = useMemo(() => {
    const now = Date.now();
    if (range === "week") return new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    if (range === "30d")  return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    return null; // "all" — no time bound
  }, [range]);

  // Page-size for the activity feeds. Each "Load more" click bumps this
  // by `PAGE_SIZE`; the same value is passed as `limit` to all three
  // `getActivities` calls so the Auto / Human / Revoke streams stay in
  // step. Server caps `limit` at 1000 (`backend/src/routes/system.js`),
  // so the user can expand up to 5 pages before hitting that ceiling.
  // 1000 covers ~140 auto-approvals/day for a week, or ~33/day for a
  // month — sufficient for any realistic single-project audit window.
  const PAGE_SIZE = 200;
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // Reset back to one page whenever the filters change, otherwise a user
  // narrowing the date range while on page 4 would leave the cursor
  // pointing past the new (smaller) result set.
  useEffect(() => { setPageSize(PAGE_SIZE); }, [projectId, range]);

  // Project list is loaded once on mount (independent of the activity
  // fetches below, which re-run when `projectId` changes). Pulling it
  // here separately keeps the dropdown options stable while filters
  // re-fetch the per-project event slices.
  useEffect(() => {
    let cancelled = false;
    api.getProjects()
      .then((projs) => { if (!cancelled) setProjects(Array.isArray(projs) ? projs : []); })
      .catch(() => { /* non-fatal — dropdown shows only "All projects" */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Pass `projectId` to the backend filter when one is selected so the
    // timeline reads as a per-project compliance view (NEXT.md AUTO-003b
    // calls out "who approved this test?" as a per-project audit need).
    // The server cap then applies *within* that project rather than
    // across the workspace, so a busy single project no longer crowds
    // out a quieter one in the workspace-wide view.
    const filter = projectId === "all" ? undefined : projectId;
    // `after` narrows the row count to the active date range so the
    // server doesn't return rows outside the user's audit window. When
    // range === "all", `afterIso` is null and we omit the param.
    const after = afterIso || undefined;
    Promise.all([
      // Activity-type literals follow the imperative `test.<verb>` convention
      // shared by every `test.*` event in `backend/src/routes/tests.js` and
      // `backend/src/pipeline/testPersistence.js` (create/approve/reject/
      // restore/delete/generate/auto_approve/revoke). Don't add the past-tense
      // `-d` suffix — readers and writers must stay in lockstep.
      api.getActivities({ type: "test.auto_approve", projectId: filter, after, limit: pageSize }),
      api.getActivities({ type: "test.approve",      projectId: filter, after, limit: pageSize }),
      api.getActivities({ type: "test.revoke",       projectId: filter, after, limit: pageSize }),
    ])
      .then(([auto, human, revokes]) => {
        if (cancelled) return;
        setAutoRows(Array.isArray(auto) ? auto : []);
        setHumanRows(Array.isArray(human) ? human : []);
        setRevokeRows(Array.isArray(revokes) ? revokes : []);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || "Failed to load approvals timeline."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, afterIso, pageSize]);

  // Map testId → most-recent revoke activity row. A test that's been
  // re-approved and re-revoked carries multiple revoke rows; the latest
  // by `createdAt` is the one whose actor + timestamp the UI renders.
  // Built once per `revokeRows` change so individual row renders stay O(1).
  const revokeByTestId = useMemo(() => {
    const map = new Map();
    for (const r of revokeRows) {
      if (!r?.testId) continue;
      const existing = map.get(r.testId);
      if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
        map.set(r.testId, r);
      }
    }
    return map;
  }, [revokeRows]);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id) => map.get(id) || id || "—";
  }, [projects]);

  // Group rows by YYYY-MM-DD (local time), then within a day split into
  // one auto bucket plus one human bucket per userName. Newest day first;
  // within a day, auto first, then humans alpha.
  const days = useMemo(() => {
    const byDay = new Map();
    const dayKey = (iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    for (const row of autoRows) {
      const k = dayKey(row.createdAt);
      if (!byDay.has(k)) byDay.set(k, { auto: [], human: new Map() });
      byDay.get(k).auto.push(row);
    }
    for (const row of humanRows) {
      const k = dayKey(row.createdAt);
      if (!byDay.has(k)) byDay.set(k, { auto: [], human: new Map() });
      const who = row.userName || "unknown";
      const bucket = byDay.get(k).human;
      if (!bucket.has(who)) bucket.set(who, []);
      bucket.get(who).push(row);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([day, { auto, human }]) => ({
        day,
        batches: [
          ...(auto.length ? [{ id: `${day}::auto`, kind: "auto", rows: auto }] : []),
          ...[...human.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([who, rows]) => ({ id: `${day}::human::${who}`, kind: "human", who, rows })),
        ],
      }));
  }, [autoRows, humanRows]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleRevoke = async (testId, sourceRow) => {
    try {
      await api.revokeApproval(testId);
      // Optimistic insert — backend has already written the real `test.revoke`
      // activity row, so this synthetic row is immediately replaced on the
      // next page load by the persisted record. The shape mirrors what
      // `GET /activities` returns (see `backend/src/database/repositories/
      // activityRepo.js`) so `revokeByTestId` and the renderer don't need
      // to special-case it.
      const synthetic = {
        id: `local-revoke-${testId}-${Date.now()}`,
        type: "test.revoke",
        testId,
        testName: sourceRow?.testName || null,
        projectId: sourceRow?.projectId || null,
        userName: user?.name || user?.email || null,
        createdAt: new Date().toISOString(),
        meta: { wasAutoApproved: sourceRow?.type === "test.auto_approve" },
      };
      setRevokeRows((prev) => [synthetic, ...prev]);
      addNotification({ title: "Approval revoked", body: "Test returned to draft." });
    } catch (err) {
      addNotification({ title: "Revoke failed", body: err?.message || "Failed to revoke approval." });
    }
  };

  if (loading) return <div className="at-loading">Loading approvals…</div>;
  if (error) return <div className="at-error">{error}</div>;

  return (
    <div className="at-page">
      <header className="at-header">
        <div className="at-header__row">
          <h1 className="at-header__title">Approvals timeline</h1>
          {/* Per-project filter — mirrors the ReviewQueue dropdown so the
              compliance view ("who approved this test?") can scope to a
              single project. Hidden when there's only one project so the
              dropdown isn't dead UI on small workspaces. */}
          {projects.length > 1 && (
            <select
              className="input at-header__project-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Filter by project"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {/* Date-range picker — bounds the server query to the audit
              window the user actually cares about, so the 200-row page
              isn't burned on stale rows the user doesn't need. */}
          <select
            className="input at-header__range-select"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-label="Filter by date range"
          >
            <option value="week">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <p className="at-header__desc">
          Daily audit trail of auto- and human-approved tests. Expand a batch
          to see per-test confidence, threshold-at-time, and revoke options.
        </p>
      </header>

      {/* Truncation banner — only shown when the server returned a full
          page on at least one feed AND we're already at the server's
          1000-row hard cap. Below the cap, the "Load more" footer below
          handles the affordance, so this banner doesn't need to repeat
          it. Capping at 1000 (matching `backend/src/routes/system.js`)
          tells the user they've hit the ceiling and need to narrow the
          range further (e.g. switch from "All time" to a 30-day window). */}
      {pageSize >= 1000 && (autoRows.length >= 1000 || humanRows.length >= 1000) && (
        <div className="at-truncated-banner">
          Showing the most recent 1000 approvals per stream. Narrow the date range to see older entries.
        </div>
      )}

      {days.length === 0 && (
        <div className="at-empty">
          No approvals yet. Approvals will appear here as tests are reviewed.
        </div>
      )}

      {days.map(({ day, batches }) => (
        <section key={day} className="at-day">
          <h2 className="at-day__heading">
            {new Date(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </h2>
          <div className="at-day__batches">
            {batches.map((batch) => {
              const isOpen = expanded.has(batch.id);
              const Icon = batch.kind === "auto" ? Bot : User;
              const headline = batch.kind === "auto"
                ? `${batch.rows.length} auto-approved (avg score ${avgScore(batch.rows)})`
                : `@${batch.who} approved ${batch.rows.length}`;
              return (
                <div key={batch.id} className="at-batch">
                  <button
                    className="at-batch__toggle"
                    onClick={() => toggle(batch.id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Icon
                      size={14}
                      className={batch.kind === "auto" ? "at-batch__icon--auto" : "at-batch__icon--human"}
                    />
                    <span>{headline}</span>
                  </button>
                  {isOpen && (
                    <ul className="at-rows">
                      {batch.rows.map((row) => (
                        <li key={row.id} className="at-row">
                          <Link
                            to={row.testId ? `/tests/${row.testId}` : "#"}
                            className="at-row__name"
                          >
                            {row.testName || row.testId || "(unnamed test)"}
                          </Link>
                          <span className="at-row__sep">·</span>
                          <span className="at-row__project">{projectName(row.projectId)}</span>
                          {batch.kind === "auto" && (
                            <>
                              <span className="at-row__sep">·</span>
                              <span className="at-row__score">
                                score {fmtNum(row.meta?.score)} / threshold {fmtNum(row.meta?.threshold)}
                              </span>
                            </>
                          )}
                          <span className="at-row__time">
                            {new Date(row.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {/* Revoke is available for both auto- and human-approved
                              tests — `POST /api/v1/tests/:id/revoke` (qa_lead+)
                              clears the provenance columns regardless of source.
                              Gating this on `batch.kind === "auto"` would force
                              a reviewer who approved a test by mistake to navigate
                              to TestDetail just to undo it; the Approvals page
                              exists to shortcut exactly that flow.

                              Revocation state is read from the persisted
                              `test.revoke` activity rows (`revokeByTestId`)
                              rather than session state, so the
                              "revoked by @alice · 3h ago" note survives
                              page reload. The revoke is only counted when
                              the activity row's `createdAt` is *after* this
                              approval row's — otherwise an approval that
                              happened *after* an earlier revoke would render
                              as already-revoked, which is the wrong story. */}
                          {(() => {
                            if (!row.testId) return null;
                            const revoked = revokeByTestId.get(row.testId);
                            const isRevokedAfter = revoked
                              && new Date(revoked.createdAt) > new Date(row.createdAt);
                            if (isRevokedAfter) {
                              return (
                                <span className="at-row__revoked">
                                  revoked
                                  {revoked.userName ? <> by @{revoked.userName}</> : null}
                                  {revoked.createdAt ? <> · {fmtRelativeTimeFull(revoked.createdAt)}</> : null}
                                </span>
                              );
                            }
                            return (
                              <button
                                className="btn btn-ghost btn-sm at-row__revoke"
                                onClick={() => handleRevoke(row.testId, row)}
                                title={batch.kind === "auto"
                                  ? "Revoke this auto-approval — returns the test to draft"
                                  : "Revoke this approval — returns the test to draft"}
                              >
                                <RotateCcw size={12} /> Revoke
                              </button>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Load more — bumps the per-feed `limit` by `PAGE_SIZE` so the
          next render fetches a wider window. `hasMore` is conservative:
          true when at least one feed returned a full page (more rows
          likely exist server-side). A false positive (the feed had
          exactly `pageSize` matching rows and no more) is harmless —
          the next click returns no new rows and the button hides on
          the render after that. Capped at the server's 1000-row hard
          limit (`backend/src/routes/system.js`). */}
      {days.length > 0 && pageSize < 1000 && (
        autoRows.length >= pageSize
        || humanRows.length >= pageSize
        || revokeRows.length >= pageSize
      ) && (
        <div className="at-load-more">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPageSize((n) => Math.min(1000, n + PAGE_SIZE))}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
          <span className="at-load-more__hint">
            Showing up to {pageSize} per stream
          </span>
        </div>
      )}
    </div>
  );
}

/** Average of `meta.score` across rows, formatted to 2dp. Falls back to "—". */
function avgScore(rows) {
  const scores = rows.map((r) => r?.meta?.score).filter((n) => Number.isFinite(n));
  if (!scores.length) return "—";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg.toFixed(2);
}

/** 2dp number formatter that's null-safe — used for both score and threshold. */
function fmtNum(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "?";
}
