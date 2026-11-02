import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const ORIGIN = 'https://nikuhkid.github.io';
const KEY = 'test-host-key-for-local-tests-only-1234567890x';
function inbox(socket) {
  const messages = [], waiting = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = waiting.shift(); if (waiter) waiter(message); else messages.push(message);
  });
  socket.accept();
  return async () => messages.length ? messages.shift() : Promise.race([
    new Promise(resolve => waiting.push(resolve)),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Relay message timeout')), 3000); timer.unref(); })
  ]);
}

test('relay authenticates the host, checks browser origin, assigns ownership, routes privately, and closes clients with the host', { timeout: 20000 }, async t => {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: ['index.js', 'browser-relay.js'].map(name => ({ type: 'ESModule', path: resolve('worker', name) })), compatibilityDate: '2026-11-02',
    durableObjects: { BROWSER_RELAY: { className: 'BrowserRelay', useSQLite: true } },
    bindings: { FRONTEND_ORIGIN: ORIGIN, BROWSER_HOST_KEY: KEY }
  }));
  t.after(() => runtime.dispose());
  const request = (path, headers = {}) => runtime.dispatchFetch(`https://relay.example/browser/${path}`, { headers: { upgrade: 'websocket', ...headers } });
  assert.equal((await request('host', { 'x-projlib-host-key': 'wrong' })).status, 401);
  assert.equal((await request('connect', { origin: 'https://other.example' })).status, 403);
  assert.equal((await request('connect', { origin: ORIGIN })).status, 503);
  const hostResponse = await request('host', { 'x-projlib-host-key': KEY });
  assert.equal(hostResponse.status, 101);
  const host = hostResponse.webSocket, nextHost = inbox(host);
  assert.equal((await nextHost()).role, 'host');
  assert.deepEqual(await (await runtime.dispatchFetch('https://relay.example/browser/health')).json(), { online: true });
  assert.equal((await request('host', { 'x-projlib-host-key': KEY })).status, 409);
  const first = (await request('connect', { origin: ORIGIN })).webSocket, nextFirst = inbox(first);
  assert.equal((await nextFirst()).role, 'client');
  const firstJoin = await nextHost();
  const second = (await request('connect', { origin: ORIGIN })).webSocket, nextSecond = inbox(second);
  await nextSecond(); const secondJoin = await nextHost();
  assert.notEqual(firstJoin.clientId, secondJoin.clientId);
  first.send(JSON.stringify({ type: 'navigate', clientId: secondJoin.clientId, url: 'https://example.com/' }));
  const incoming = await nextHost();
  assert.equal(incoming.clientId, firstJoin.clientId);
  host.send(JSON.stringify({ type: 'message', clientId: firstJoin.clientId, message: { type: 'private', value: 'first visitor' } }));
  host.send(JSON.stringify({ type: 'message', clientId: secondJoin.clientId, message: { type: 'private', value: 'second visitor' } }));
  assert.equal((await nextFirst()).value, 'first visitor');
  assert.equal((await nextSecond()).value, 'second visitor');
  const closed = new Promise(resolve => first.addEventListener('close', resolve, { once: true }));
  host.close(1000, 'Test finished.');
  assert.equal((await closed).code, 1012);
});
