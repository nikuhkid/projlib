import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker, { validateTarget, proxyUrl, rewriteCss } from '../worker/index.js';

const origin = 'https://projlib-proxy.example.net';
const requests = [];
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: ['index.js', 'browser-relay.js', 'frame-protocol.js'].map(name => ({ type: 'ESModule', path: resolve('worker', name) })),
  compatibilityDate: '2026-11-02',
  bindings: { FRONTEND_ORIGIN: 'https://nikuhkid.github.io' },
  outboundService: async request => {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname === '/redirect') return new Response(null, { status: 302, headers: { location: '/next?q=yes' } });
    if (url.pathname === '/bad-redirect') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
    if (url.pathname === '/style.css') return new Response('a{background:url(/image.png)} @import "./other.css";', { headers: { 'content-type': 'text/css' } });
    if (url.pathname === '/api') return Response.json({ method: request.method, body: request.method === 'POST' ? await request.text() : null });
    if (url.pathname === '/base') return new Response('<html><head><base href="https://cdn.example.com/files/"></head><body><img src="photo.png"></body></html>', { headers: { 'content-type': 'text/html' } });
    if (url.pathname === '/empty') return new Response(null, { status: 204 });
    if (url.pathname === '/fragment') return new Response('<h1>HTML fragment</h1><a href="/next">Next</a>', { headers: { 'content-type': 'text/html' } });
    if (url.pathname === '/failure') return new Response('Upstream unavailable', { status: 503 });
    return new Response('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src none"><style>body{background:url(./bg.png)}</style></head><body><a href="/next?q=one&amp;x=two" target="_top">Next</a><img src="image.png" srcset="small.png 1x, large.png 2x"><link rel="stylesheet" href="/style.css" integrity="sha256-old"><form action="/send" method="post"><button>Send</button></form></body></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'set-cookie': 'secret=value' }
    });
  }
}));
after(() => runtime.dispose());
const fetchProxy = (path, init) => runtime.dispatchFetch(`${origin}/proxy/https://example.com${path}`, init);

test('only public HTTP(S) destinations and standard ports are accepted', () => {
  assert.equal(validateTarget('https://example.com/path', origin).hostname, 'example.com');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/',
    'http://2130706433/', 'http://[::1]/', 'https://private.local/', 'http://localhost./', 'https://private.internal./', 'https://example.com:8080/',
    'https://user:pass@example.com/', `${origin}/proxy/https://example.com`]) {
    assert.throws(() => validateTarget(url, origin), undefined, url);
  }
});

test('URL rewriting preserves relative paths, queries, fragments, and special URLs', () => {
  const base = 'https://example.com/folder/page';
  assert.equal(proxyUrl('../next?q=1#part', base, origin), `${origin}/proxy/https://example.com/next?q=1#part`);
  assert.equal(proxyUrl('//cdn.example.com/a.js', base, origin), `${origin}/proxy/https://cdn.example.com/a.js`);
  assert.equal(proxyUrl(`${origin}/proxy/https://example.com/a`, base, origin), `${origin}/proxy/https://example.com/a`);
  for (const value of ['#here', 'data:image/png;base64,AA', 'mailto:hi@example.com', 'blob:https://example.com/id']) {
    assert.equal(proxyUrl(value, base, origin), value);
  }
  assert.match(rewriteCss('@import "./other.css";a{background:url(../bg.png)}', base, origin), /\/proxy\/https:\/\/example.com\/bg.png/);
});

test('the real Workers HTMLRewriter rewrites assets, navigation, CSS, forms and embedding policy', async () => {
  const response = await fetchProxy('/folder/page');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-frame-options'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors https:\/\/nikuhkid.github.io/);
  const html = await response.text();
  assert.match(html, /href="https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/next\?q=one&amp;x=two"/);
  assert.match(html, /src="https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/folder\/image.png"/);
  assert.match(html, /action="https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/send"/);
  assert.match(html, /small.png 1x, https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/folder\/large.png 2x/);
  assert.match(html, /url\(https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/folder\/bg.png\)/);
  assert.match(html, /target="_self"/);
  assert.doesNotMatch(html, /integrity=|http-equiv="Content-Security-Policy"/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Script(script));
});

test('existing HTML base URLs resolve assets against the destination base', async () => {
  const html = await (await fetchProxy('/base')).text();
  assert.match(html, /src="https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/cdn.example.com\/files\/photo.png"/);
  assert.match(html, /<base href="https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/cdn.example.com\/files\/"/);
});

test('HTML fragments still include navigation reporting and rewritten links', async () => {
  const html = await (await fetchProxy('/fragment')).text();
  assert.match(html, /projlib:navigation/);
  assert.match(html, /href="https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/next"/);
});

test('redirects stay on the proxy and private redirect destinations are rejected', async () => {
  const response = await fetchProxy('/redirect', { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${origin}/proxy/https://example.com/next?q=yes`);
  assert.equal((await fetchProxy('/bad-redirect')).status, 502);
});

test('CSS responses rewrite imports and root-relative image URLs', async () => {
  const css = await (await fetchProxy('/style.css')).text();
  assert.match(css, /url\(https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/image.png\)/);
  assert.match(css, /@import "https:\/\/projlib-proxy.example.net\/proxy\/https:\/\/example.com\/other.css"/);
});

test('POST forms and request ranges work without forwarding visitor credentials', async () => {
  const response = await fetchProxy('/api', { method: 'POST', body: 'q=hello', headers: {
    'content-type': 'application/x-www-form-urlencoded', cookie: 'visitor=secret', authorization: 'Bearer secret', 'x-forwarded-for': '192.0.2.10', range: 'bytes=0-99'
  } });
  assert.deepEqual(await response.json(), { method: 'POST', body: 'q=hello' });
  const upstream = requests.at(-1);
  for (const name of ['cookie', 'authorization', 'x-forwarded-for']) assert.equal(upstream.headers.get(name), null);
  assert.equal(upstream.headers.get('range'), 'bytes=0-99');
});

test('destinations receive the real browser identity without fabricated brands or device hints', async () => {
  const profiles = [
    {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="143", "Google Chrome";v="143"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    },
    { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0' },
    { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
  ];
  for (const profile of profiles) {
    const response = await fetchProxy('/api', { headers: profile });
    assert.equal(response.status, 200);
    const upstream = requests.at(-1);
    assert.equal(upstream.url, 'https://example.com/api');
    for (const name of ['user-agent', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']) {
      assert.equal(upstream.headers.get(name), profile[name] || null, name);
    }
  }
});

test('health checks, CORS preflights, bodyless responses, and error pages behave correctly', async () => {
  assert.deepEqual(await (await runtime.dispatchFetch(`${origin}/health`)).json(), { service: 'projlib-proxy', status: 'ok' });
  const preflight = await fetchProxy('/api', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.equal((await fetchProxy('/empty')).status, 204);
  assert.equal((await runtime.dispatchFetch(`${origin}/proxy/http://127.0.0.1/`)).status, 400);
  assert.equal((await fetchProxy('/api', { method: 'DELETE' })).status, 405);
  assert.equal((await fetchProxy('/failure')).status, 503);
});

test('network failures return a readable 502 response', async context => {
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Connection failed'); });
  const response = await worker.fetch(new Request(`${origin}/proxy/https://example.com/`), {});
  assert.equal(response.status, 502);
  assert.match(await response.text(), /destination is unavailable/);
});
