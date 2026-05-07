/**
 * @module services/approvalService
 * @description Approval-decision business logic for AUTO-003b.
 *
 * Extracted from `routes/tests.js` so the route handlers stay thin
 * (HTTP shape only) and the provenance contract has a single home.
 *
 * Three provenance shapes flow through this module:
 *
 *   PROVENANCE_CLEAR  — null-out the four columns; written by every
 *                       "return to draft" path (single restore, bulk
 *                       restore, revoke). Previously duplicated in
 *                       three handlers, where the single-restore copy
 *                       went stale and shipped as a bug.
 *
 *   humanApproval()   — provenance for a manual approve click. Carries
 *                       `approvalSource: "human"`, `approvedBy` from
 *                       the actor, `approvedAt` from `Date.now()`,
 *                       and a null `approvalThreshold` (no threshold
 *                       was consulted).
 *
 *   computeStats()    — counts (human/auto/draft/rejected) plus the
 *                       7-day revert rate, computed off the activity
 *                       log because the `tests` row only carries
 *                       *current* state and revoked tests have their
 *                       provenance cleared.
 */

import { countApprovalSplitByProjectId } from "../database/repositories/testRepo.js";
import { countDistinctTestIds } from "../database/repositories/activityRepo.js";
import { ACTIVITY_TYPES } from "../../../shared/activityTypes.js";

/** `tests.approvalSource` enumeration. */
export const APPROVAL_SOURCE = Object.freeze({
  AUTO:  "auto",
  HUMAN: "human",
});

/**
 * Provenance-clearing shape — pass to `testRepo.update(...)` together with
 * `{ reviewStatus: "draft", reviewedAt: null }` to fully revert an approval.
 *
 * Frozen so a caller can't accidentally mutate it (the same object is reused
 * across every restore/revoke path; mutation would leak between requests).
 */
export const PROVENANCE_CLEAR = Object.freeze({
  approvalSource:    null,
  approvalThreshold: null,
  approvedAt:        null,
  approvedBy:        null,
});

/**
 * Build the provenance fields for a human approval, attributed to `actorInfo`.
 * The threshold is always null for human approvals (no threshold was consulted).
 *
 * @param {{userName?: string|null, userId?: string|null}} actorInfo
 * @returns {{approvalSource: "human", approvalThreshold: null, approvedAt: number, approvedBy: string|null}}
 */
export function humanApproval(actorInfo) {
  return {
    approvalSource:    APPROVAL_SOURCE.HUMAN,
    approvalThreshold: null,
    approvedAt:        Date.now(),
    approvedBy:        actorInfo?.userName || actorInfo?.userId || null,
  };
}

/**
 * Compute approval-decision counts and the 7-day revert rate for a project.
 *
 * Counts are derived from the live `tests` table. The revert rate is derived
 * from the activity log because revoked tests have their provenance cleared
 * — only the audit trail can answer "was this auto-approval pulled back?".
 *
 * The revert rate is deduped by `testId` so a test that round-trips
 * auto-approve → revoke → re-approve → revoke within the 7-day window counts
 * as a single revert (and a single auto-approval). The metric answers "what
 * fraction of auto-approved *tests* did humans pull back?", not "how many
 * revoke events fired?".
 *
 * Defensive clamp: ratio capped at 1 so a backfill that produced more
 * revokes than auto-approvals in the window can't render "117% revert rate".
 *
 * @param {string} projectId
 * @returns {{
 *   human: number, auto: number, draft: number, rejected: number,
 *   total: number, revertRate7d: number,
 *   autoApprovals7d: number, reverts7d: number,
 * }}
 */
export function computeStats(projectId) {
  // ── Status counts ──────────────────────────────────────────────────────────
  // Single `SUM(CASE WHEN ...)` aggregate over `tests` — returns five integers
  // instead of every row in the project. See `countApprovalSplitByProjectId`
  // in testRepo.js for the SQL and the human/auto split contract.
  const counts = countApprovalSplitByProjectId(projectId);

  // ── 7-day revert rate ──────────────────────────────────────────────────────
  // Two `COUNT(DISTINCT testId)` aggregates over `activities`, bounded by the
  // 7-day `after` timestamp and the index-friendly `(type, projectId)`
  // predicates. Replaces a pair of `getFiltered({ limit: 10000 })` calls that
  // pulled up to 20 MB of row data per request just to compute two set sizes.
  //
  // The revoke-side filter uses `metaIsAutoApproved: true` so the count only
  // includes revokes of *auto-approved* tests — matching the metric's
  // denominator. The flag is the decision-time truth and is independent of
  // whether the original auto-approval fell inside the same 7-day window,
  // so this stays correct across window-boundary cases.
  //
  // Distinctness is by `testId`: a test auto-approved twice or revoked twice
  // in the window still counts as one. That matches the question the UI asks
  // ("what fraction of *tests* did humans pull back?"), not raw event count.
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const autoApprovals7d = countDistinctTestIds({
    type:      ACTIVITY_TYPES.TEST_AUTO_APPROVE,
    projectId,
    after:     sinceIso,
  });
  const reverts7d = countDistinctTestIds({
    type:                ACTIVITY_TYPES.TEST_REVOKE,
    projectId,
    after:               sinceIso,
    metaIsAutoApproved:  true,
  });

  // Defensive clamp: if a backfill ever produces more matching revokes than
  // auto-approvals in the window (e.g. revokes of pre-window approvals), cap
  // the ratio at 1 so the UI never renders "117% revert rate".
  const revertRate7d = autoApprovals7d > 0
    ? Math.min(1, reverts7d / autoApprovals7d)
    : 0;

  return {
    human:    counts.human,
    auto:     counts.auto,
    draft:    counts.draft,
    rejected: counts.rejected,
    total:    counts.total,
    revertRate7d,
    autoApprovals7d,
    reverts7d,
  };
}
