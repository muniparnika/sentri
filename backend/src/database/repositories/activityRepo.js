/**
 * @module database/repositories/activityRepo
 * @description Activity log CRUD backed by SQLite.
 */

import { getDatabase } from "../sqlite.js";

/**
 * Create an activity entry.
 * @param {Object} activity — { id, type, projectId, projectName, testId, testName, detail, status, createdAt, userId?, userName?, workspaceId? }
 */
export function create(activity) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO activities (id, type, projectId, projectName, testId, testName, detail, status, createdAt, userId, userName, workspaceId, meta)
    VALUES (@id, @type, @projectId, @projectName, @testId, @testName, @detail, @status, @createdAt, @userId, @userName, @workspaceId, @meta)
  `).run({
    id: activity.id,
    type: activity.type,
    projectId: activity.projectId || null,
    projectName: activity.projectName || null,
    testId: activity.testId || null,
    testName: activity.testName || null,
    detail: activity.detail || null,
    status: activity.status || "completed",
    createdAt: activity.createdAt,
    userId: activity.userId || null,
    userName: activity.userName || null,
    workspaceId: activity.workspaceId || null,
    // `meta` is JSON-encoded TEXT (migration 018) so callers can pass a plain
    // object; readers below re-parse it. Null when absent so the column is
    // genuinely empty rather than the string "null".
    meta: activity.meta != null ? JSON.stringify(activity.meta) : null,
  });
}

/**
 * Re-parse the JSON `meta` column into a plain object for callers. Tolerant
 * of legacy rows where the column is null/empty/non-JSON — those rows
 * predate migration 018 and surface as `meta: null`.
 * @param {Object} row
 * @returns {Object}
 */
function hydrate(row) {
  if (!row) return row;
  if (typeof row.meta === "string" && row.meta.length > 0) {
    try { row.meta = JSON.parse(row.meta); } catch { row.meta = null; }
  } else if (row.meta === undefined) {
    row.meta = null;
  }
  return row;
}

/**
 * Get all activities.
 * @returns {Object[]}
 */
export function getAll() {
  const db = getDatabase();
  return db.prepare("SELECT * FROM activities ORDER BY createdAt DESC").all().map(hydrate);
}

/**
 * Get all activities as a dictionary keyed by ID.
 * @returns {Object<string, Object>}
 */
export function getAllAsDict() {
  const all = getAll();
  const dict = {};
  for (const a of all) dict[a.id] = a;
  return dict;
}

/**
 * Get filtered activities.
 *
 * `after` / `before` accept ISO-8601 strings (matching the column's storage
 * format). The comparison is lexicographic on ISO strings, which is correct
 * for the YYYY-MM-DDTHH:MM:SS.sssZ shape `Date.toISOString()` produces.
 *
 * `offset` pairs with `limit` for cursor-style "Load more" — clients pass
 * the count of rows they've already rendered. Combined with the default
 * `ORDER BY createdAt DESC`, this gives a stable forward window even
 * when new rows arrive between fetches (the ordering key is the row's
 * own timestamp, so a new row only shifts the cursor on the *first*
 * page, not subsequent pages).
 *
 * @param {Object} [filters]
 * @param {string} [filters.type]
 * @param {string} [filters.projectId]
 * @param {string} [filters.workspaceId] — Scope to workspace (ACL-001).
 * @param {string} [filters.after]       — ISO timestamp; only rows with
 *   `createdAt >= after` are returned. Powers the AUTO-003b approvals
 *   timeline date-range picker (This week / Last 30 days / Custom).
 * @param {string} [filters.before]      — ISO timestamp; only rows with
 *   `createdAt < before` are returned. Pairs with `after` for bounded
 *   ranges; either bound is optional.
 * @param {number} [filters.limit=200]
 * @param {number} [filters.offset]      — Skip the first N rows of the
 *   result set; used by paginated UIs (Load more) to fetch the next page.
 * @returns {Object[]}
 */
export function getFiltered({ type, projectId, workspaceId, after, before, limit, offset } = {}) {
  const db = getDatabase();
  let sql = "SELECT * FROM activities WHERE 1=1";
  const params = [];
  if (workspaceId) {
    sql += " AND workspaceId = ?";
    params.push(workspaceId);
  }
  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }
  if (projectId) {
    sql += " AND projectId = ?";
    params.push(projectId);
  }
  if (after) {
    sql += " AND createdAt >= ?";
    params.push(after);
  }
  if (before) {
    sql += " AND createdAt < ?";
    params.push(before);
  }
  sql += " ORDER BY createdAt DESC LIMIT ?";
  params.push(limit || 200);
  if (Number.isFinite(offset) && offset > 0) {
    sql += " OFFSET ?";
    params.push(offset);
  }
  return db.prepare(sql).all(...params).map(hydrate);
}

/**
 * Count activities with optional workspace/project scope.
 * @param {Object} [filters]
 * @param {string} [filters.workspaceId]
 * @param {string} [filters.projectId]
 * @returns {number}
 */
export function countFiltered({ workspaceId, projectId } = {}) {
  const db = getDatabase();
  let sql = "SELECT COUNT(*) as cnt FROM activities WHERE 1=1";
  const params = [];
  if (workspaceId) {
    sql += " AND workspaceId = ?";
    params.push(workspaceId);
  }
  if (projectId) {
    sql += " AND projectId = ?";
    params.push(projectId);
  }
  return db.prepare(sql).get(...params).cnt;
}

/**
 * Get activities filtered by type for dashboard analytics.
 * Only returns type, status, createdAt — skips detail, names, etc.
 * @param {string[]} types — Activity types to include.
 * @param {Object} [opts]
 * @param {string} [opts.workspaceId] — Optional workspace scope.
 * @returns {Object[]}
 */
export function getByTypes(types, opts = {}) {
  const db = getDatabase();
  const { workspaceId } = opts;
  const placeholders = types.map(() => "?").join(", ");
  const workspaceClause = workspaceId ? " AND workspaceId = ?" : "";
  const params = workspaceId ? [...types, workspaceId] : types;
  return db.prepare(
    `SELECT type, status, createdAt FROM activities WHERE type IN (${placeholders})${workspaceClause} ORDER BY createdAt DESC`
  ).all(...params);
}

/**
 * Delete all activities for a project.
 * @param {string} projectId
 * @returns {number} Number of deleted rows.
 */
export function deleteByProjectId(projectId) {
  const db = getDatabase();
  const info = db.prepare("DELETE FROM activities WHERE projectId = ?").run(projectId);
  return info.changes;
}

/**
 * Delete all activities in a workspace.
 * @param {string} workspaceId
 * @returns {number} Number of deleted rows.
 */
export function clearByWorkspaceId(workspaceId) {
  const db = getDatabase();
  const info = db.prepare("DELETE FROM activities WHERE workspaceId = ?").run(workspaceId);
  return info.changes;
}
