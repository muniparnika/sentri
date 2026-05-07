/**
 * @module components/layout/GlobalRunBanner
 * @description Workspace-wide notice rendered above `<main>` whenever a
 * crawl/generate run is executing. Gives users on Dashboard / Reports / any
 * non-Test-Lab page a persistent affordance to jump back to the live
 * pipeline view, addressing the consistency-heuristic gap where a 3-minute
 * AI run was previously invisible outside Test Lab.
 *
 * Reads from the shared TanStack Query cache via `useProjectData({ fetchTests:
 * false, fetchProjects: false })` so we don't fire any new HTTP requests —
 * the runs list is already in cache for the sidebar / dashboard / TestLab
 * Queue tab. Hidden when:
 *   - no generation run is active, or
 *   - we're already on the Test Lab page (the inline pipeline view is
 *     a strictly better surface than this banner).
 */
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Atom } from "lucide-react";
import useProjectData from "../../hooks/useProjectData.js";

const isGenerationRun = (r) =>
  (r.type === "crawl" || r.type === "generate") && r.status === "running";

export default function GlobalRunBanner() {
  const { pathname } = useLocation();
  // Skip while the user is on Test Lab — the in-page pipeline view supersedes
  // this strip there. The check is permissive: matches both `/test-lab` and
  // `/projects/:id/test-lab`.
  const onTestLab = pathname === "/test-lab" || pathname.endsWith("/test-lab");

  // Only need runs; skip tests + projects to keep this lightweight. The
  // shared cache means this hook does not trigger new requests when other
  // pages are also reading runs.
  const { allRuns } = useProjectData({ fetchTests: false, fetchProjects: false });
  const activeRuns = (allRuns || []).filter(isGenerationRun);

  if (onTestLab || activeRuns.length === 0) return null;

  // Single-run case: deep-link straight to that run's project test-lab.
  // Multi-run case: link to /test-lab queue tab so the user picks.
  const target = activeRuns.length === 1 && activeRuns[0].projectId
    ? `/projects/${activeRuns[0].projectId}/test-lab`
    : "/test-lab?tab=queue";

  const label = activeRuns.length === 1
    ? "AI generation run in progress"
    : `${activeRuns.length} AI generation runs in progress`;

  return (
    <div className="global-run-banner">
      <Atom size={14} className="global-run-banner__icon" aria-hidden="true" />
      <span className="global-run-banner__label">{label}</span>
      <Link to={target} className="global-run-banner__link">
        View live →
      </Link>
    </div>
  );
}
