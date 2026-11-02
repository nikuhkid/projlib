import { decodeHostFrame } from './frame-protocol.js';
const MAX_CLIENTS = 8;
const CLIENT_BYTES = 65536;
const HOST_BYTES = 2400000;
const ID = /^[a-f0-9-]{36}$/;

function reply(message, status, origin) {
  return Response.json(message, { status, headers: {
    'cache-control': 'no-store', 'access-control-allow-origin': origin,
    'vary': 'Origin', 'x-content-type-options': 'nosniff'
  } });
}

async function sameSecret(received, expected) {
  if (!received || !expected || received.length > 200) return false;
  const hash = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([hash(received), hash(expected)]);
  const first = new Uint8Array(a), second = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}

export async function browserRequest(request, env) {
  const path = new URL(request.url).pathname;
  const origin = env.FRONTEND_ORIGIN || 'https://nikuhkid.github.io';
  if (!env.BROWSER_RELAY) return reply({ online: false, error: 'Browser sessions are not configured.' }, 503, origin);
  if (path === '/browser/host') {
    if (!await sameSecret(request.headers.get('x-projlib-host-key'), env.BROWSER_HOST_KEY)) return reply({ error: 'Unauthorized' }, 401, origin);
  } else if (path === '/browser/connect') {
    if (request.headers.get('origin') !== origin) return reply({ error: 'Open browser sessions from ProjLib.' }, 403, origin);
  } else if (path !== '/browser/health') return reply({ error: 'Unknown browser path.' }, 404, origin);
  if (request.method !== 'GET') return reply({ error: 'Method not allowed.' }, 405, origin);
  const relay = env.BROWSER_RELAY.get(env.BROWSER_RELAY.idFromName('wolfie'));
  // The object receives a fresh internal request, never caller-selected role headers.
  const headers = new Headers();
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') headers.set('upgrade', 'websocket');
  const response = await relay.fetch(new Request(`https://relay/${path.split('/').at(-1)}`, { headers }));
  if (response.status === 101) return response;
  const output = new Response(response.body, response);
  output.headers.set('access-control-allow-origin', origin);
  output.headers.set('cache-control', 'no-store');
  return output;
}

export class BrowserRelay {
  constructor(ctx) {
    this.ctx = ctx;
    if (typeof WebSocketRequestResponsePair !== 'undefined') ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  sockets(tag) { return this.ctx.getWebSockets(tag).filter(socket => socket.readyState === 1); }
  send(socket, message) { try { socket.send(JSON.stringify(message)); } catch { /* disconnected */ } }
  host() { return this.sockets('host')[0]; }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ online: Boolean(this.host()) }, { headers: { 'cache-control': 'no-store' } });
    if (request.headers.get('upgrade') !== 'websocket') return new Response('WebSocket required.', { status: 426 });
    if (path !== '/host' && path !== '/connect') return new Response('Unknown path.', { status: 404 });
    const role = path === '/host' ? 'host' : 'client';
    if (role === 'host' && this.host()) return new Response('A host is already connected.', { status: 409 });
    if (role === 'client' && !this.host()) return new Response('The browser host is offline.', { status: 503 });
    if (role === 'client' && this.sockets('client').length >= MAX_CLIENTS) return new Response('The browser is busy.', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [role, id]);
    server.serializeAttachment({ role, id });
    this.send(server, { type: 'connected', role });
    if (role === 'client') this.send(this.host(), { type: 'join', clientId: id });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, data) {
    const attachment = socket.deserializeAttachment();
    const { role, id } = attachment;
    if (data === 'ping') { try { socket.send('pong'); } catch {} return; }
    if (role === 'host' && data instanceof ArrayBuffer) {
      try {
        const frame = decodeHostFrame(data);
        const destination = this.sockets(frame.clientId).find(peer => peer.deserializeAttachment()?.role === 'client');
        if (destination) destination.send(frame.data);
      } catch { socket.close(1008, 'Invalid image frame.'); }
      return;
    }
    if (typeof data !== 'string' || data.length > (role === 'host' ? HOST_BYTES : CLIENT_BYTES)) {
      socket.close(1009, 'Message too large.'); return;
    }
    let message;
    try { message = JSON.parse(data); } catch { socket.close(1008, 'Invalid message.'); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) { socket.close(1008, 'Invalid message.'); return; }
    if (role === 'client') {
      if (Date.now() - (attachment.window || 0) >= 1000) { attachment.window = Date.now(); attachment.count = 0; }
      attachment.count = (attachment.count || 0) + 1;
      socket.serializeAttachment(attachment);
      if (attachment.count > 120) { socket.close(1008, 'Too many browser commands.'); return; }
      const host = this.host();
      if (!host) { socket.close(1012, 'Browser host disconnected.'); return; }
      this.send(host, { type: 'message', clientId: id, message });
    } else if (message.type === 'message' && ID.test(message.clientId) && message.message && typeof message.message === 'object') {
      const destination = this.sockets(message.clientId).find(peer => peer.deserializeAttachment()?.role === 'client');
      if (destination) this.send(destination, message.message);
    }
  }
  webSocketClose(socket, code, reason) {
    const { role, id } = socket.deserializeAttachment();
    try { socket.close(code === 1006 ? 1011 : code, reason); } catch {}
    if (role === 'client') { const host = this.host(); if (host) this.send(host, { type: 'leave', clientId: id }); }
    else for (const client of this.sockets('client')) client.close(1012, 'Browser host disconnected.');
  }
  webSocketError(socket) { this.webSocketClose(socket, 1011, 'Connection interrupted.'); }
}
