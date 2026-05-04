/**
 * @module hooks/queries/useReviewQueueQuery
 * @description Server-paginated tests query for the Review Queue page.
 *
 * Uses `keepPreviousData` so the table doesn't unmount on page/filter
 * changes — the previous page stays visible while the next one fetches,
 * matching the pattern used by `useProjectDetailQuery`.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../../api.js";
import { reviewQueueQueryKeys, queryClient } from "../../queryClient.js";

const REVIEW_TAB_TO_REVIEW_STATUS = {
  draft:    "draft",
  approved: "approved",
  rejected: "rejected",
};

/**
 * @param {Object}  params
 * @param {string}  params.tab        - "draft" | "approved" | "rejected"
 * @param {string}  params.projectId  - "all" or a workspace project id
 * @param {string}  params.search     - free-text search
 * @param {string}  params.category   - "all" | "web" | "api" | "journey"
 *                                       All three filterable values are now
 *                                       server-side (the backend understands
 *                                       `api` / `ui` / `journey`); `web` maps
 *                                       to the backend's `ui`. `all` is a
 *                                       sentinel for "no filter".
 * @param {number}  params.page
 * @param {number}  [params.pageSize=50]
 * @returns {{
 *   data: Array,
 *   meta: {total: number, page: number, pageSize: number, hasMore: boolean},
 *   isLoading: boolean,
 *   isFetching: boolean,
 * }}
 */
export default function useReviewQueueQuery({ tab, projectId, search, category, page, pageSize = 50 }) {
  // Map UI category → backend `category` filter. Backend understands
  // `api` / `ui` / `journey`; the UI's `web` chip maps to `ui` for backwards
  // compatibility with the original copy. `all` (or anything unrecognised)
  // sends `undefined` so the backend skips the WHERE-clause altogether.
  const backendCategory =
    category === "api"     ? "api"     :
    category === "web"     ? "ui"      :
    category === "journey" ? "journey" : undefined;

  const filters = {
    reviewStatus: REVIEW_TAB_TO_REVIEW_STATUS[tab],
    projectId:    projectId !== "all" ? projectId : undefined,
    search:       search || undefined,
    category:     backendCategory,
  };

  const query = useQuery({
    queryKey: reviewQueueQueryKeys.list({ tab, projectId, search, category: backendCategory, page, pageSize }),
    queryFn:  () => api.getAllTestsPaged(page, pageSize, filters),
    placeholderData: keepPreviousData,
  });

  return {
    data: query.data?.data ?? [],
    meta: query.data?.meta ?? { total: 0, page, pageSize, hasMore: false },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

/**
 * Bust every Review Queue query — call after approve/reject/bulk mutations
 * so the next page render fetches fresh data.
 *
 * Because the matcher is the `reviewQueueQueryKeys.root` prefix
 * (`["reviewQueue"]`), this also invalidates:
 *   - every paginated list (`reviewQueueQueryKeys.list(...)`)
 *   - the sidebar draft-count badge (`reviewQueueQueryKeys.sidebarDraftCount(...)`)
 *   - the per-tab count probes (which are list queries with `pageSize: 1`)
 *
 * Adding new mutation sites? Calling this single helper is enough — do not
 * also reach into the sidebar's query key directly.
 */
export function invalidateReviewQueueCache() {
  return queryClient.invalidateQueries({ queryKey: reviewQueueQueryKeys.root });
}
