import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewriteRuntime } from './rewrite-runtime.mjs';

test('rewriting transport preserves virtual credentials and redirects while excluding outer credentials and private targets', async t => {
  const runtime = await createRewriteRuntime();
  t.after(() => runtime.dispose());
  const origin = (await runtime.ready).origin;
  const send = (url, headers = {}, extra = {}) => runtime.dispatchFetch(`${origin}/rewrite/fetch`, {
    method: 'POST', headers: { origin, cookie: 'outer-secret=never-forward', authorization: 'outer-secret',
      'x-projlib-request': encodeURIComponent(JSON.stringify({ url, method: 'GET', headers })), ...extra }
  });
  const response = await send('https://fixture.test/api', { Cookie: 'virtual=value', Authorization: 'Bearer fixture', 'User-Agent': 'Fixture Chrome' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'Dynamic fetch worked', cookie: 'virtual=value', auth: 'Bearer fixture', userAgent: 'Fixture Chrome' });
  const anonymous = await send('https://fixture.test/api');
  const info = await anonymous.json();
  assert.equal(info.cookie, '');
  assert.equal(info.auth, null);
  const redirect = await send('https://fixture.test/redirect');
  const meta = JSON.parse(decodeURIComponent(redirect.headers.get('x-projlib-response')));
  assert.equal(meta.status, 302);
  assert.equal(meta.headers.location, 'https://other.test/account');
  for (const target of ['http://localhost/', 'http://127.0.0.1/', 'https://example.com:8443/', `${origin}/rewrite/config`]) {
    assert.equal((await send(target)).status, 502, target);
  }
  assert.equal((await send('https://fixture.test/', {}, { origin: 'https://unrelated.example' })).status, 403);
  let chunks = 0;
  const oversized = new ReadableStream({ pull(controller) {
    controller.enqueue(new Uint8Array(1024 * 1024));
    if (++chunks === 17) controller.close();
  } });
  const rejected = await runtime.dispatchFetch(`${origin}/rewrite/fetch`, { method: 'POST',
    headers: { origin, 'x-projlib-request': encodeURIComponent(JSON.stringify({ url: 'https://fixture.test/login', method: 'POST', headers: {} })) },
    body: oversized, duplex: 'half'
  });
  assert.equal(rejected.status, 413);
});
