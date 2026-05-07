/**
 * @module constants/activityTypes
 * @description Frontend re-export shim. The actual definition lives at
 * `shared/activityTypes.js` (repo root) so the frontend and backend share
 * one source of truth — see that module's docstring for rationale.
 *
 * Vite resolves relative imports that climb above `frontend/` only when
 * `server.fs.allow` includes the repo root — already configured in
 * `frontend/vite.config.js`. The production build (Rollup) has no such
 * restriction; it just follows the import graph.
 *
 * This shim exists so existing frontend imports
 * (`import { ACTIVITY_TYPES } from "../constants/activityTypes.js"`) keep
 * working without churning every callsite during the consolidation. New
 * code can import either this module or the shared one — they resolve
 * to the same frozen object.
 */

export { ACTIVITY_TYPES } from "../../../shared/activityTypes.js";
