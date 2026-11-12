import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-ts-paths.mjs';
import { z } from 'zod';
const { ApiError, errorResponse, rpcResult, readJson, historyLimit, pantryItemId, privateResponse } = await import('../src/server/api/protocol.ts');

test('RPC business failures preserve status and conflict snapshot; unexpected failures stay generic', async () => {
  for (const [code, status] of [['validation', 422], ['unauthorized', 401], ['not_found', 404], ['conflict', 409]]) {
    const error = { code, message: 'Business failure', ...(code === 'conflict' ? { current: { id: 'owned', quantity: 2, unit: 'item' } } : {}) };
    try {
      rpcResult({ error }, z.strictObject({ ok: z.literal(true) }));
      assert.fail('expected business failure');
    } catch (failure) {
      assert.ok(failure instanceof ApiError);
      const response = errorResponse(failure);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error });
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
  for (const data of [{ error: { code: 'server', message: 'SQL secret' } }, { unexpected: 'SQL secret' }]) {
    assert.throws(() => rpcResult(data, z.strictObject({ ok: z.literal(true) })));
  }
  const response = errorResponse(new Error('SQL secret'));
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /SQL secret/);
  const deleted = privateResponse(null, 204);
  assert.equal(await deleted.text(), '');
  assert.equal(deleted.headers.get('cache-control'), 'private, no-store');
});

test('history accepts only one bounded decimal limit and validates UUIDs before typed RPCs', () => {
  assert.equal(historyLimit('http://localhost/api'), 20);
  assert.equal(historyLimit('http://localhost/api?limit=100'), 100);
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=1e1', 'limit=+2', 'limit=', 'limit=2&limit=3', 'other=1']) {
    assert.throws(() => historyLimit(`http://localhost/api?${query}`), (error) => error.status === 422);
  }
  assert.throws(() => pantryItemId('fixture-id'), (error) => error.status === 404);
  assert.equal(pantryItemId('5f0e1a20-0000-4000-8000-000000000001'), '5f0e1a20-0000-4000-8000-000000000001');
});

test('mutation boundary enforces JSON, origin, body size and shared schema', async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://app.example';
  const schema = z.strictObject({ name: z.string() });
  const request = (body, headers = {}) => new Request('http://internal/api', {
    method: 'POST', body, headers: { 'content-type': 'application/json', origin: 'https://app.example', ...headers },
  });
  try {
    assert.deepEqual(await readJson(request('{"name":"ok"}'), schema), { name: 'ok' });
    assert.deepEqual(await readJson(request('{"name":"ok"}', { 'content-type': 'application/json; charset=utf-8' }), schema), { name: 'ok' });
    for (const req of [request('{'), request('x'.repeat(65537)), request('{}', { origin: 'https://foreign.example' }), request('{}', { origin: 'null' }), request('{}', { 'sec-fetch-site': 'cross-site' }), request('{}', { 'content-type': 'text/plain' })]) {
      await assert.rejects(readJson(req, schema), (error) => error.status === 400);
    }
    await assert.rejects(readJson(request('{}'), schema), (error) => error.status === 422);
    delete process.env.APP_ORIGIN;
    assert.deepEqual(await readJson(new Request('http://localhost:3000/api', { method: 'POST', body: '{"name":"dev"}', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' } }), schema), { name: 'dev' });
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});
