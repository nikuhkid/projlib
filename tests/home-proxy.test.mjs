import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { WebSocket, WebSocketServer } from 'ws';
import { checkPassword, passwordRecord, issueSession, verifySession, HOME_SESSION_MS } from '../server/home-auth.mjs';
import { createHomeGateway } from '../server/home-gateway.mjs';
import { createRewriteRuntime } from './rewrite-runtime.mjs';
import { startHomeHost } from '../server/home-host.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('home verification has an absolute twelve-hour lifetime, rejects tampering, and is revoked by a password change', async () => {
  const record = await passwordRecord('fixture-password');
  assert(await checkPassword('fixture-password', record));
  assert.equal(await checkPassword('wrong-password', record), false);
  const issued = issueSession(record, 1000);
  assert.equal(issued.expiresAt, 1000 + HOME_SESSION_MS);
  assert(verifySession(issued.token, record, issued.expiresAt - 1));
  assert.equal(verifySession(issued.token, record, issued.expiresAt), null);
  assert.equal(verifySession(issued.token + 'x', record, 1000), null);
  assert.equal(verifySession(issued.token, await passwordRecord('replacement-password'), 1000), null);
});

test('home gateway authenticates before egress and preserves forms, cookies, gzip, ranges and WebSocket traffic', async t => {
  const fixture = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    if (request.url === '/gzip') { response.writeHead(200, { 'content-encoding': 'gzip' }); response.end(gzipSync('decoded response')); return; }
    response.writeHead(request.headers.range ? 206 : 200, { 'set-cookie': ['a=1; HttpOnly', 'b=2'], 'content-type': 'application/json' });
    response.end(JSON.stringify({ body: Buffer.concat(chunks).toString(), cookie: request.headers.cookie, authorization: request.headers.authorization, host: request.headers.host, bridge: request.headers['x-projlib-bridge'] }));
  });
  const echoes = new WebSocketServer({ server: fixture });
  echoes.on('connection', socket => socket.on('message', (message, binary) => socket.send(message, { binary })));
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  let current = await passwordRecord('fixture-password');
  let clock = Date.now();
  let destinations = 0;
  const gateway = createHomeGateway({ bridgeKey: 'private-bridge', getPassword: () => current, now: () => clock,
    resolveHost: async () => { destinations++; return { address: '127.0.0.1', family: 4 }; },
    makeHttpRequest: (options, callback) => http.request({ ...options, port: fixture.address().port }, callback),
    makeHttpsRequest: (options, callback) => http.request({ ...options, port: fixture.address().port }, callback),
    makeWebSocket: (_url, protocols, options) => new WebSocket(`ws://127.0.0.1:${fixture.address().port}/socket`, protocols, options)
  });
  const server = http.createServer((request, response) => gateway.handle(request, response));
  server.on('upgrade', gateway.upgrade); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { gateway.close(); echoes.close(); server.closeAllConnections(); fixture.closeAllConnections(); await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => fixture.close(resolve))]); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'x-projlib-bridge': 'private-bridge' }, body: JSON.stringify({ password: 'fixture-password' }) });
  assert.equal(login.status, 200); const grant = await login.json();
  const headers = { 'x-projlib-bridge': 'private-bridge', 'x-projlib-home-session': grant.token };
  const send = async (url, method = 'GET', body, virtual = {}) => fetch(base + '/fetch', { method: 'POST', headers: { ...headers, 'x-projlib-request': encodeURIComponent(JSON.stringify({ url, method, headers: virtual })) }, body });
  const form = await send('https://fixture.test/form', 'POST', 'a=1&b=2', { Cookie: 'virtual=1', Authorization: 'Bearer virtual', 'x-projlib-bridge': 'must-not-leak' });
  assert.equal(form.status, 200);
  assert.deepEqual(JSON.parse(decodeURIComponent(form.headers.get('x-projlib-response'))).headers['set-cookie'], ['a=1; HttpOnly', 'b=2']);
  assert.deepEqual(await form.json(), { body: 'a=1&b=2', cookie: 'virtual=1', authorization: 'Bearer virtual', host: 'fixture.test' });
  assert.equal(await (await send('https://fixture.test/gzip')).text(), 'decoded response');
  const range = await send('https://fixture.test/form', 'GET', undefined, { Range: 'bytes=0-8' });
  assert.equal(JSON.parse(decodeURIComponent(range.headers.get('x-projlib-response'))).status, 206); await range.body.cancel();
  const before = destinations;
  assert.equal((await send('http://127.0.0.1/')).status, 400); assert.equal(destinations, before);
  const client = new WebSocket(base.replace('http:', 'ws:') + '/socket', { headers });
  await once(client, 'open'); client.send(JSON.stringify({ url: 'wss://fixture.test/socket', protocols: ['echo'], headers: {} }));
  const [opened] = await once(client, 'message'); assert.equal(JSON.parse(opened).type, 'open');
  client.send(Buffer.from([1, 2, 3])); const [echoed, binary] = await once(client, 'message'); assert(binary); assert.deepEqual([...echoed], [1, 2, 3]);
  const ended = once(client, 'close'); gateway.revoke(); await ended;
  const nearExpiry = issueSession(current, clock - HOME_SESSION_MS + 150);
  const expiring = new WebSocket(base.replace('http:', 'ws:') + '/socket', { headers: { ...headers, 'x-projlib-home-session': nearExpiry.token } });
  const expiredConnection = once(expiring, 'close');
  await once(expiring, 'open');
  assert.equal((await expiredConnection)[0], 1008);
  clock = grant.expiresAt;
  assert.equal((await send('https://fixture.test/form')).status, 401);
  current = await passwordRecord('replacement-password');
  assert.equal((await fetch(base + '/auth/status', { headers })).status, 401);
});

test('the local host panel sets a hashed password and rejects requests from other origins', async t => {
  const directory = await mkdtemp(resolve('.local/home-control-test-'));
  const host = await startHomeHost({ directory, config: { bridgeKey: 'fixture-bridge' } });
  t.after(async () => {
    await host.close();
    assert(directory.startsWith(resolve('.local') + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const state = await (await fetch(host.url + 'status')).json();
  assert.equal(state.passwordSet, false);
  const body = JSON.stringify({ password: 'local-fixture-password' });
  const headers = { origin: new URL(host.url).origin, 'x-projlib-control': state.csrf };
  assert.equal((await fetch(host.url + 'password', { method: 'POST', headers: { ...headers, origin: 'https://unrelated.example' }, body })).status, 403);
  assert.equal((await fetch(host.url + 'password', { method: 'POST', headers, body })).status, 200);
  const saved = await readFile(resolve(directory, 'config.json'), 'utf8');
  assert(!saved.includes('local-fixture-password'));
  assert(await checkPassword('local-fixture-password', JSON.parse(saved).password));
  assert.equal((await (await fetch(host.url + 'status')).json()).running, false);
});

test('Worker defaults to Cloudflare and gates home routing behind a private, fixed-expiry cookie', async t => {
  const runtime = await createRewriteRuntime({ home: true }); t.after(() => runtime.dispose());
  await runtime.ready;
  const origin = 'https://gateway.test';
  const control = (action, cookie = '', body) => runtime.dispatchFetch(`${origin}/rewrite/home/${action}`, {
    method: body ? 'POST' : 'GET', headers: { origin, cookie }, body: body ? JSON.stringify(body) : undefined
  });
  const transport = (cookie = '', method = 'GET', body) => runtime.dispatchFetch(`${origin}/rewrite/fetch`, { method: 'POST',
    headers: { origin, cookie, 'x-projlib-request': encodeURIComponent(JSON.stringify({ url: 'https://fixture.test/api', method, headers: {} })) }, body });
  assert.equal((await (await control('status')).json()).authorized, false);
  assert.equal((await (await transport()).json()).message, 'Dynamic fetch worked');
  assert.equal((await control('login', '', { password: 'incorrect' })).status, 401);
  const login = await control('login', '', { password: 'fixture-password' });
  assert.equal(login.status, 200);
  const grant = await login.json(); assert(grant.expiresAt > Date.now() + HOME_SESSION_MS - 5000);
  const set = login.headers.get('set-cookie'); assert.match(set, /HttpOnly/); assert.match(set, /Secure/); assert.match(set, /Partitioned/);
  const cookie = [...set.matchAll(/projlib_home_(?:grant|route)=[^; ,]+/g)].map(match => match[0]).join('; ');
  assert.equal((await (await control('status', cookie)).json()).expiresAt, grant.expiresAt);
  assert.deepEqual(await (await transport(cookie, 'POST', 'original-body')).json(), { egress: 'home', method: 'POST', body: 'original-body' });
  const socketResponse = await runtime.dispatchFetch(`${origin}/rewrite/socket`, { headers: { origin, cookie, upgrade: 'websocket' } });
  assert.equal(socketResponse.status, 101);
  const socket = socketResponse.webSocket;
  socket.accept();
  const opened = new Promise(resolve => socket.addEventListener('message', event => resolve(JSON.parse(event.data)), { once: true }));
  socket.send(JSON.stringify({ url: 'wss://fixture.test/socket', protocols: ['echo'], headers: {} }));
  assert.equal((await opened).type, 'open');
  const echo = new Promise(resolve => socket.addEventListener('message', event => resolve(event.data), { once: true }));
  socket.send('home websocket'); assert.equal(await echo, 'home websocket'); socket.close(1000);
  const expired = cookie.replace('fixture.token', 'expired.token');
  const fallback = await transport(expired, 'POST', 'not-replayed-at-home');
  assert.equal(fallback.status, 200); assert.equal((await fallback.json()).body, 'not-replayed-at-home');
  assert.match(fallback.headers.get('set-cookie'), /Max-Age=0/);
  const logout = await control('logout', cookie, {}); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
