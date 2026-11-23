import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { passwordRecord, HOME_SESSION_MS } from '../../../server/home-auth.mjs';
import { createVmSessions } from '../relay/session.mjs';

test('direct Wolfie VM relay authenticates once, retains its deadline, filters packets and revokes connections', async () => {
  let origin, clock = Date.now(), received = 0, helpers = 0;
  let record = await passwordRecord('isolated-fixture-password');
  const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(upstream, 'listening');
  upstream.on('connection', socket => socket.on('message', data => { received++; socket.send(data); }));
  const sessions = createVmSessions({ getOrigin: () => origin, getPassword: () => record, now: () => clock,
    createHelper: async () => {
      helpers++;
      const socket = new WebSocket(`ws://127.0.0.1:${upstream.address().port}/`);
      await once(socket, 'open');
      return { socket, close: () => socket.terminate() };
    }
  });
  const server = http.createServer((request, response) => sessions.handle(request, response));
  server.on('upgrade', (request, socket, head) => sessions.upgrade(request, socket, head));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const control = (action, body, cookie, requestOrigin = origin) => fetch(`${origin}/browser-vm/auth/${action}`, {
    method: action === 'status' ? 'GET' : 'POST', headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const connect = cookie => new WebSocket(origin.replace('http:', 'ws:') + '/browser-vm/network', { headers: { origin, ...(cookie ? { cookie } : {}) } });
  const denied = async cookie => {
    const client = connect(cookie);
    const response = await new Promise(resolve => {
      client.once('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode); });
      client.once('error', () => resolve(0));
    });
    client.terminate(); client.on('error', () => {});
    assert.equal(response, 401);
  };
  let client;
  try {
    await denied(); assert.equal(helpers, 0);
    assert.equal((await control('login', { password: 'isolated-fixture-password' }, null, 'https://other.test')).status, 403);
    assert.equal((await control('login', { password: 'wrong-password' })).status, 401);
    const login = await control('login', { password: 'isolated-fixture-password' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=43200/);
    const initial = await login.json(); assert.equal(initial.expiresAt, clock + HOME_SESSION_MS);
    clock += 60000;
    const status = await control('status', null, cookie);
    assert.equal(status.headers.get('set-cookie'), null);
    assert.equal((await status.json()).expiresAt, initial.expiresAt);
    client = connect(cookie); await once(client, 'open');
    const packet = Buffer.alloc(4 + 14 + 40); packet.writeUInt32BE(54); packet.writeUInt16BE(0x0800, 16);
    packet[18] = 0x45; packet.writeUInt16BE(40, 20); packet[27] = 6;
    Buffer.from([192, 168, 127, 3]).copy(packet, 30); Buffer.from([93, 184, 215, 14]).copy(packet, 34);
    packet.writeUInt16BE(40000, 38); packet.writeUInt16BE(443, 40); packet[50] = 0x50;
    const echo = once(client, 'message'); client.send(packet);
    assert.deepEqual((await echo)[0], packet); assert.equal(received, 1);
    const forbidden = Buffer.from(packet); Buffer.from([127, 0, 0, 1]).copy(forbidden, 34);
    client.send(forbidden); client.send(packet);
    await once(client, 'message'); assert.equal(received, 2);
    const ended = once(client, 'close');
    await control('logout', {}, cookie); await ended;
    assert.equal(helpers, 1);
    record = await passwordRecord('changed-fixture-password');
    await denied(cookie);
    clock = initial.expiresAt + 1;
    assert.equal((await (await control('status', null, cookie)).json()).authorized, false);
  } finally {
    client?.terminate(); sessions.close();
    for (const socket of upstream.clients) socket.terminate();
    await new Promise(resolve => upstream.close(resolve));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
