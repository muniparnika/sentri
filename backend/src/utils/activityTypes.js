/**
 * @module utils/activityTypes
 * @description Backend re-export shim. The actual definition lives at
 * `shared/activityTypes.js` (repo root) so the frontend and backend share
 * one source of truth — see that module's docstring for rationale and
 * the "contract" notes around the free-form `activities.type` column.
 *
 * This shim exists purely so existing backend imports
 * (`import { ACTIVITY_TYPES } from "../utils/activityTypes.js"`) keep
 * working without churning every callsite during the consolidation.
 * New code should prefer importing from the shared module directly.
 */

export { ACTIVITY_TYPES } from "../../../shared/activityTypes.js";
