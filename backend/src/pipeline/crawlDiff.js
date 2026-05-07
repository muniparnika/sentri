import { fingerprintState } from "./stateFingerprint.js";

export function buildPageFingerprint(snapshot) {
  return fingerprintState(snapshot);
}

export function diffCrawlSnapshots(previousByUrl, currentSnapshots) {
  const currentByUrl = new Map();
  for (const snapshot of currentSnapshots || []) {
    currentByUrl.set(snapshot.url, buildPageFingerprint(snapshot));
  }

  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];

  for (const [url, fingerprint] of currentByUrl.entries()) {
    const prev = previousByUrl[url];
    if (!prev) {
      added.push(url);
      continue;
    }
    if (prev.fingerprint === fingerprint) unchanged.push(url);
    else changed.push(url);
  }

  for (const url of Object.keys(previousByUrl || {})) {
    if (!currentByUrl.has(url)) removed.push(url);
  }

  return {
    changedPages: [...added, ...changed],
    addedPages: added,
    changedOnlyPages: changed,
    removedPages: removed,
    unchangedPages: unchanged,
    fingerprints: Object.fromEntries(currentByUrl),
  };
}
