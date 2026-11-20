import http from 'node:http';
import https from 'node:https';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { WebSocket, WebSocketServer } from 'ws';
import { websiteUrl, resolvePublicHost } from './network-guard.mjs';
import { checkPassword, issueSession, sameSecret, verifySession } from './home-auth.mjs';

const MAX_BODY = 16 * 1024 * 1024;
const MAX_META = 60000;
const MAX_RESPONSE_HEADERS = 64 * 1024;
const EXCLUDED = /^(host|connection|upgrade|keep-alive|te|trailer|transfer-encoding|content-length|accept-encoding|proxy-.*|cf-.*|x-forwarded-.*|forwarded|sec-websocket-.*|x-projlib-.*)$/i;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export async function readBody(request, limit = MAX_BODY) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function outgoingHeaders(values, target) {
  const headers = { host: target.host, 'accept-encoding': 'identity' };
  for (const [name, value] of Object.entries(values || {})) {
    if (!EXCLUDED.test(name)) headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

export function createHomeGateway({ bridgeKey, getPassword, blockedHosts = [], resolveHost = resolvePublicHost, now = Date.now,
  makeHttpRequest = http.request, makeHttpsRequest = https.request, makeWebSocket = (...args) => new WebSocket(...args) }) {
  const sockets = new Set();
  const forbiddenHosts = new Set(blockedHosts.filter(Boolean).map(host => host.toLowerCase().replace(/\.$/, '')));
  const pending = new Set();
  const attempts = new Map();
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 1048576, perMessageDeflate: false });
  let passwordChecks = 0;

  function session(request) {
    return verifySession(request.headers['x-projlib-home-session'], getPassword(), now());
  }
  function trusted(request) {
    return sameSecret(request.headers['x-projlib-bridge'], bridgeKey);
  }
  function revoke() {
    for (const socket of sockets) socket.terminate();
    for (const cancel of pending) cancel();
  }

  async function handle(request, response) {
    if (!trusted(request)) return json(response, 403, { error: 'Gateway authorization required.' });
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/auth/login' && request.method === 'POST') {
      const key = String(request.headers['x-projlib-client'] || 'gateway');
      const previous = attempts.get(key);
      const attempt = previous && previous.until > now() ? previous : { count: 0, until: now() + 300000 };
      if (attempt.count >= 5 || passwordChecks >= 2) return json(response, 429, { error: 'Wait a few minutes before trying the host password again.' });
      if (attempts.size >= 512) attempts.delete(attempts.keys().next().value);
      attempts.set(key, attempt);
      attempt.count++;
      passwordChecks++;
      try {
        const { password } = JSON.parse((await readBody(request, 4096)).toString());
        const record = getPassword();
        if (!await checkPassword(password, record) || getPassword() !== record) return json(response, 401, { error: 'Incorrect host password.' });
        attempts.delete(key);
        return json(response, 200, issueSession(record, now()));
      } catch { return json(response, 400, { error: 'A valid host password is required.' }); }
      finally { passwordChecks--; }
    }
    const grant = session(request);
    if (!grant) return json(response, 401, { error: 'Verify the host password to use Wolfie for 12 hours.' });
    if (path === '/auth/status' && request.method === 'GET') return json(response, 200, { expiresAt: grant.expiresAt });
    if (path !== '/fetch' || request.method !== 'POST') return json(response, 404, { error: 'Unknown gateway route.' });
    if (pending.size >= 64) return json(response, 503, { error: 'The host has too many pending requests.' });
    let upstream;
    let expiryTimer;
    let headerTimer;
    const cancel = () => { upstream?.destroy(); response.destroy(); };
    pending.add(cancel);
    const cleanup = () => {
      clearTimeout(expiryTimer); clearTimeout(headerTimer); pending.delete(cancel);
    };
    response.once('close', () => { upstream?.destroy(); cleanup(); });
    try {
      const raw = request.headers['x-projlib-request'];
      if (!raw || raw.length > MAX_META) throw new Error('Invalid request metadata.');
      const metadata = JSON.parse(decodeURIComponent(raw));
      if (!METHODS.has(metadata.method)) throw new Error('Unsupported request method.');
      const target = websiteUrl(metadata.url);
      if (forbiddenHosts.has(target.hostname.replace(/\.$/, ''))) throw new Error('The host gateway cannot proxy itself.');
      const pinned = await resolveHost(target.hostname);
      const body = await readBody(request);
      if (grant.expiresAt <= now() || !session(request)) return json(response, 401, { error: 'Home verification expired.' });
      const makeRequest = target.protocol === 'https:' ? makeHttpsRequest : makeHttpRequest;
      upstream = makeRequest({ hostname: pinned.address, family: pinned.family, port: target.protocol === 'https:' ? 443 : 80,
        servername: target.hostname, path: target.pathname + target.search, method: metadata.method,
        headers: outgoingHeaders(metadata.headers, target), maxHeaderSize: MAX_RESPONSE_HEADERS, agent: false }, result => {
        clearTimeout(headerTimer);
        const headers = { ...result.headers };
        let stream = result;
        const decompress = { gzip: createGunzip, br: createBrotliDecompress, deflate: createInflate }[headers['content-encoding']];
        if (decompress) { stream = result.pipe(decompress()); delete headers['content-encoding']; }
        delete headers['content-length']; delete headers.connection; delete headers['transfer-encoding'];
        const encoded = encodeURIComponent(JSON.stringify({ status: result.statusCode, statusText: result.statusMessage, headers }));
        if (encoded.length > MAX_META) { result.destroy(); return json(response, 502, { error: 'Destination headers are too large.' }); }
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'x-projlib-response': encoded, 'cache-control': 'no-store' });
        stream.on('error', () => response.destroy());
        result.on('error', () => response.destroy());
        stream.pipe(response);
      });
      headerTimer = setTimeout(() => upstream.destroy(new Error('Destination timed out.')), 30000);
      expiryTimer = setTimeout(cancel, Math.max(1, grant.expiresAt - now()));
      upstream.once('error', () => {
        if (!response.headersSent) json(response, 502, { error: 'The destination could not be reached.' });
        else response.destroy();
      });
      upstream.end(['GET', 'HEAD'].includes(metadata.method) ? undefined : body);
    } catch (error) { json(response, 400, { error: error.message }); cleanup(); }
  }

  function upgrade(request, socket, head) {
    const grant = trusted(request) && session(request);
    if (!grant || request.url !== '/socket') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return;
    }
    websocketServer.handleUpgrade(request, socket, head, client => {
      sockets.add(client);
      let upstream;
      let started = false;
      const timer = setTimeout(() => client.close(1008, 'Home verification expired'), Math.max(1, grant.expiresAt - now()));
      const handshake = setTimeout(() => client.close(1008, 'Handshake timed out'), 20000);
      const close = (peer, code = 1000, reason = '') => {
        try { peer?.close(code === 1000 || code >= 3000 ? code : 1000, String(reason).slice(0, 80)); } catch { peer?.terminate(); }
      };
      client.on('message', async (data, binary) => {
        if (started) {
          if (upstream?.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 2097152) return close(client, 1008, 'Destination is unavailable');
          upstream.send(data, { binary }); return;
        }
        started = true;
        try {
          if (binary || data.length > MAX_META) throw new Error('Invalid handshake');
          const metadata = JSON.parse(data.toString());
          const destination = new URL(metadata.url);
          if (!['ws:', 'wss:'].includes(destination.protocol)) throw new Error('Invalid WebSocket destination');
          const target = websiteUrl(destination.href.replace(/^ws/, 'http'));
          if (forbiddenHosts.has(target.hostname.replace(/\.$/, ''))) throw new Error('The host gateway cannot proxy itself.');
          const pinned = await resolveHost(target.hostname);
          if (client.readyState !== WebSocket.OPEN || !session(request)) return close(client, 1008, 'Home verification expired');
          upstream = makeWebSocket(destination.href, metadata.protocols || [], {
            headers: outgoingHeaders(metadata.headers, target), servername: target.hostname,
            lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
            maxPayload: 1048576, perMessageDeflate: false, handshakeTimeout: 30000
          });
          upstream.on('open', () => {
            clearTimeout(handshake);
            if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'open', protocol: upstream.protocol }));
            else close(upstream);
          });
          upstream.on('message', (message, isBinary) => {
            if (client.readyState !== WebSocket.OPEN || client.bufferedAmount > 2097152) return close(upstream, 1008, 'Viewer is unavailable');
            client.send(message, { binary: isBinary });
          });
          upstream.on('close', (code, reason) => close(client, code, reason));
          upstream.on('error', () => close(client, 1011, 'Destination connection failed'));
        } catch { close(client, 1008, 'Destination is unavailable'); }
      });
      client.on('error', () => close(upstream));
      client.on('close', () => { clearTimeout(timer); clearTimeout(handshake); sockets.delete(client); close(upstream); });
    });
  }
  return { handle, upgrade, revoke, close() { revoke(); websocketServer.close(); } };
}
