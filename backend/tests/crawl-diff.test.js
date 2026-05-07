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

// ── Scenario 8: state-explorer composite-key baselines (AUTO-002b) ─────────
// State mode keys baselines by `originalUrl#fp=<fingerprint>` so distinct
// states at the same URL (login blank vs login with errors) are tracked
// as separate rows. The diff function itself doesn't know about composite
// keys — it just keys on `.url`, so this scenario verifies that whatever
// caller-side key strategy is used, the diff logic respects it.
const loginBlank = { url: "https://app.example.com/login", title: "Login", elements: [{ tag: "input", type: "email" }] };
const loginErr = { url: "https://app.example.com/login", title: "Login", elements: [{ tag: "input", type: "email" }, { tag: "div", text: "Invalid password" }] };

// Compose state-mode keys: same URL, different fingerprints → two distinct rows.
const blankKeyed = { ...loginBlank, url: `${loginBlank.url}#fp=${buildPageFingerprint(loginBlank)}` };
const errKeyed = { ...loginErr, url: `${loginErr.url}#fp=${buildPageFingerprint(loginErr)}` };

// First crawl — both states are added.
const stateFirstDiff = diffCrawlSnapshots({}, [blankKeyed, errKeyed]);
assert.equal(stateFirstDiff.addedPages.length, 2, "state mode: both states added on first crawl");
assert.notEqual(blankKeyed.url, errKeyed.url, "composite keys differentiate states at the same base URL");

// Second crawl — same states, no change.
const stateBaseline = {
  [blankKeyed.url]: { fingerprint: buildPageFingerprint(loginBlank) },
  [errKeyed.url]: { fingerprint: buildPageFingerprint(loginErr) },
};
const stateNoChange = diffCrawlSnapshots(stateBaseline, [blankKeyed, errKeyed]);
assert.deepEqual(stateNoChange.changedPages, [], "state mode: no-change crawl returns empty changedPages");
assert.equal(stateNoChange.unchangedPages.length, 2);

// Third crawl — only the error state changed (e.g. error message changed).
const loginErr2 = { url: "https://app.example.com/login", title: "Login", elements: [{ tag: "input", type: "email" }, { tag: "div", text: "Account locked" }] };
const errKeyed2 = { ...loginErr2, url: `${loginErr2.url}#fp=${buildPageFingerprint(loginErr2)}` };
// Note: errKeyed2 has a NEW composite key (different fingerprint) — so it
// looks like an *added* state plus a *removed* state to the diff. This is
// the correct semantics for state mode: a state with new content is a
// new state, and the old fingerprint becomes "removed".
const stateDelta = diffCrawlSnapshots(stateBaseline, [blankKeyed, errKeyed2]);
assert.ok(stateDelta.addedPages.includes(errKeyed2.url), "state mode: state with new content → added");
assert.ok(stateDelta.removedPages.includes(errKeyed.url), "state mode: state with old content → removed");
assert.ok(stateDelta.unchangedPages.includes(blankKeyed.url), "state mode: untouched state stays unchanged");

console.log("crawl-diff.test.js passed");
