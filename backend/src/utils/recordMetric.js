/**
 * @module utils/recordMetric
 * @description Validation wrapper around `metricSamplesRepo.insertSample`
 * (MET-001). Call this from any backend telemetry callsite that wants to
 * emit a time-series sample without each callsite re-implementing the same
 * input guards.
 *
 * Designed as best-effort: silently skips invalid inputs (missing
 * `projectId` / `metricKey`, or `value` that doesn't coerce to a finite
 * number) rather than throwing. This is intentional — telemetry must never
 * flip a passing run into a failing one. Callers are expected to wrap the
 * call in a `try/catch` if they care about persistence failures (see
 * `backend/src/runner/healingPersistence.js` for the canonical usage).
 */

import { insertSample } from "../database/repositories/metricSamplesRepo.js";

/**
 * Record a single metric sample.
 *
 * Coerces numeric strings (e.g. `"7.5"`) via `Number()`, rejects `NaN` and
 * missing identifiers. No-op on invalid input.
 *
 * @param {string} projectId
 * @param {string} metricKey - Stable metric identifier (e.g. `"healing.savings"`, `"webVitals.lcp"`).
 * @param {number|string} value - Numeric value or numeric string; coerced via `Number()`.
 * @param {Object|null} [tags=null] - Optional structured context (e.g. `{ testId }`).
 * @param {number} [ts=Date.now()] - Sample timestamp, epoch ms.
 * @returns {void}
 */
export function recordMetric(projectId, metricKey, value, tags = null, ts = Date.now()) {
  if (!projectId || !metricKey || Number.isNaN(Number(value))) return;
  insertSample({ projectId, metricKey, ts, value: Number(value), tags });
}
