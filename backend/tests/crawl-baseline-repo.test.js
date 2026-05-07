import assert from "node:assert/strict";
import { initDatabase, closeDatabase } from "../src/database/sqlite.js";
import * as crawlBaselineRepo from "../src/database/repositories/crawlBaselineRepo.js";

// AUTO-002: crawlBaselineRepo unit tests (REVIEW.md mandatory: every
// repository module needs a dedicated tests/<module>.test.js file).

initDatabase(":memory:");

// getByProjectId / getMapByProjectId on empty project
assert.deepEqual(crawlBaselineRepo.getByProjectId("PRJ-empty"), []);
assert.deepEqual(crawlBaselineRepo.getMapByProjectId("PRJ-empty"), {});

// replaceProjectBaselines inserts fingerprints
crawlBaselineRepo.replaceProjectBaselines("PRJ-1", {
  "https://example.com/": "fp-home",
  "https://example.com/about": "fp-about",
});
const map1 = crawlBaselineRepo.getMapByProjectId("PRJ-1");
assert.equal(map1["https://example.com/"].fingerprint, "fp-home");
assert.equal(map1["https://example.com/about"].fingerprint, "fp-about");
assert.ok(map1["https://example.com/"].capturedAt);

// replaceProjectBaselines is a full replace (delete + reinsert)
crawlBaselineRepo.replaceProjectBaselines("PRJ-1", {
  "https://example.com/": "fp-home-v2",
});
const map2 = crawlBaselineRepo.getMapByProjectId("PRJ-1");
assert.equal(map2["https://example.com/"].fingerprint, "fp-home-v2");
assert.equal(map2["https://example.com/about"], undefined, "old baselines should be wiped");

// Empty fingerprints object clears all rows for the project
crawlBaselineRepo.replaceProjectBaselines("PRJ-1", {});
assert.deepEqual(crawlBaselineRepo.getByProjectId("PRJ-1"), []);

// null/undefined fingerprints is treated as empty
crawlBaselineRepo.replaceProjectBaselines("PRJ-1", null);
assert.deepEqual(crawlBaselineRepo.getByProjectId("PRJ-1"), []);

// Per-project isolation: writes to PRJ-A do not affect PRJ-B
crawlBaselineRepo.replaceProjectBaselines("PRJ-A", { "https://a.com/": "fp-a" });
crawlBaselineRepo.replaceProjectBaselines("PRJ-B", { "https://b.com/": "fp-b" });
assert.equal(crawlBaselineRepo.getMapByProjectId("PRJ-A")["https://a.com/"].fingerprint, "fp-a");
assert.equal(crawlBaselineRepo.getMapByProjectId("PRJ-B")["https://b.com/"].fingerprint, "fp-b");
assert.equal(crawlBaselineRepo.getMapByProjectId("PRJ-A")["https://b.com/"], undefined);

// ── mergeProjectBaselines (partial-crawl safety) ────────────────────────────
// AUTO-002: the merge path must upsert observed URLs, leave unobserved URLs
// alone, and only drop URLs explicitly listed as removed.
crawlBaselineRepo.replaceProjectBaselines("PRJ-merge", {
  "https://m.com/": "fp-home-v1",
  "https://m.com/about": "fp-about-v1",
  "https://m.com/contact": "fp-contact-v1",
});

// Simulate a partial crawl: /about is updated, /contact was not re-crawled
// (transient failure), nothing was removed.
crawlBaselineRepo.mergeProjectBaselines("PRJ-merge", {
  "https://m.com/about": "fp-about-v2",
}, []);
const mergeMap = crawlBaselineRepo.getMapByProjectId("PRJ-merge");
assert.equal(mergeMap["https://m.com/about"].fingerprint, "fp-about-v2", "observed URL upserted");
assert.equal(mergeMap["https://m.com/"].fingerprint, "fp-home-v1", "unobserved URL preserved (not wiped)");
assert.equal(mergeMap["https://m.com/contact"].fingerprint, "fp-contact-v1", "transient-failure URL preserved");

// Now drop /contact explicitly via removedPageUrls
crawlBaselineRepo.mergeProjectBaselines("PRJ-merge", {
  "https://m.com/": "fp-home-v2",
}, ["https://m.com/contact"]);
const mergeMap2 = crawlBaselineRepo.getMapByProjectId("PRJ-merge");
assert.equal(mergeMap2["https://m.com/"].fingerprint, "fp-home-v2", "home upserted");
assert.equal(mergeMap2["https://m.com/about"].fingerprint, "fp-about-v2", "about preserved");
assert.equal(mergeMap2["https://m.com/contact"], undefined, "contact explicitly removed");

// Merge into empty baseline behaves like first-crawl insert
crawlBaselineRepo.mergeProjectBaselines("PRJ-fresh", { "https://f.com/": "fp-f" });
assert.equal(crawlBaselineRepo.getMapByProjectId("PRJ-fresh")["https://f.com/"].fingerprint, "fp-f");

// Empty/null fingerprints is a no-op (does not delete anything)
crawlBaselineRepo.mergeProjectBaselines("PRJ-merge", null);
crawlBaselineRepo.mergeProjectBaselines("PRJ-merge", {});
assert.equal(crawlBaselineRepo.getMapByProjectId("PRJ-merge")["https://m.com/"].fingerprint, "fp-home-v2", "empty merge preserves existing");

closeDatabase();
console.log("crawl-baseline-repo.test.js passed");
