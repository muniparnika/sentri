import { insertSample } from "../database/repositories/metricSamplesRepo.js";

export function recordMetric(projectId, metricKey, value, tags = null, ts = Date.now()) {
  if (!projectId || !metricKey || Number.isNaN(Number(value))) return;
  insertSample({ projectId, metricKey, ts, value: Number(value), tags });
}
