import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { passwordRecord } from '../../server/home-auth.mjs';
import { createVmSessions } from './relay/session.mjs';
import { startNativeHelper } from './relay/helper.mjs';

export async function serveProbe(engineDirectory, port = 0, { relayExecutable, now = Date.now } = {}) {
  const engine = await realpath(engineDirectory);
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const roots = { '/engine/': engine, '/guest/': resolve(directory, 'desktop'), '/vendor/novnc/': resolve(directory, '.local/viewer'), '/vendor/xterm/': resolve(directory, 'node_modules/@xterm/xterm'),
    '/vendor/pty/': resolve(directory, 'node_modules/xterm-pty'), '/': resolve(directory, 'probe') };
  const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
  const labPassword = relayExecutable ? randomBytes(32).toString('hex') : null;
  const record = labPassword ? await passwordRecord(labPassword) : null;
  let sessions;
  const server = http.createServer(async (request, response) => {
    response.setHeader('cross-origin-opener-policy', 'same-origin');
    response.setHeader('cross-origin-embedder-policy', 'require-corp');
    response.setHeader('cross-origin-resource-policy', 'same-origin');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    try {
      if (request.headers.host !== `127.0.0.1:${server.address().port}`) {
        response.writeHead(403); response.end(); return;
      }
      if (sessions && await sessions.handle(request, response)) return;
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(403); response.end(); return; }
      const url = new URL(request.url, 'http://localhost');
      const prefix = Object.keys(roots).find(value => url.pathname.startsWith(value));
      const root = await realpath(roots[prefix]);
      const path = await realpath(resolve(root, '.' + sep + decodeURIComponent(url.pathname.slice(prefix.length) || 'index.html')));
      if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
      const info = await stat(path);
      if (!info.isFile()) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'content-length': info.size });
      if (request.method === 'HEAD') response.end();
      else createReadStream(path).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  if (relayExecutable) {
    sessions = createVmSessions({ getOrigin: () => `http://127.0.0.1:${server.address().port}`, getPassword: () => record, now,
      createHelper: () => startNativeHelper(resolve(relayExecutable)) });
    server.on('upgrade', (request, socket, head) => {
      if (request.headers.host !== `127.0.0.1:${server.address().port}` || !sessions.upgrade(request, socket, head)) socket.destroy();
    });
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/`, labPassword, relayStatistics: () => sessions?.statistics() || null, close: async () => {
    sessions?.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass the candidate engine directory.');
  const server = await serveProbe(process.argv[2], Number(process.argv[3] || 0));
  console.log(server.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(); });
}
