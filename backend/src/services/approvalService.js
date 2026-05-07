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

import * as testRepo from "../database/repositories/testRepo.js";
import * as activityRepo from "../database/repositories/activityRepo.js";
import { ACTIVITY_TYPES } from "../utils/activityTypes.js";

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
  const tests = testRepo.getByProjectId(projectId);
  let human = 0, auto = 0, draft = 0, rejected = 0;
  for (const t of tests) {
    if (t.reviewStatus === "draft") draft++;
    else if (t.reviewStatus === "rejected") rejected++;
    else if (t.reviewStatus === "approved" && t.approvalSource === APPROVAL_SOURCE.AUTO) auto++;
    else if (t.reviewStatus === "approved") human++;
  }

  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  // Pull a generous window from the activity log — `getFiltered` defaults to
  // LIMIT 200 and silently truncates older rows, which would understate both
  // the auto-approval count and the revert numerator on busy projects.
  // 10k covers ~1.4k auto-approvals/day for 7 days with headroom; the SQL
  // filter is index-friendly (type + projectId), so the cost is bounded.
  const autoApprovals = activityRepo.getFiltered({ type: ACTIVITY_TYPES.TEST_AUTO_APPROVE, projectId, limit: 10000 }) || [];
  const revokes       = activityRepo.getFiltered({ type: ACTIVITY_TYPES.TEST_REVOKE,       projectId, limit: 10000 }) || [];

  const recentAutoTestIds = new Set(
    autoApprovals
      .filter((a) => new Date(a.createdAt).getTime() >= sinceMs)
      .map((a) => a.testId)
      .filter(Boolean),
  );
  // Filter revokes by `meta.wasAutoApproved === true` (set by the revoke
  // handler) instead of correlating testIds against the auto-approval list.
  // The flag is the decision-time truth and survives boundary effects where
  // an auto-approval and its revoke straddle the 7-day window.
  const recentRevertTestIds = new Set(
    revokes
      .filter((a) => new Date(a.createdAt).getTime() >= sinceMs && a.meta?.wasAutoApproved === true)
      .map((a) => a.testId)
      .filter(Boolean),
  );

  const revertRate7d = recentAutoTestIds.size > 0
    ? Math.min(1, recentRevertTestIds.size / recentAutoTestIds.size)
    : 0;

  return {
    human,
    auto,
    draft,
    rejected,
    total: tests.length,
    revertRate7d,
    autoApprovals7d: recentAutoTestIds.size,
    reverts7d:       recentRevertTestIds.size,
  };
}
