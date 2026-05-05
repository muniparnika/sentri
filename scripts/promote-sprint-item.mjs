#!/usr/bin/env node
import fs from "node:fs";
const [,, prNumber, nextItemId] = process.argv;
if (!prNumber || !nextItemId) {
  console.error("Usage: node scripts/promote-sprint-item.mjs <prNumber> <nextItemId>");
  process.exit(1);
}
for (const f of ["NEXT.md","ROADMAP.md","docs/changelog.md"]) {
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, "utf8");
  t += `\n<!-- promoted by script for PR #${prNumber}; next=${nextItemId} -->\n`;
  fs.writeFileSync(f, t);
}
console.log(`Promoted sprint tracker for PR #${prNumber} (next ${nextItemId})`);
