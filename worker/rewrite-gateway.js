import { validateTarget } from './targets.js';

const MAX_BODY = 16 * 1024 * 1024;
const MAX_META = 60000;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const EXCLUDED = /^(host|connection|upgrade|keep-alive|te|trailer|transfer-encoding|content-length|accept-encoding|proxy-.*|cf-.*|x-forwarded-.*|forwarded|sec-websocket-.*)$/i;

function failure(message, status = 400) {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

function upstreamHeaders(values) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values || {})) {
    if (!EXCLUDED.test(name)) headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  }
  headers.set('accept-encoding', 'identity');
  return headers;
}

function responseMeta(response) {
  const headers = Object.fromEntries(response.headers);
  // A single comma-joined header cannot represent multiple cookies (Expires contains commas).
  const cookies = response.headers.getAll('set-cookie');
  if (cookies.length) headers['set-cookie'] = cookies;
  delete headers['content-encoding'];
  delete headers['content-length'];
  return { status: response.status, statusText: response.statusText, headers };
}

function destination(value, origin, websocket = false) {
  const url = new URL(value);
  if (websocket) {
    if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Use a public WebSocket address.');
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  }
  return validateTarget(url.href, origin);
}

async function readUpload(stream) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(), chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function proxyFetch(request, origin) {
  if (request.method !== 'POST') return failure('Method not allowed.', 405);
  const raw = request.headers.get('x-projlib-request');
  if (!raw || raw.length > MAX_META) return failure('Invalid request metadata.');
  const meta = JSON.parse(decodeURIComponent(raw));
  const target = destination(meta.url, origin);
  if (!METHODS.has(meta.method)) return failure('Unsupported destination method.');
  const bytes = Number(request.headers.get('content-length') || 0);
  if (bytes > MAX_BODY) return failure('Uploads are limited to 16 MiB.', 413);
  const body = await readUpload(request.body);
  if (!body) return failure('Uploads are limited to 16 MiB.', 413);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30000);
  let upstream;
  try {
    upstream = await fetch(target, {
      method: meta.method, headers: upstreamHeaders(meta.headers), redirect: 'manual',
      body: ['GET', 'HEAD'].includes(meta.method) ? undefined : body, signal: abort.signal
    });
  } finally { clearTimeout(timer); }
  const encoded = encodeURIComponent(JSON.stringify(responseMeta(upstream)));
  if (encoded.length > MAX_META) { await upstream.body?.cancel(); return failure('Destination headers are too large.', 502); }
  return new Response(upstream.body, { headers: {
    'content-type': 'application/octet-stream', 'x-projlib-response': encoded,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
  } });
}

function proxySocket(origin) {
  const pair = new WebSocketPair();
  const client = pair[0], relay = pair[1];
  let upstream;
  let started = false;
  relay.accept();
  const close = (socket, code = 1000, reason = '') => {
    try { socket?.close(code === 1005 || code === 1006 ? 1000 : code, reason.slice(0, 30)); } catch { /* already closed */ }
  };
  const timer = setTimeout(() => { close(relay, 1008, 'Handshake timed out'); close(upstream); }, 20000);
  relay.addEventListener('message', async event => {
    if (started) {
      const size = typeof event.data === 'string' ? new TextEncoder().encode(event.data).length : event.data.byteLength;
      if (!upstream || size > 1048576) { close(relay, 1009, 'Message too large or socket not ready'); close(upstream); return; }
      try { upstream.send(event.data); } catch { close(relay, 1011, 'Destination disconnected'); }
      return;
    }
    started = true;
    try {
      if (typeof event.data !== 'string' || event.data.length > MAX_META) throw new Error('Invalid socket metadata');
      const meta = JSON.parse(event.data);
      const target = destination(meta.url, origin, true);
      const headers = upstreamHeaders(meta.headers);
      headers.set('upgrade', 'websocket');
      if (meta.protocols?.length) headers.set('sec-websocket-protocol', meta.protocols.join(', '));
      const response = await fetch(target, { headers, redirect: 'manual' });
      if (response.status !== 101 || !response.webSocket) throw new Error('Destination refused the WebSocket');
      upstream = response.webSocket;
      upstream.accept();
      clearTimeout(timer);
      if (relay.readyState !== 1) { close(upstream); return; }
      upstream.addEventListener('message', message => { try { relay.send(message.data); } catch { close(upstream); } });
      upstream.addEventListener('close', event => close(relay, event.code, event.reason));
      upstream.addEventListener('error', () => close(relay, 1011, 'Destination disconnected'));
      relay.send(JSON.stringify({ type: 'open', protocol: response.headers.get('sec-websocket-protocol') || '' }));
    } catch {
      clearTimeout(timer);
      close(relay, 1011, 'The proxy could not connect to the destination WebSocket.');
      close(upstream);
    }
  });
  relay.addEventListener('close', event => { clearTimeout(timer); close(upstream, event.code, event.reason); });
  relay.addEventListener('error', () => { clearTimeout(timer); close(upstream); });
  return new Response(null, { status: 101, webSocket: client });
}

export async function rewriteRequest(request, env) {
  const url = new URL(request.url);
  const frontend = env.FRONTEND_ORIGIN || 'https://nikuhkid.github.io';
  if (url.pathname === '/rewrite/clear') return new Response('<!doctype html><meta charset="utf-8"><title>ProjLib browsing data cleared</title><p>Proxy browsing data cleared for this Chrome profile. Refresh ProjLib to start again.</p>', { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'clear-site-data': '"storage", "cache", "cookies"', 'content-security-policy': `frame-ancestors ${frontend} 'self'`
  } });
  if (url.pathname === '/rewrite/config') return Response.json({ frontend }, { headers: { 'cache-control': 'no-store' } });
  if (url.pathname === '/rewrite/fetch' || url.pathname === '/rewrite/socket') {
    if (request.headers.get('origin') !== url.origin) return failure('Open the transport from the ProjLib rewriting viewer.', 403);
    try {
      if (url.pathname === '/rewrite/fetch') return await proxyFetch(request, url.origin);
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return failure('WebSocket upgrade required.', 426);
      return proxySocket(url.origin);
    } catch { return failure('The destination is invalid, unavailable, or took too long to respond.', 502); }
  }
  if (!env.ASSETS) return failure('Rewriting assets are not installed.', 503);
  // Virtual page paths must be intercepted by the service worker, never returned as the controller HTML.
  if (url.pathname.startsWith('/rewrite/site/')) return failure('Open this address through the ProjLib viewer to start its service worker.', 409);
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', `frame-ancestors ${frontend} 'self'; frame-src 'self' blob: data:; object-src 'none'`);
  return new Response(response.body, { status: response.status, headers });
}
