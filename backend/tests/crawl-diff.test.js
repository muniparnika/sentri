import assert from "node:assert/strict";
import { diffCrawlSnapshots, buildPageFingerprint } from "../src/pipeline/crawlDiff.js";

const home = { url: "https://example.com/", title: "Home", elements: [] };
const aboutOld = { url: "https://example.com/about", title: "About", elements: [] };

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

assert.ok(diff.changedPages.includes("https://example.com/new"));
assert.ok(diff.removedPages.includes("https://example.com/removed"));
assert.ok(diff.unchangedPages.includes("https://example.com/"));
assert.ok(diff.changedOnlyPages.includes("https://example.com/about"));

console.log("crawl-diff.test.js passed");
