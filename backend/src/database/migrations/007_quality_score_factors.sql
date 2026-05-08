-- Migration 007: Per-test quality-score factor breakdown
--
-- Surfaces the rubric that produced `qualityScore` so the Review Queue can
-- render a "why was this drafted?" explainer (rewards + penalties + deltas).
--
-- The column stores the JSON output of `scoreTestWithFactors(test).factors`
-- from `backend/src/pipeline/deduplicator.js` — an array of objects shaped
-- `{ id, label, delta, kind }`. Stored as TEXT for SQLite/PostgreSQL parity
-- (matching the existing pattern for `steps` / `tags`) and round-tripped
-- through `testRepo.JSON_FIELDS`.
--
-- Pre-migration tests get `qualityScoreFactors = NULL`, which `rowToTest()`
-- maps to `[]` so the API never returns null for this field.

ALTER TABLE tests ADD COLUMN qualityScoreFactors TEXT;
