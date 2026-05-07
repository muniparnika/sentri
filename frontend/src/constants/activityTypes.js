/**
 * @module constants/activityTypes
 * @description Frontend mirror of `backend/src/utils/activityTypes.js`.
 *
 * The backend's activity log is stringly-typed by design — the column is
 * free-form TEXT so historical rows survive code changes without a
 * migration. That flexibility bit us once already: `ApprovalsTimeline.jsx`
 * fetched `"test.approved"` while the backend wrote `"test.approve"`, and
 * the only symptom was a visually-empty human-approvals column. No
 * compiler caught it because both sides were independent string literals.
 *
 * This module duplicates the backend's enum so the frontend has the same
 * typo-proof reference. **Every string here MUST match the corresponding
 * `ACTIVITY_TYPES.*` entry in `backend/src/utils/activityTypes.js` byte-
 * for-byte** — the two files are the contract. When you add a new event
 * type on one side, add it to the other in the same PR. A CI check over
 * both files (diff the extracted literals) would enforce this, but the
 * duplication is small enough that a manual pairing works for now.
 *
 * No build step or shared package because the backend is CommonJS-ish
 * ESM with Node resolution and the frontend is Vite/Rollup — a shared
 * module would need either a symlink (breaks on Windows), a workspace
 * package (restructures the monorepo), or a codegen step (adds infra
 * complexity disproportionate to what's being shared). Two 40-line
 * frozen maps that agree on 14 strings is the pragmatic choice.
 */

export const ACTIVITY_TYPES = Object.freeze({
  // ── Test review (AUTO-003 / AUTO-003b) ──────────────────────────────────
  TEST_CREATE:        "test.create",
  TEST_EDIT:          "test.edit",
  TEST_DELETE:        "test.delete",
  TEST_REGENERATE:    "test.regenerate",
  TEST_GENERATE:      "test.generate",
  TEST_APPROVE:       "test.approve",
  TEST_REJECT:        "test.reject",
  TEST_RESTORE:       "test.restore",
  TEST_AUTO_APPROVE:  "test.auto_approve",
  TEST_REVOKE:        "test.revoke",

  // Bulk variants — consumed by analytics summaries that want to skip
  // per-row events. Names mirror the singular forms above.
  TEST_BULK_APPROVE:  "test.bulk_approve",
  TEST_BULK_REJECT:   "test.bulk_reject",
  TEST_BULK_RESTORE:  "test.bulk_restore",
  TEST_BULK_DELETE:   "test.bulk_delete",
});
