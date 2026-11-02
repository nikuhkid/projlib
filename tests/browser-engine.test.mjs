import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { BrowserEngine } from '../server/browser-engine.mjs';
import { createNetworkGuard } from '../server/network-guard.mjs';

test('real sandboxed Chromium keeps login cookies and storage private, streams frames, validates controls, and expires sessions', { timeout: 90000 }, async t => {
  const fixture = http.createServer((request, response) => {
    if (request.url === '/login' && request.method === 'POST') {
      request.resume(); response.writeHead(303, { location: '/account', 'set-cookie': 'session=fixture-only; HttpOnly; Path=/; SameSite=Lax' }); response.end(); return;
    }
    const signedIn = request.headers.cookie?.includes('session=fixture-only');
    response.setHeader('content-type', 'text/html');
    response.end(`<html><head><title>${signedIn ? 'Signed in' : 'Sign in'}</title></head><body><h1>${signedIn ? 'Private account' : 'Sign in'}</h1><form method="post" action="/login"><input name="user" aria-label="User"><button>Sign in</button></form><script>localStorage.setItem('visited','yes')</script></body></html>`);
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  t.after(() => new Promise(resolve => fixture.close(resolve)));
  const engine = new BrowserEngine({ disconnectMs: 100, guardFactory: () => createNetworkGuard({
    resolveHost: async host => { assert.equal(host, 'fixture.test'); return { address: '127.0.0.1', family: 4 }; },
    makeRequest: (options, callback) => http.request({ ...options, port: fixture.address().port }, callback)
  }) });
  t.after(() => engine.close());
  const credentials = await engine.create('http://fixture.test/');
  const first = engine.get(credentials.sessionId, credentials.sessionToken);
  assert.throws(() => engine.get(first.id, 'wrong-capability-wrong-capability'));
  const frames = [];
  const unsubscribe = engine.subscribe(first, () => {}, frame => frames.push(frame));
  const page = first.pages.get(first.active).page;
  await page.getByLabel('User').fill('fixture-user');
  await Promise.all([page.waitForURL('**/account'), engine.action(first, { type: 'key', key: 'Enter' })]);
  assert.equal(await page.title(), 'Signed in');
  await engine.action(first, { type: 'reload' });
  assert.equal(await page.title(), 'Signed in');
  await engine.action(first, { type: 'navigate', url: 'http://fixture.test/account' });
  assert.equal(await page.title(), 'Signed in');
  const secondCredentials = await engine.create('http://fixture.test/account');
  const second = engine.get(secondCredentials.sessionId, secondCredentials.sessionToken);
  const unsubscribeSecond = engine.subscribe(second, () => {}, () => {});
  const secondPage = second.pages.get(second.active).page;
  assert.equal(await secondPage.title(), 'Sign in');
  await page.evaluate(() => localStorage.setItem('secret', 'first visitor only'));
  assert.equal(await secondPage.evaluate(() => localStorage.getItem('secret')), null);
  await assert.rejects(engine.action(first, { type: 'navigate', url: 'http://127.0.0.1/' }));
  await assert.rejects(engine.action(first, { type: 'navigate', url: 'file:///C:/Windows/win.ini' }));
  await assert.rejects(engine.action(first, { type: 'key', key: 'Control+O' }));
  await assert.rejects(engine.action(first, { type: 'evaluate', expression: 'process.exit()' }));
  const frame = frames[0] || await Promise.race([once(first.events, 'frame').then(([frame]) => frame), new Promise((_, reject) => setTimeout(() => reject(new Error('No screencast frame')), 5000))]);
  assert.equal(Buffer.from(frame.data, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
  unsubscribeSecond(); unsubscribe();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(engine.sessions.size, 0);
  assert.throws(() => engine.get(credentials.sessionId, credentials.sessionToken));
});
