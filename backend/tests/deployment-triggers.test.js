import assert from "node:assert/strict";
import crypto from "node:crypto";

function sign(provider, body, secret) {
  const algo = provider === "vercel" ? "sha1" : "sha256";
  return crypto.createHmac(algo, secret).update(JSON.stringify(body)).digest("hex");
}

const bodyV = { deployment: { url: "my-app-preview.vercel.app" } };
const bodyN = { deploy_ssl_url: "https://deploy-preview.netlify.app" };
const s1 = sign("vercel", bodyV, "abc");
const s2 = sign("netlify", bodyN, "xyz");

assert.equal(typeof s1, "string");
assert.equal(typeof s2, "string");
assert.ok(s1.length > 10);
assert.ok(s2.length > 10);

console.log("deployment-triggers.test.js passed");
