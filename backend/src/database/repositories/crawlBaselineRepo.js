/**
 * @module database/repositories/crawlBaselineRepo
 * @description AUTO-002 persistence layer for per-project page fingerprints.
 * Two write strategies are intentionally exposed:
 *
 * - {@link replaceProjectBaselines} — full DELETE + re-INSERT. Use only when
 *   the caller is certain the new fingerprint set is *complete* (e.g. after
 *   a fresh first-ever crawl), because any URL absent from `fingerprints` is
 *   treated as removed from the site.
 * - {@link mergeProjectBaselines} — upsert + targeted-delete. Preferred for
 *   every diff-aware crawl: a partial crawl (page N fails with a transient
 *   503) won't silently drop page N's baseline and force an unnecessary
 *   regen on the next run.
 */

import { getDatabase } from "../sqlite.js";

export function getByProjectId(projectId) {
  const db = getDatabase();
  return db.prepare("SELECT projectId, pageUrl, fingerprint, capturedAt FROM crawl_baselines WHERE projectId = ?").all(projectId);
}

export function getMapByProjectId(projectId) {
  const rows = getByProjectId(projectId);
  const map = {};
  for (const row of rows) map[row.pageUrl] = row;
  return map;
}

export function replaceProjectBaselines(projectId, fingerprints) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM crawl_baselines WHERE projectId = ?").run(projectId);
    const insert = db.prepare("INSERT INTO crawl_baselines (projectId, pageUrl, fingerprint, capturedAt) VALUES (?, ?, ?, ?)");
    for (const [pageUrl, fingerprint] of Object.entries(fingerprints || {})) {
      insert.run(projectId, pageUrl, fingerprint, now);
    }
  });
  tx();
}

/**
 * Upsert the current crawl's fingerprints into the baseline table without
 * wiping pages that weren't observed this time. `removedPageUrls` (URLs
 * the diff reported as `removedPages`) are explicitly deleted — this is
 * the only path that drops a baseline row, and it requires the caller to
 * prove the URL is genuinely gone (absent from the current crawl AND
 * present in the previous baseline). Transient failures that produce a
 * subset crawl don't hit this branch because their URLs never reach the
 * `removedPages` list.
 *
 * @param {string} projectId
 * @param {Record<string,string>} fingerprints - URL → new fingerprint for
 *   pages observed in the current crawl.
 * @param {string[]} [removedPageUrls] - URLs classified as `removedPages`
 *   by `diffCrawlSnapshots`. Optional; defaults to none.
 */
export function mergeProjectBaselines(projectId, fingerprints, removedPageUrls = []) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO crawl_baselines (projectId, pageUrl, fingerprint, capturedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(projectId, pageUrl) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        capturedAt = excluded.capturedAt
    `);
    for (const [pageUrl, fingerprint] of Object.entries(fingerprints || {})) {
      upsert.run(projectId, pageUrl, fingerprint, now);
    }
    if (Array.isArray(removedPageUrls) && removedPageUrls.length > 0) {
      const del = db.prepare("DELETE FROM crawl_baselines WHERE projectId = ? AND pageUrl = ?");
      for (const url of removedPageUrls) del.run(projectId, url);
    }
  });
  tx();
}
