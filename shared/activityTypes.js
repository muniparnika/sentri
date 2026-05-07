/**
 * @module shared/activityTypes
 * @description Single source of truth for `activities.type` literals —
 * imported by both the backend (`backend/src/...`) and the frontend
 * (`frontend/src/...`). No duplication, no "keep these two files in
 * sync" contract to get wrong.
 *
 * The activity log is stringly-typed by design (free-form `type TEXT`
 * column so historical rows survive code changes without a migration).
 * That flexibility bit us once: `ApprovalsTimeline.jsx` fetched
 * `"test.approved"` while the backend wrote `"test.approve"`, and the
 * only symptom was a silently-empty human-approvals column. Routing
 * both sides through this single ESM module makes a typo into a
 * ReferenceError rather than a runtime silent-failure.
 *
 * ### How it's imported
 *
 * Backend (pure ESM, Node):
 *   `import { ACTIVITY_TYPES } from "../../../shared/activityTypes.js";`
 *   (relative path from `backend/src/**`)
 *
 * Frontend (Vite):
 *   `import { ACTIVITY_TYPES } from "../../shared/activityTypes.js";`
 *   (relative path from `frontend/src/**`). Vite's dev server needs
 *   `server.fs.allow` to include the repo root so the file can be
 *   served from outside `frontend/` — see `frontend/vite.config.js`.
 *
 * ### Why at the repo root, not a package
 *
 * A workspace package (`packages/shared`) would be the textbook answer,
 * but it would force a monorepo restructure (lockfile, tooling, docker
 * layering) for what is currently a 14-string map. A plain shared ESM
 * file crosses no build boundary either way — both backend and
 * frontend already resolve relative imports. Revisit if the shared
 * surface grows beyond a handful of constants.
 *
 * ### Convention
 *
 * Imperative `<entity>.<verb>` (`test.approve`, not `test.approved`).
 * Matches the existing log corpus; `logActivity`'s module-level
 * docstring in `backend/src/utils/activityLogger.js` is the reference.
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

  // Bulk variants — consumed by analytics summaries that skip per-row
  // events. Names mirror the singular forms above.
  TEST_BULK_APPROVE:  "test.bulk_approve",
  TEST_BULK_REJECT:   "test.bulk_reject",
  TEST_BULK_RESTORE:  "test.bulk_restore",
  TEST_BULK_DELETE:   "test.bulk_delete",
});
