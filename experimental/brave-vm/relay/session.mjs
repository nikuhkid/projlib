import { WebSocket, WebSocketServer } from 'ws';
import { checkPassword, issueSession, verifySession } from '../../../server/home-auth.mjs';
import { readBody } from '../../../server/home-gateway.mjs';
import { QemuWebFilter } from './ethernet.mjs';

const COOKIE = 'projlib_brave_grant';
const PREFIX = '/browser-vm/';

export function createVmSessions({ getOrigin, getPassword, createHelper, blockedAddresses = new Set(), now = Date.now }) {
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  const clients = new Map(), attempts = new Map();
  let checks = 0;
  const traffic = { connections: 0, helperStarts: 0, fromGuestBytes: 0, toGuestBytes: 0, allowedFrames: 0, blockedFrames: 0 };
  const token = request => (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  const grant = request => verifySession(token(request), getPassword(), now());
  const json = (response, code, value, session) => {
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    if (session !== undefined) headers['set-cookie'] = `${COOKIE}=${session?.token || ''}; Path=${PREFIX}; HttpOnly; SameSite=Strict; Max-Age=${session ? Math.max(0, Math.floor((session.expiresAt - now()) / 1000)) : 0}${new URL(getOrigin()).protocol === 'https:' ? '; Secure' : ''}`;
    response.writeHead(code, headers); response.end(JSON.stringify(value));
  };
  function revoke(id) { for (const [client, session] of clients) if (!id || id === session.id) client.terminate(); }

  async function handle(request, response) {
    const path = new URL(request.url, getOrigin()).pathname;
    if (!path.startsWith(PREFIX + 'auth/')) return false;
    if (request.method === 'GET' && path === PREFIX + 'auth/status') {
      const current = grant(request);
      json(response, 200, { authorized: Boolean(current), expiresAt: current?.expiresAt || 0 }); return true;
    }
    if (request.method !== 'POST' || request.headers.origin !== getOrigin()) {
      json(response, 403, { error: 'Open this control from the Wolfie browser page.' }); return true;
    }
    if (path === PREFIX + 'auth/logout') {
      const current = grant(request); if (current) revoke(current.id);
      json(response, 200, { authorized: false, expiresAt: 0 }, null); return true;
    }
    if (path !== PREFIX + 'auth/login') { json(response, 404, { error: 'Unknown control.' }); return true; }
    const key = request.socket.remoteAddress;
    const previous = attempts.get(key);
    const attempt = previous && previous.until > now() ? previous : { count: 0, until: now() + 300000 };
    if (attempt.count >= 5 || checks >= 2) { json(response, 429, { error: 'Wait before trying the host password again.' }); return true; }
    if (attempts.size >= 512) attempts.delete(attempts.keys().next().value);
    attempts.set(key, attempt); attempt.count++; checks++;
    try {
      const { password } = JSON.parse((await readBody(request, 4096)).toString());
      const record = getPassword();
      if (!record || !await checkPassword(password, record) || getPassword() !== record) {
        json(response, 401, { error: 'Incorrect host password.' }); return true;
      }
      attempts.delete(key);
      const session = issueSession(record, now());
      json(response, 200, { authorized: true, expiresAt: session.expiresAt }, session);
    } catch { json(response, 400, { error: 'A valid host password is required.' }); }
    finally { checks--; }
    return true;
  }

  function upgrade(request, socket, head) {
    const path = new URL(request.url, getOrigin()).pathname;
    if (path !== PREFIX + 'network') return false;
    const current = request.headers.origin === getOrigin() && grant(request);
    if (!current || !createHelper) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return true; }
    websocket.handleUpgrade(request, socket, head, async client => {
      traffic.connections++;
      clients.set(client, current);
      const record = getPassword();
      const filter = new QemuWebFilter({ blockedAddresses });
      let helper, closed = false, ending = false, queued = [], size = 0;
      const end = (reason = 'Wolfie relay disconnected.') => {
        if (ending) return;
        ending = true; queued = []; size = 0; helper?.close();
        if (client.readyState === WebSocket.OPEN) client.close(1008, reason);
        setTimeout(() => client.terminate(), 1000).unref();
      };
      const timer = setTimeout(() => end('Verify the host password again.'), Math.max(1, current.expiresAt - now()));
      const validity = setInterval(() => { if (getPassword() !== record || current.expiresAt <= now()) end('Host verification ended.'); }, 5000);
      client.on('error', () => end());
      client.once('close', () => { closed = true; clearTimeout(timer); clearInterval(validity); clients.delete(client); queued = []; helper?.close(); });
      client.on('message', (data, binary) => {
        if (ending) return;
        if (!binary) return end('Binary guest traffic is required.');
        try {
          traffic.fromGuestBytes += data.length;
          const previousBlocked = filter.blocked;
          const packets = filter.push(data);
          traffic.blockedFrames += filter.blocked - previousBlocked;
          traffic.allowedFrames += packets.length;
          for (const packet of packets) {
            if (!helper) {
              size += packet.length;
              if (size > 1024 * 1024) return end('The relay is not ready.');
              queued.push(packet);
            } else {
              if (helper.socket.readyState !== WebSocket.OPEN || helper.socket.bufferedAmount > 2097152) return end('The relay cannot keep up.');
              helper.socket.send(packet);
            }
          }
        } catch { end('Invalid guest network traffic.'); }
      });
      try {
        helper = await createHelper();
        traffic.helperStarts++;
        if (closed || ending) { helper.close(); return; }
        if (getPassword() !== record || current.expiresAt <= now()) return end('Host verification ended.');
        helper.socket.on('message', (data, binary) => {
          if (!binary || client.readyState !== WebSocket.OPEN) return;
          if (client.bufferedAmount > 2097152) return end('The browser cannot keep up.');
          traffic.toGuestBytes += data.length;
          client.send(data, { binary: true });
        });
        helper.socket.on('error', () => end());
        helper.socket.once('close', () => end());
        for (const packet of queued) helper.socket.send(packet);
        queued = []; size = 0;
      } catch { end('The native Wolfie relay is unavailable.'); }
    });
    return true;
  }
  return { handle, upgrade, revoke, statistics: () => ({ ...traffic, clients: clients.size }), close() { revoke(); websocket.close(); } };
}
