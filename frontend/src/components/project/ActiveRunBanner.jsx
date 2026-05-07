/**
 * @module components/project/ActiveRunBanner
 * @description Inline banner shown on Project Detail while a run is active.
 * Displays live transport mode (SSE/polling fallback) and run actions.
 */

import React from "react";
import { ArrowRight, RefreshCw, StopCircle } from "lucide-react";

/**
 * @param {Object} props
 * @param {string|null} props.activeRun
 * @param {boolean} props.sseDown
 * @param {number|null} props.retryIn
 * @param {{changedPages: string[], removedPages: string[], unchangedPages: string[]}|null} [props.pagesChanged]
 *   AUTO-002: diff-aware crawl summary emitted once per run via the
 *   `pages_changed` SSE event. When present, replaces the generic
 *   "Run in progress…" status line with a concrete scope readout so
 *   reviewers see "3 pages changed → regenerating only those" instead
 *   of an opaque spinner.
 * @param {Function} props.onAbort
 * @param {Function} props.onViewLive
 * @returns {React.ReactElement|null}
 */
export default function ActiveRunBanner({ activeRun, sseDown, retryIn, pagesChanged, onAbort, onViewLive }) {
  if (!activeRun) return null;

  const changed = pagesChanged?.changedPages?.length ?? 0;
  const removed = pagesChanged?.removedPages?.length ?? 0;
  const unchanged = pagesChanged?.unchangedPages?.length ?? 0;
  const hasDiff = pagesChanged != null;
  const noChanges = hasDiff && changed === 0 && removed === 0;

  return (
    <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--blue-bg)", border: "1px solid #bfdbfe", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={14} color="var(--blue)" className="spin" />
          <span style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--blue)" }}>
            {hasDiff
              ? noChanges
                ? "No page changes since last crawl — skipping generation"
                : `${changed} page${changed !== 1 ? "s" : ""} changed → regenerating only those`
              : "Run in progress…"}
          </span>
        </div>
        <div style={{ fontSize: "0.74rem", color: "var(--text3)", marginTop: 4 }}>
          {hasDiff ? (
            <>
              {changed} changed · {removed} removed · {unchanged} unchanged
              {" · "}
              {sseDown ? `polling${retryIn ? ` (SSE retry in ${retryIn}s)` : ""}` : "live via SSE"}
            </>
          ) : (
            sseDown ? `Live updates via polling${retryIn ? ` (SSE retry in ${retryIn}s)` : ""}` : "Live updates via SSE"
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="btn btn-xs"
          style={{ background: "var(--red-bg)", color: "var(--red)", border: "1px solid #fca5a5" }}
          onClick={onAbort}
        >
          <StopCircle size={11} /> Stop
        </button>
        <button className="btn btn-ghost btn-xs" onClick={onViewLive}>
          View live <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
