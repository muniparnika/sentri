import { execSync } from "node:child_process";
execSync("node scripts/promote-sprint-item.mjs 999 AUTO-017.3", { stdio: "pipe" });
console.log("ok");
