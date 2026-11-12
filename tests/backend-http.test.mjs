import assert from 'node:assert/strict';
import test from 'node:test';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const itemId = '5f0e1a20-0000-4000-8000-000000000001';

for (const [method, path] of [
  ['GET', '/api/pantry'],
  ['POST', '/api/pantry'],
  ['PATCH', `/api/pantry/${itemId}`],
  ['DELETE', `/api/pantry/${itemId}`],
  ['POST', '/api/inventory/adjustments'],
  ['GET', '/api/inventory/history'],
  ['GET', '/api/inventory/history?limit=1&limit=2&unknown=true'],
  ['PATCH', '/api/pantry/not-a-uuid'],
]) {
  test(`signed-out ${method} ${path} returns private JSON 401 before input validation`, async () => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      redirect: 'manual',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', origin: 'https://foreign.example' },
      ...(method === 'GET' ? {} : { body: '{malformed' }),
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('location'), null);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.match(response.headers.get('cache-control'), /private/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await response.json(), { error: { code: 'unauthorized', message: 'Sign in to continue.' } });
  });
}

test('unsupported API methods return private JSON without permissive preflight', async () => {
  for (const [method, path] of [['PUT', '/api/pantry'], ['POST', `/api/pantry/${itemId}`], ['GET', '/api/inventory/adjustments'], ['OPTIONS', '/api/inventory/history']]) {
    const response = await fetch(new URL(path, baseUrl), { method, signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 405);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.ok(response.headers.get('allow'));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal((await response.json()).error.code, 'validation');
  }
});
