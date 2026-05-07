import assert from "node:assert/strict";
import { diffCrawlSnapshots, buildPageFingerprint } from "../src/pipeline/crawlDiff.js";

// AUTO-002: diffCrawlSnapshots scenario coverage.
// NEXT.md:150 requires: first-crawl baseline creation, unchanged-page skip,
// changed-page regen, added/removed-page handling, empty-baseline fallback.

const home = { url: "https://example.com/", title: "Home", elements: [] };
const aboutOld = { url: "https://example.com/about", title: "About", elements: [] };

// ── Scenario 1: mixed diff (added / changed / unchanged / removed) ──────────
const previous = {
  "https://example.com/": { fingerprint: buildPageFingerprint(home) },
  "https://example.com/about": { fingerprint: buildPageFingerprint(aboutOld) },
  "https://example.com/removed": { fingerprint: "legacy" },
};

const snapshots = [
  home,
  { url: "https://example.com/about", title: "About Updated", elements: [{ tag: "h1", text: "Updated" }] },
  { url: "https://example.com/new", title: "New", elements: [] },
];

const diff = diffCrawlSnapshots(previous, snapshots);

assert.ok(diff.addedPages.includes("https://example.com/new"), "new URL → added");
assert.ok(diff.changedOnlyPages.includes("https://example.com/about"), "modified URL → changedOnly");
assert.ok(diff.unchangedPages.includes("https://example.com/"), "identical URL → unchanged");
assert.ok(diff.removedPages.includes("https://example.com/removed"), "absent URL → removed");
// changedPages is the union of added + changed — this is what drives regeneration scope.
assert.ok(diff.changedPages.includes("https://example.com/new"), "changedPages includes added");
assert.ok(diff.changedPages.includes("https://example.com/about"), "changedPages includes changed");
assert.equal(diff.changedPages.length, 2, "changedPages is added + changedOnly");

// ── Scenario 2: first-crawl / empty-baseline fallback ──────────────────────
// NEXT.md:49: "First crawl of a new project behaves identically to today
// (no baseline to diff against → full crawl + generate)."
const firstDiff = diffCrawlSnapshots({}, [home, { url: "https://example.com/about", title: "A", elements: [] }]);
assert.equal(firstDiff.addedPages.length, 2, "first crawl: every URL is added");
assert.equal(firstDiff.changedPages.length, 2, "first crawl: changedPages === every URL");
assert.equal(firstDiff.unchangedPages.length, 0);
assert.equal(firstDiff.removedPages.length, 0);

// `null` / `undefined` previousByUrl must behave the same as `{}`
const nullDiff = diffCrawlSnapshots(null, [home]);
assert.deepEqual(nullDiff.addedPages, ["https://example.com/"], "null baseline treated as empty");
const undefDiff = diffCrawlSnapshots(undefined, [home]);
assert.deepEqual(undefDiff.addedPages, ["https://example.com/"], "undefined baseline treated as empty");

// ── Scenario 3: unchanged-only (no-change crawl) ────────────────────────────
// NEXT.md:50: "Second crawl with no changes emits zero generation calls and
// completes as `completed_empty` with a `changedPages: []` annotation."
const sameSnapshots = [home];
const samePrev = { "https://example.com/": { fingerprint: buildPageFingerprint(home) } };
const noChange = diffCrawlSnapshots(samePrev, sameSnapshots);
assert.deepEqual(noChange.changedPages, [], "no-change crawl: changedPages is empty");
assert.deepEqual(noChange.removedPages, [], "no-change crawl: removedPages is empty");
assert.deepEqual(noChange.unchangedPages, ["https://example.com/"], "no-change crawl: everything unchanged");

// ── Scenario 4: changed-only (one URL modified, rest untouched) ─────────────
// NEXT.md:51: "Second crawl with a modified page regenerates tests only for
// that URL; untouched pages' approved tests survive unchanged."
const modifiedSnap = { url: "https://example.com/", title: "Home v2", elements: [{ tag: "span", text: "new" }] };
const unchangedSnap = { url: "https://example.com/keep", title: "Keep", elements: [] };
const mixedPrev = {
  "https://example.com/": { fingerprint: buildPageFingerprint(home) },
  "https://example.com/keep": { fingerprint: buildPageFingerprint(unchangedSnap) },
};
const mixed = diffCrawlSnapshots(mixedPrev, [modifiedSnap, unchangedSnap]);
assert.deepEqual(mixed.changedOnlyPages, ["https://example.com/"], "only the modified URL is in changedOnly");
assert.deepEqual(mixed.unchangedPages, ["https://example.com/keep"], "untouched URL stays in unchanged");
assert.deepEqual(mixed.changedPages, ["https://example.com/"], "changedPages scopes regen to just the modified URL");

// ── Scenario 5: added + removed in same crawl ───────────────────────────────
// NEXT.md:52: "Pages removed from the site are surfaced in the run response".
const addRemovePrev = {
  "https://example.com/old": { fingerprint: "old-fp" },
};
const addRemove = diffCrawlSnapshots(addRemovePrev, [home]);
assert.deepEqual(addRemove.addedPages, ["https://example.com/"]);
assert.deepEqual(addRemove.removedPages, ["https://example.com/old"]);
assert.deepEqual(addRemove.unchangedPages, []);

// ── Scenario 6: empty current crawl against populated baseline ──────────────
// Every previous URL should land in removedPages (no snapshots = everything gone).
const allRemoved = diffCrawlSnapshots(previous, []);
assert.equal(allRemoved.removedPages.length, 3, "empty crawl + populated baseline → every URL removed");
assert.equal(allRemoved.changedPages.length, 0);
assert.equal(allRemoved.unchangedPages.length, 0);

// ── Scenario 7: fingerprint stability across invocations ────────────────────
// buildPageFingerprint must be deterministic — same snapshot → same fingerprint.
// This is what makes the baseline comparison work across crawls.
assert.equal(buildPageFingerprint(home), buildPageFingerprint({ ...home }), "fingerprint is deterministic");

// ── Scenario 8: fingerprintOf override (AUTO-002b state-mode integration) ─────
// State mode (in `backend/src/crawler.js`) keys baselines by a composite
// `originalUrl#fp=<fingerprint>` so distinct states at the same URL (login
// blank vs login with errors) track as separate rows. To prevent the
// composite URL from feeding back into `fingerprintState()`'s URL-derived
// hash (which would falsely flip every re-crawl to "changed"), the caller
// passes a `fingerprintOf` override that pulls a pre-computed fingerprint
// off the snapshot. This scenario verifies the override path; the full
// composite-key integration is exercised in `crawler.js` directly.

// Snapshots carry a pre-computed fingerprint via `_stateFp`. The override
// trusts the caller — it does NOT re-hash from `snap.elements`.
const stateA = { url: "key-a", _stateFp: "fp-a", elements: [{ tag: "input" }] };
const stateB = { url: "key-b", _stateFp: "fp-b", elements: [{ tag: "input" }, { tag: "div" }] };
const fpOverride = { fingerprintOf: (s) => s._stateFp };

// First crawl — both states are added (no baseline).
const overrideFirst = diffCrawlSnapshots({}, [stateA, stateB], fpOverride);
assert.equal(overrideFirst.addedPages.length, 2, "fingerprintOf: both states added on first crawl");
assert.equal(overrideFirst.fingerprints["key-a"], "fp-a", "fingerprintOf: caller-supplied fingerprint flows into result");
assert.equal(overrideFirst.fingerprints["key-b"], "fp-b");

// Second crawl with the same pre-computed fingerprints — no change.
// This is the critical regression case: without the override, the default
// `buildPageFingerprint(stateA)` would re-hash from `stateA.url` and
// produce a different fingerprint than `"fp-a"`, so the diff would
// (incorrectly) classify the URL as "changed".
const overrideBaseline = {
  "key-a": { fingerprint: "fp-a" },
  "key-b": { fingerprint: "fp-b" },
};
const overrideNoChange = diffCrawlSnapshots(overrideBaseline, [stateA, stateB], fpOverride);
assert.deepEqual(overrideNoChange.changedPages, [], "fingerprintOf no-change: changedPages is empty");
assert.equal(overrideNoChange.unchangedPages.length, 2, "fingerprintOf no-change: both states unchanged");

// Third crawl — stateB's pre-computed fingerprint changes (state mutated).
const stateBmutated = { url: "key-b", _stateFp: "fp-b-v2", elements: [{ tag: "input" }, { tag: "span" }] };
const overrideDelta = diffCrawlSnapshots(overrideBaseline, [stateA, stateBmutated], fpOverride);
assert.deepEqual(overrideDelta.changedOnlyPages, ["key-b"], "fingerprintOf: only the changed state is in changedOnly");
assert.deepEqual(overrideDelta.unchangedPages, ["key-a"], "fingerprintOf: untouched state stays unchanged");

// Default behaviour (no override) is still URL-derived — link-crawl mode
// is unaffected by the new opts parameter.
const defaultDiff = diffCrawlSnapshots(samePrev, sameSnapshots);
assert.deepEqual(defaultDiff.changedPages, [], "default fingerprint path: no regression for link-crawl mode");

console.log("crawl-diff.test.js passed");
