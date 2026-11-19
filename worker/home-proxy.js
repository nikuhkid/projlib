const GRANT = 'projlib_home_grant';
const ROUTE = 'projlib_home_route';
const HOURS = 12 * 60 * 60;

function value(request, name) {
  const item = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='));
  return item ? item.slice(name.length + 1) : '';
}
function configured(env) {
  return Boolean(env.HOME_PROXY_ORIGIN && env.HOME_GATEWAY_KEY);
}
function cookie(request, name, content, seconds = HOURS) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${name}=${content}; Path=/rewrite/; Max-Age=${seconds}; HttpOnly; ${secure ? 'Secure; SameSite=None; Partitioned' : 'SameSite=Lax'}`;
}
function routingCookie(response, request, route, clear = false) {
  const result = new Response(response.body, response);
  result.headers.append('set-cookie', cookie(request, ROUTE, route));
  if (clear) result.headers.append('set-cookie', cookie(request, GRANT, '', 0));
  return result;
}
function result(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}
async function controlBody(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new Error('Control request is too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function headers(request, env) {
  return new Headers({ 'x-projlib-bridge': env.HOME_GATEWAY_KEY,
    'x-projlib-home-session': value(request, GRANT),
    'x-projlib-client': request.headers.get('cf-connecting-ip') || 'gateway' });
}
async function call(request, env, path, options = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30000);
  try {
    return await fetch(new URL(path, env.HOME_PROXY_ORIGIN), { ...options, headers: options.headers || headers(request, env),
      signal: abort.signal, redirect: 'manual' });
  } finally { clearTimeout(timer); }
}
async function state(request, env) {
  const basic = { configured: configured(env), authorized: false, route: 'cloudflare', expiresAt: 0, unavailable: false };
  if (!basic.configured || !value(request, GRANT)) return basic;
  const response = await call(request, env, '/auth/status');
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status !== 401) throw new Error('The home host is unavailable');
    return basic;
  }
  const grant = await response.json();
  if (!Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= Date.now()) return basic;
  return { ...basic, authorized: true, expiresAt: grant.expiresAt,
    route: value(request, ROUTE) === 'home' ? 'home' : 'cloudflare' };
}

export async function homeControl(request, env) {
  const url = new URL(request.url);
  const action = url.pathname.slice('/rewrite/home/'.length);
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return result({ error: 'Open this control from ProjLib.' }, 403);
  if (action === 'logout' && request.method === 'POST') return routingCookie(result({ configured: configured(env), authorized: false, route: 'cloudflare', expiresAt: 0, unavailable: false }), request, 'cloudflare', true);
  try {
    if (action === 'status' && request.method === 'GET') return result(await state(request, env));
    if (action === 'route' && request.method === 'POST') {
      const { route } = await controlBody(request);
      if (!['cloudflare', 'home'].includes(route)) return result({ error: 'Choose an available proxy.' }, 400);
      if (route === 'cloudflare') return routingCookie(result({ configured: configured(env), route }), request, route);
      const current = await state(request, env);
      if (!current.authorized) return result({ error: 'Verify the host password first.' }, 401);
      return routingCookie(result({ ...current, route }), request, route);
    }
    if (!configured(env)) return result({ error: 'The home host is not connected yet.' }, 503);
    if (action === 'login' && request.method === 'POST') {
      const body = await controlBody(request);
      if (typeof body.password !== 'string' || body.password.length > 256) return result({ error: 'Enter the host password.' }, 400);
      const upstream = await call(request, env, '/auth/login', { method: 'POST', body: JSON.stringify({ password: body.password }) });
      if (!upstream.ok) return result(await upstream.json(), upstream.status);
      const grant = await upstream.json();
      if (!/^[\w-]+\.[\w-]+$/.test(grant.token) || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= Date.now() || grant.expiresAt > Date.now() + HOURS * 1000 + 1000) throw new Error('Invalid host session');
      const response = result({ configured: true, authorized: true, route: 'home', expiresAt: grant.expiresAt });
      response.headers.append('set-cookie', cookie(request, GRANT, grant.token, Math.max(1, Math.floor((grant.expiresAt - Date.now()) / 1000))));
      response.headers.append('set-cookie', cookie(request, ROUTE, 'home'));
      return response;
    }
    return result({ error: 'Unknown home control.' }, 404);
  } catch {
    if (action === 'status') return result({ configured: configured(env), authorized: false, route: 'cloudflare', expiresAt: 0, unavailable: true });
    return result({ error: 'Wolfie is unavailable. The Cloudflare proxy is available.' }, 503);
  }
}

export async function withHomeTransport(request, env, fallback) {
  if (!configured(env) || value(request, ROUTE) !== 'home' || !value(request, GRANT)) return fallback();
  const socket = new URL(request.url).pathname.endsWith('/socket');
  const outgoing = headers(request, env);
  if (socket) outgoing.set('upgrade', 'websocket');
  else if (request.headers.has('x-projlib-request')) outgoing.set('x-projlib-request', request.headers.get('x-projlib-request'));
  try {
    const response = await call(request, env, socket ? '/socket' : '/fetch', {
      method: request.method, headers: outgoing, body: socket ? undefined : request.body
    });
    if (response.status === 401) {
      await response.body?.cancel();
      return routingCookie(await fallback(), request, 'cloudflare', true);
    }
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('Unexpected home redirect'); }
    if (response.status === 403 || response.status >= 500) return routingCookie(response, request, 'cloudflare');
    if (socket && response.status === 101) return new Response(null, { status: 101, webSocket: response.webSocket });
    const selected = new Headers(response.headers);
    selected.delete('set-cookie');
    selected.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, headers: selected });
  } catch {
    // The host might already have submitted a form. Switch future requests without replaying it.
    return routingCookie(result({ error: 'The home connection failed. Cloudflare is selected for the next request.' }, 502), request, 'cloudflare');
  }
}
