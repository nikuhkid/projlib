import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export async function createRewriteRuntime() {
  const root = resolve('.local/rewrite-assets');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
  const runtime = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: '2026-11-02', port: 0,
    workers: [{
      name: 'gateway',
      modules: ['index.js', 'browser-relay.js', 'frame-protocol.js', 'rewrite-gateway.js', 'targets.js'].map(name => ({ type: 'ESModule', path: resolve('worker', name) })),
      bindings: { FRONTEND_ORIGIN: 'http://127.0.0.1:4173' }, outboundService: 'fixture',
      serviceBindings: { ASSETS: async request => {
        const url = new URL(request.url);
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
