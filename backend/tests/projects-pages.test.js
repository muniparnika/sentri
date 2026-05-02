/**
 * Tests for GET /api/v1/projects/:id/pages — Recorder Start-URL dropdown.
 *
 * Contract:
 *   - Empty crawl history → returns [seed].
 *   - Latest successful crawl with pages → returns [seed, ...pages] deduped.
 *   - Unknown project id → 404.
 */

import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDatabase } from "../src/database/sqlite.js";
import * as projectRepo from "../src/database/repositories/projectRepo.js";
import * as runRepo from "../src/database/repositories/runRepo.js";
import { generateProjectId, generateRunId } from "../src/utils/idGenerator.js";

function seedProject(url = "https://example.com") {
  const id = generateProjectId();
  projectRepo.create({
    id, name: "P", url, credentials: null,
    createdAt: new Date().toISOString(), status: "idle", workspaceId: null,
  });
  return id;
}

test("GET /projects/:id/pages — empty crawl history returns just the seed URL", async () => {
  resetDatabase();
  const app = await createApp();
  const id = seedProject("https://seed.example");
  const res = await request(app).get(`/api/v1/projects/${id}/pages`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.urls, ["https://seed.example"]);
});

test("GET /projects/:id/pages — latest crawl pages prepended with seed and deduped", async () => {
  resetDatabase();
  const app = await createApp();
  const id = seedProject("https://seed.example");
  runRepo.create({
    id: generateRunId(), projectId: id, type: "crawl", status: "completed",
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    pages: [
      { url: "https://seed.example" }, // dup of seed → deduped
      { url: "https://seed.example/a" },
      { url: "https://seed.example/b" },
      { url: "" }, // filtered
    ],
  });
  const res = await request(app).get(`/api/v1/projects/${id}/pages`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.urls, [
    "https://seed.example",
    "https://seed.example/a",
    "https://seed.example/b",
  ]);
});

test("GET /projects/:id/pages — unknown project id returns 404", async () => {
  resetDatabase();
  const app = await createApp();
  const res = await request(app).get(`/api/v1/projects/PRJ-does-not-exist/pages`);
  assert.equal(res.status, 404);
});
