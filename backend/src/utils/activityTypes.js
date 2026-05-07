/**
 * @module utils/activityTypes
 * @description Single source of truth for `activities.type` literals.
 *
 * The activity log is stringly-typed by design (it stores a free-form
 * `type TEXT` column so historical rows survive code changes without
 * a migration). That flexibility had a cost: `ApprovalsTimeline.jsx`
 * once fetched `"test.approved"` while the backend wrote `"test.approve"`,
 * and the bug only surfaced visually — no compiler caught it.
 *
 * Every producer (`logActivity` callsite) and consumer
 * (`activityRepo.getFiltered({ type })`) should import the constant from
 * here instead of typing the literal. Adding a new event? Add it here
 * first, then reference `ACTIVITY_TYPES.X` at the callsite — that way
 * a typo in one place becomes a static-analysis failure rather than a
 * silent feature regression.
 *
 * Convention: imperative `<entity>.<verb>` (`test.approve`, not the
 * past-tense `test.approved`). Matches the existing log corpus.
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
