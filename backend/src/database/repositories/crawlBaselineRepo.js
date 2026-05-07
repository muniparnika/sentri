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
