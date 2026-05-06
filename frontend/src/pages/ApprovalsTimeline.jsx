import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, User, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { api } from "../api.js";
import { useNotifications } from "../context/NotificationContext.jsx";
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
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [revokedTestIds, setRevokedTestIds] = useState(() => new Set());
  const { addNotification } = useNotifications();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getActivities({ type: "test.auto_approved", limit: 200 }),
      // Human-approval handler in `backend/src/routes/tests.js:629` emits
      // the activity type `test.approve` (singular, no -d) — matching the
      // existing `test.reject` / `test.create` naming convention. Don't
      // change to `test.approved` without also migrating the writer.
      api.getActivities({ type: "test.approve", limit: 200 }),
      api.getProjects(),
    ])
      .then(([auto, human, projs]) => {
        if (cancelled) return;
        setAutoRows(Array.isArray(auto) ? auto : []);
        setHumanRows(Array.isArray(human) ? human : []);
        setProjects(Array.isArray(projs) ? projs : []);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || "Failed to load approvals timeline."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  const handleRevoke = async (testId) => {
    try {
      await api.revokeApproval(testId);
      setRevokedTestIds((prev) => new Set(prev).add(testId));
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
        <h1 className="at-header__title">Approvals timeline</h1>
        <p className="at-header__desc">
          Daily audit trail of auto- and human-approved tests. Expand a batch
          to see per-test confidence, threshold-at-time, and revoke options.
        </p>
      </header>

      {(autoRows.length >= 200 || humanRows.length >= 200) && (
        <div className="at-truncated-banner">
          Showing the most recent 200 approvals. Older entries aren't displayed yet.
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
                              exists to shortcut exactly that flow. */}
                          {row.testId && !revokedTestIds.has(row.testId) && (
                            <button
                              className="btn btn-ghost btn-sm at-row__revoke"
                              onClick={() => handleRevoke(row.testId)}
                              title={batch.kind === "auto"
                                ? "Revoke this auto-approval — returns the test to draft"
                                : "Revoke this approval — returns the test to draft"}
                            >
                              <RotateCcw size={12} /> Revoke
                            </button>
                          )}
                          {revokedTestIds.has(row.testId) && (
                            <span className="at-row__revoked">revoked</span>
                          )}
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
