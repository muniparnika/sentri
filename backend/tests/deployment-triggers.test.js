import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { app } from "../src/middleware/appSetup.js";
import triggerRouter from "../src/routes/trigger.js";

let mounted = false;
if (!mounted) {
  app.use("/api", triggerRouter);
  mounted = true;
}

function sign(algo, body, secret) {
  return crypto.createHmac(algo, secret).update(body).digest("hex");
}

async function main() {
  process.env.VERCEL_WEBHOOK_SECRET = "vercel-secret";
  process.env.NETLIFY_WEBHOOK_SECRET = "netlify-secret";

  const server = createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const vercelBody = JSON.stringify({ deployment: { url: "my-app-preview.vercel.app" } });
    const vercelSig = sign("sha1", vercelBody, process.env.VERCEL_WEBHOOK_SECRET);
    let res = await fetch(`${base}/api/projects/PRJ-1/trigger/vercel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vercel-Signature": vercelSig },
      body: vercelBody,
    });
    assert.equal(res.status, 200);
    let json = await res.json();
    assert.equal(json.previewUrl, "https://my-app-preview.vercel.app");

    res = await fetch(`${base}/api/projects/PRJ-1/trigger/vercel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vercel-Signature": "bad" },
      body: vercelBody,
    });
    assert.equal(res.status, 401);

    const netlifyBody = JSON.stringify({ deploy_ssl_url: "https://deploy-preview.netlify.app" });
    const netlifySig = sign("sha256", netlifyBody, process.env.NETLIFY_WEBHOOK_SECRET);
    res = await fetch(`${base}/api/projects/PRJ-1/trigger/netlify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Netlify-Token": netlifySig },
      body: netlifyBody,
    });
    assert.equal(res.status, 200);
    json = await res.json();
    assert.equal(json.previewUrl, "https://deploy-preview.netlify.app");

    res = await fetch(`${base}/api/projects/PRJ-1/trigger/netlify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: netlifyBody,
    });
    assert.equal(res.status, 401);

    console.log("deployment-triggers.test.js passed");
  } finally {
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
