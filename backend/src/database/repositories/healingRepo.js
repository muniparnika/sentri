/**
 * @module database/repositories/healingRepo
 * @description Self-healing history CRUD backed by SQLite.
 */

import { getDatabase } from "../sqlite.js";

/**
 * Get a healing entry by key.
 * @param {string} key — "<testId>::<action>::<label>"
 * @returns {Object|undefined}
 */
export function get(key) {
  const db = getDatabase();
  return db.prepare("SELECT * FROM healing_history WHERE key = ?").get(key) || undefined;
}

/**
 * Upsert a healing entry.
 * @param {string} key
 * @param {Object} entry — { strategyIndex, succeededAt, failCount }
 */
// Lazy migration flag — ensures the strategyVersion column exists before first use.
let _migrated = false;
function ensureStrategyVersionColumn(db) {
  if (_migrated) return;
  try { db.prepare("ALTER TABLE healing_history ADD COLUMN strategyVersion INTEGER").run(); } catch { /* already exists */ }
  _migrated = true;
}

/**
 * Chunk a `key LIKE` test-ID query so the OR fanout per statement is bounded.
 *
 * Each test ID expands to two LIKE clauses (raw + versioned), so a chunk size
 * of 100 caps the OR list at 200 clauses per query — well within the
 * Postgres planner's comfort zone for OR-of-LIKE expressions on large
 * workspaces. SQLite handles arbitrary OR depth, but chunking keeps both
 * adapters on the same execution path.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string[]} testIds
 * @param {(clauses: string, params: string[]) => any} sqlFn — invoked per chunk; return value collected into the result array.
 * @returns {any[]} per-chunk results in input order
 */
const HEALING_TESTID_CHUNK = 100;
function chunkedTestIdQuery(db, testIds, sqlFn) {
  const out = [];
  for (let i = 0; i < testIds.length; i += HEALING_TESTID_CHUNK) {
    const slice = testIds.slice(i, i + HEALING_TESTID_CHUNK);
    const clauses = slice.flatMap(() => ["key LIKE ?", "key LIKE ?"]).join(" OR ");
    const params = slice.flatMap((t) => [`${t}::%`, `${t}@v%::%`]);
    out.push(sqlFn(clauses, params));
  }
  return out;
}

export function set(key, entry) {
  const db = getDatabase();
  ensureStrategyVersionColumn(db);
  db.prepare(`
    INSERT INTO healing_history (key, strategyIndex, succeededAt, failCount, strategyVersion)
    VALUES (@key, @strategyIndex, @succeededAt, @failCount, @strategyVersion)
    ON CONFLICT(key) DO UPDATE SET
      strategyIndex = @strategyIndex,
      succeededAt = @succeededAt,
      failCount = @failCount,
      strategyVersion = @strategyVersion
  `).run({
    key,
    strategyIndex: entry.strategyIndex ?? -1,
    succeededAt: entry.succeededAt || null,
    failCount: entry.failCount || 0,
    strategyVersion: entry.strategyVersion ?? null,
  });
}

/**
 * Get all healing entries as a dictionary keyed by composite key.
 * @returns {Object<string, Object>}
 */
export function getAllAsDict() {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM healing_history").all();
  const dict = {};
  for (const r of rows) dict[r.key] = r;
  return dict;
}

/**
 * Get all healing entries for a specific test (keys starting with "<testId>::").
 *
 * Accepts both raw test IDs (`"TC-1"`) and versioned scope IDs
 * (`"TC-1@v2"`).  When a versioned scope is passed we also query the
 * legacy (unversioned) prefix so that pre-existing healing entries
 * remain readable after upgrading to versioned scopes.
 *
 * @param {string} testId — raw test ID or versioned scope ID
 * @returns {Object<string, Object>} Map of `"action::label"` → entry.
 */
export function getByTestId(testId) {
  const db = getDatabase();
  // Ensure the strategyVersion column exists before querying — the ORDER BY
  // clause references it, but the column is not in the initial schema (001).
  // On databases where set() has never been called, the lazy migration in
  // ensureStrategyVersionColumn() hasn't run yet and the query would crash
  // with "no such column: strategyVersion".
  ensureStrategyVersionColumn(db);

  // Strip the @vN suffix (if present) to derive the base test ID so we
  // can also query legacy keys stored before versioned scopes existed.
  const baseId = testId.replace(/@v\d+$/, "");

  const patterns = [`${testId}::%`];
  // When testId already contains @v, also query unversioned legacy keys
  if (baseId !== testId) {
    patterns.push(`${baseId}::%`);
  }
  // Also query any other versioned keys for this base ID
  patterns.push(`${baseId}@v%::%`);

  // Build a query with the right number of OR clauses
  const uniquePatterns = [...new Set(patterns)];
  const whereClauses = uniquePatterns.map(() => "key LIKE ?").join(" OR ");
  // ORDER BY ensures that when multiple versions exist for the same
  // action::label, the versioned entry (strategyVersion IS NOT NULL)
  // is processed last and wins the collision in the flat result dict.
  const rows = db.prepare(
    `SELECT * FROM healing_history WHERE ${whereClauses} ORDER BY strategyVersion ASC NULLS FIRST`
  ).all(...uniquePatterns);

  const result = {};
  for (const r of rows) {
    const sepIdx = r.key.indexOf("::");
    if (sepIdx < 0) continue;
    result[r.key.slice(sepIdx + 2)] = r;
  }
  return result;
}

/**
 * Get all healing entries scoped to a list of test IDs.
 *
 * Filters at the SQL layer using `key LIKE` patterns so we never load other
 * workspaces' rows into Node memory — the workspace-scoped replacement for
 * `getAllAsDict()` when the caller already knows which test IDs belong to
 * the current workspace. Matches both `<testId>::%` (raw) and `<testId>@v%::%`
 * (versioned scope) prefixes, mirroring `countByTestIds` / `deleteByTestIds`.
 *
 * Returns raw rows — when the same `(testId, action, label)` tuple has both
 * a legacy unversioned row and one or more versioned rows, callers will see
 * one entry per row. `ORDER BY strategyVersion ASC NULLS FIRST` mirrors the
 * sort `getByTestId` uses so callers can deduplicate via the
 * "later-row-wins" pattern (Map.set keyed on `baseTestId::action::label`)
 * and end up with the versioned entry as the survivor — matching the
 * single-test reader's semantics.
 *
 * @param {string[]} testIds
 * @returns {Object[]} Raw healing_history rows (key, strategyIndex, succeededAt, failCount, strategyVersion, …), oldest-first by strategyVersion.
 */
export function getByTestIds(testIds) {
  if (!testIds || testIds.length === 0) return [];
  const db = getDatabase();
  ensureStrategyVersionColumn(db);
  // Chunk the OR fanout, then concat. We re-sort the merged result so
  // `strategyVersion ASC NULLS FIRST` semantics hold across chunk boundaries
  // — callers rely on this ordering to dedupe via "later-row-wins".
  const chunks = chunkedTestIdQuery(db, testIds, (clauses, params) =>
    db.prepare(
      `SELECT * FROM healing_history WHERE ${clauses} ORDER BY strategyVersion ASC NULLS FIRST`
    ).all(...params)
  );
  const rows = chunks.flat();
  if (chunks.length > 1) {
    rows.sort((a, b) => {
      const av = a.strategyVersion;
      const bv = b.strategyVersion;
      if (av === bv) return 0;
      if (av === null || av === undefined) return -1;
      if (bv === null || bv === undefined) return 1;
      return av - bv;
    });
  }
  return rows;
}

/**
 * Delete healing entries for a list of test IDs.
 * @param {string[]} testIds
 */
export function deleteByTestIds(testIds) {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM healing_history WHERE key LIKE ?");
  const txn = db.transaction(() => {
    for (const tid of testIds) {
      stmt.run(`${tid}::%`);
      stmt.run(`${tid}@v%::%`);
    }
  });
  txn();
}

/**
 * Count healing entries for specific test IDs.
 * @param {string[]} testIds
 * @returns {number}
 */
export function countByTestIds(testIds) {
  if (!testIds || testIds.length === 0) return 0;
  const db = getDatabase();
  const counts = chunkedTestIdQuery(db, testIds, (clauses, params) =>
    db.prepare(`SELECT COUNT(*) as cnt FROM healing_history WHERE ${clauses}`).get(...params).cnt
  );
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * Count successful healing entries for specific test IDs.
 * @param {string[]} testIds
 * @returns {number}
 */
export function countSuccessesByTestIds(testIds) {
  if (!testIds || testIds.length === 0) return 0;
  const db = getDatabase();
  const counts = chunkedTestIdQuery(db, testIds, (clauses, params) =>
    db.prepare(
      `SELECT COUNT(*) as cnt FROM healing_history WHERE (${clauses}) AND strategyIndex >= 0 AND succeededAt IS NOT NULL`
    ).get(...params).cnt
  );
  return counts.reduce((a, b) => a + b, 0);
}
