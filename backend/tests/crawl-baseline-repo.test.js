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

closeDatabase();
console.log("crawl-baseline-repo.test.js passed");
