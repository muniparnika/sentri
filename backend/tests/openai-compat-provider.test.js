import test from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimitError, isTransientServerError } from '../src/aiProvider.js';

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
