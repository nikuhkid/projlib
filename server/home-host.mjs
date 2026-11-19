import http from 'node:http';
import https from 'node:https';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createHomeGateway, readBody } from './home-gateway.mjs';
import { passwordRecord, sameSecret } from './home-auth.mjs';
import { upnpBridge } from './home-upnp.mjs';

export async function startHomeHost({ directory = resolve('.local/home-host'), adminPort = 0, config: supplied, autoStart = false } = {}) {
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, 'config.json');
  let config = supplied;
  if (!config) {
    try { config = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      config = { hostname: 'nikuhkid.ddns.net', port: 8443, bridgeKey: randomBytes(32).toString('hex'),
        python: 'C:/Program Files/RemmieHost/runtime/python.exe',
        certificate: 'C:/ProgramData/RemmieHost/direct.local/certificates/certificates/acme-v02.api.letsencrypt.org-directory/nikuhkid.ddns.net/nikuhkid.ddns.net' };
    }
  }
  async function save(value) {
    await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await rename(path + '.tmp', path);
    config = value;
  }
  await save(config);
  const gateway = createHomeGateway({ bridgeKey: config.bridgeKey, getPassword: () => config.password, blockedHosts: [config.hostname] });
  const csrf = randomBytes(32).toString('hex');
  const instance = randomBytes(16).toString('hex');
  let server, router, renewal, stopping;
  let errorMessage = '';
  let busy = false;
  const description = 'ProjLib home proxy ' + randomBytes(8).toString('hex');

  async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      clearTimeout(renewal);
      gateway.revoke();
      if (server) { const current = server; server = null; current.closeAllConnections(); await new Promise(resolve => current.close(resolve)); }
      if (router) {
        const current = router; router = null;
        try { await current.call({ action: 'remove', port: config.port, description }); }
        finally { current.close(); }
      }
    })();
    try { await stopping; } finally { stopping = null; }
  }

  async function start() {
    if (server) return;
    if (!config.password) throw new Error('Set the host password first.');
    errorMessage = '';
    router = upnpBridge(config.python);
    try {
      const network = await router.call({ action: 'discover', hostname: config.hostname });
      if (!network.dns.includes(network.external)) throw new Error('No-IP and the router public address disagree.');
      if (await router.call({ action: 'read', port: config.port })) throw new Error('The requested port already belongs to another router mapping.');
      server = https.createServer({ key: await readFile(config.certificate + '.key'), cert: await readFile(config.certificate + '.crt'), maxHeaderSize: 65536 },
        (request, response) => gateway.handle(request, response).catch(() => { response.destroy(); }));
      server.on('upgrade', gateway.upgrade);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, network.address, resolve); });
      await router.call({ action: 'map', port: config.port, description, lease: 900 });
      let failures = 0;
      const renew = async () => {
        try {
          if (!router || !server) return;
          await router.call({ action: 'map', port: config.port, description, lease: 900 });
          const [key, cert] = await Promise.all([readFile(config.certificate + '.key'), readFile(config.certificate + '.crt')]);
          server?.setSecureContext({ key, cert });
          if (!router || !server) return;
          failures = 0; errorMessage = '';
          renewal = setTimeout(renew, 300000);
        } catch (error) {
          errorMessage = error.message;
          failures++;
          if (error.message.includes('belongs to another')) { await stop(); return; }
          if (router && server) {
            router.close(); router = upnpBridge(config.python);
            renewal = setTimeout(renew, Math.min(60000, 5000 * 2 ** Math.min(failures, 3)));
          }
        }
      };
      renewal = setTimeout(renew, 300000);
    } catch (error) { errorMessage = error.message; await stop(); throw error; }
  }

  const panel = await readFile(new URL('./home-panel.html', import.meta.url));
  const admin = http.createServer(async (request, response) => {
    const host = request.headers.host;
    const own = `127.0.0.1:${admin.address().port}`;
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
    if (host !== own) return send(403, { error: 'Open the control panel on its loopback address.' });
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      response.end(panel); return;
    }
    if (request.method === 'GET' && request.url === '/status') return send(200, { service: 'ProjLib Host', instance, csrf, running: Boolean(server), passwordSet: Boolean(config.password), error: errorMessage });
    if (request.method !== 'POST' || request.headers.origin !== `http://${own}` || !sameSecret(request.headers['x-projlib-control'], csrf)) return send(403, { error: 'Control panel authorization required.' });
    if (busy) return send(409, { error: 'A host operation is already in progress.' });
    busy = true;
    try {
      if (request.url === '/password') {
        const body = JSON.parse((await readBody(request, 4096)).toString());
        await save({ ...config, password: await passwordRecord(body.password) });
        gateway.revoke();
      } else if (request.url === '/start') { await save({ ...config, enabled: true }); await start(); }
      else if (request.url === '/stop') { await save({ ...config, enabled: false }); await stop(); }
      else return send(404, { error: 'Unknown control.' });
      send(200, { ok: true });
    } catch (error) { send(400, { error: error.message }); }
    finally { busy = false; }
  });
  await new Promise(resolve => admin.listen(adminPort, '127.0.0.1', resolve));
  if (autoStart && config.enabled && config.password) { try { await start(); } catch { /* error is available in the control panel */ } }
  return { url: `http://127.0.0.1:${admin.address().port}/`, instance,
    async close() { try { await stop(); } finally { gateway.close(); await new Promise(resolve => admin.close(resolve)); } } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.env.PROJLIB_HOME_DIR || resolve('.local/home-host');
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, 'host.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error('Inspect the invalid host lock before starting.');
    try { process.kill(owner, 0); throw new Error('ProjLib Host is already running.'); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    await unlink(lockPath); lock = await open(lockPath, 'wx');
  }
  await lock.writeFile(String(process.pid));
  const host = await startHomeHost({ directory, autoStart: process.argv.includes('--auto-start') });
  await writeFile(resolve(directory, 'runtime.json'), JSON.stringify({ pid: process.pid, url: host.url, instance: host.instance }));
  console.log(`ProjLib Host control panel: ${host.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    try { await host.close(); }
    finally { await lock.close(); await unlink(lockPath).catch(() => {}); process.exit(0); }
  });
}
