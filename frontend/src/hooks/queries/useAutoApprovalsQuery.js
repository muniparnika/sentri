/**
 * @module hooks/queries/useAutoApprovalsQuery
 * @description TanStack Query hook for the auto-approval activity feed
 * (AUTO-003b). Shared between the sidebar "🤖 N auto today" badge and
 * the ReviewQueue 24h tray so they read from one cache.
 *
 * Replaces per-component `useEffect` + `setInterval(60_000)` pollers:
 * - One in-flight fetch per `(scope, projectId)` pair across the whole
 *   app, regardless of how many components subscribe.
 * - `refetchOnWindowFocus: true` — users coming back to the tab see the
 *   fresh count immediately rather than waiting up to 60s for the next
 *   tick.
 * - Stale / gc windows set so the cache survives route transitions; a
 *   user clicking from Tests → Approvals → Tests doesn't trigger three
 *   round-trips.
 * - Mutations (revoke, bulk restore) call `invalidateAutoApprovalsCache()`
 *   and both subscribers see the update on next render.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "../../api.js";
import { ACTIVITY_TYPES } from "../../../../backend/src/constants/activityTypes.js";
import { autoApprovalsQueryKeys } from "../../queryClient.js";

/** Shared stale window — 30s matches `DEFAULT_STALE_TIME_MS` elsewhere. */
const AUTO_APPROVALS_STALE_MS = 30_000;

/**
 * Map a scope keyword to its ISO `after` timestamp. Computed fresh on each
 * query-fn call so a long-lived tab doesn't drift (a tab opened at 23:59 and
 * used past midnight would otherwise keep asking for "yesterday since 00:00"
 * until the cache evicts).
 *
 * @param {"today"|"24h"} scope
 * @returns {string} ISO timestamp
 */
function sinceIso(scope) {
  if (scope === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  // "24h" — rolling window
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Fetch `test.auto_approve` activity rows in the given time window,
 * optionally scoped to a single project. Workspace scoping is enforced
 * server-side (`backend/src/routes/system.js` `GET /activities`).
 *
 * @param {Object}   opts
 * @param {"today"|"24h"} opts.scope      — time window.
 * @param {string}   [opts.projectId]     — scope to a single project.
 * @param {boolean}  [opts.enabled=true]  — skip the query when false
 *   (e.g. the tray only enables when a project with auto-approval is
 *   selected and the Draft tab is active).
 * @param {number}   [opts.limit=1000]    — server limit.
 * @returns {ReturnType<typeof useQuery>}
 */
export default function useAutoApprovalsQuery({ scope, projectId, enabled = true, limit = 1000 } = {}) {
  return useQuery({
    queryKey: autoApprovalsQueryKeys.activity({ scope, projectId: projectId || null }),
    queryFn: async () => {
      const rows = await api.getActivities({
        type:      ACTIVITY_TYPES.TEST_AUTO_APPROVE,
        projectId: projectId || undefined,
        after:     sinceIso(scope),
        limit,
      });
      return Array.isArray(rows) ? rows : [];
    },
    enabled,
    // Fresh data as the user returns to the tab — beats the "up-to-60s stale"
    // that plain setInterval produced, without mounting more work.
    refetchOnWindowFocus: true,
    // 30s stale window (matches the app-wide default) means route transitions
    // between Sidebar-mount and ReviewQueue-mount share the same cached
    // response instead of both firing a fresh request.
    staleTime: AUTO_APPROVALS_STALE_MS,
    gcTime:    5 * 60_000,
    // Keep the 60s background refresh as a safety net for a long-open tab
    // where no focus event fires (e.g. single-monitor user who never clicks
    // away). TanStack Query dedupes this against concurrent subscribers, so
    // having Sidebar + ReviewQueue both mounted is still one request.
    refetchInterval: 60_000,
  });
}
