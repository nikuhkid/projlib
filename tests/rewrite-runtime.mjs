import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

export async function createRewriteRuntime({ home = false, adblockFixture = false } = {}) {
  const root = resolve('.local/rewrite-assets');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
  let fixtureFilters, fixtureManifest;
  if (adblockFixture) {
    const filters = JSON.parse(await readFile(resolve(root, 'rewrite/adblock/vendor/filters.json'), 'utf8'));
    filters.lists.push({ name: 'Controlled browser test rules', firstParty: true, permissions: 0, text: [
      'fixture.test##.projlib-ad-test', '##.projlib-generic-ad',
      'fixture.test##.projlib-procedural:has-text(SPONSORED TEST):remove()',
      'fixture.test##+js(set-constant, projlibAdFixture, true)',
      '||fixture.test/adblock/tracker$xmlhttprequest', '@@||fixture.test/adblock/tracker-allowed$xmlhttprequest',
      '||fixture.test/adblock/socket-blocked$websocket'
    ].join('\n') });
    fixtureFilters = JSON.stringify(filters);
    const manifest = JSON.parse(await readFile(resolve(root, 'rewrite/adblock/vendor/manifest.json'), 'utf8'));
    manifest.files['filters.json'] = createHash('sha256').update(fixtureFilters).digest('hex');
    fixtureManifest = JSON.stringify(manifest);
  }
  const runtime = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: '2026-11-02', port: 0,
    workers: [{
      name: 'gateway',
      modules: ['index.js', 'browser-relay.js', 'frame-protocol.js', 'rewrite-gateway.js', 'home-proxy.js', 'targets.js'].map(name => ({ type: 'ESModule', path: resolve('worker', name) })),
      bindings: { FRONTEND_ORIGIN: process.env.PROJLIB_TEST_ORIGIN || 'http://127.0.0.1:4173', ...(home ? { HOME_PROXY_ORIGIN: 'https://home.test', HOME_GATEWAY_KEY: 'fixture-bridge' } : {}) }, outboundService: 'fixture',
      serviceBindings: { ASSETS: async request => {
        const url = new URL(request.url);
        if (adblockFixture && url.pathname === '/rewrite/adblock/vendor/filters.json') return new Response(fixtureFilters, { headers: { 'content-type': 'application/json' } });
        if (adblockFixture && url.pathname === '/rewrite/adblock/vendor/manifest.json') return new Response(fixtureManifest, { headers: { 'content-type': 'application/json' } });
        const path = resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
        if (!path.startsWith(root + sep)) return new Response('Invalid path', { status: 400 });
        try { return new Response(await readFile(path), { headers: { 'content-type': mime[extname(path)] || 'text/plain' } }); }
        catch { return new Response('Not found', { status: 404 }); }
      } }
    }, {
      name: 'fixture', modules: [{ type: 'ESModule', path: resolve('tests/fixtures/rewrite-site.js') }]
    }]
  }));
  await runtime.ready;
  return runtime;
}
