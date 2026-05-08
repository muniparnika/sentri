import test from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimitError, isTransientServerError } from '../src/aiProvider.js';
import { validateUrl } from '../src/utils/ssrfGuard.js';

// ── Error classification (shared retry/circuit-breaker semantics) ────────────

test('classifies auth errors as non-rate-limit/non-5xx', () => {
  const err = new Error('Unauthorized');
  err.status = 401;
  assert.equal(isRateLimitError(err), false);
  assert.equal(isTransientServerError(err), false);
});

test('classifies rate limits', () => {
  const err = new Error('Too many requests');
  err.status = 429;
  assert.equal(isRateLimitError(err), true);
});

test('classifies 5xx as transient', () => {
  const err = new Error('Service unavailable');
  err.status = 503;
  assert.equal(isTransientServerError(err), true);
});

// ── SSRF rejection at config time (NEXT.md AI-001 acceptance criteria) ───────

test('SSRF guard rejects loopback baseUrl', async () => {
  const err = await validateUrl('http://127.0.0.1:8000/v1');
  assert.ok(err, 'expected loopback URL to be rejected');
  assert.match(err, /private|reserved/i);
});

test('SSRF guard rejects private RFC1918 baseUrl', async () => {
  const err = await validateUrl('http://10.0.0.5/v1');
  assert.ok(err, 'expected RFC1918 URL to be rejected');
});

test('SSRF guard rejects link-local metadata baseUrl', async () => {
  const err = await validateUrl('http://169.254.169.254/latest/meta-data/');
  assert.ok(err, 'expected link-local URL to be rejected');
});

test('SSRF guard rejects non-http(s) protocols', async () => {
  const err = await validateUrl('file:///etc/passwd');
  assert.ok(err);
  assert.match(err, /http or https/i);
});

test('SSRF guard rejects localhost hostname', async () => {
  const err = await validateUrl('http://localhost:8000/v1');
  assert.ok(err);
});

// ── Compat slot detection (provider id shape) ────────────────────────────────

test('compat provider id shape: starts with "compat:" and has a slot id', () => {
  // Mirrors isCompatProvider() in aiProvider.js / apiKeyRepo.js.
  const isCompat = (p) => typeof p === 'string' && p.startsWith('compat:') && p.length > 'compat:'.length;
  assert.equal(isCompat('compat:deepseek'), true);
  assert.equal(isCompat('compat:groq'), true);
  assert.equal(isCompat('compat:'), false);
  assert.equal(isCompat('openai'), false);
  assert.equal(isCompat(null), false);
});
