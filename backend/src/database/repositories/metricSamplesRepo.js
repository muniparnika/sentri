import { getDatabase } from "../sqlite.js";

export function insertSample({ projectId, metricKey, ts = Date.now(), value, tags = null }) {
  const db = getDatabase();
  db.prepare(`INSERT INTO metric_samples (projectId, metricKey, ts, value, tags) VALUES (?, ?, ?, ?, ?)`)
    .run(projectId, metricKey, ts, value, tags ? JSON.stringify(tags) : null);
}

export function getSeries(projectId, metricKey, { since = 0, limit = 200 } = {}) {
  const db = getDatabase();
  const rows = db.prepare(`SELECT ts, value, tags FROM metric_samples WHERE projectId = ? AND metricKey = ? AND ts >= ? ORDER BY ts ASC LIMIT ?`)
    .all(projectId, metricKey, since, limit);
  return rows.map(r => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : null }));
}
