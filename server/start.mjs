import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { RelayHost } from './relay-host.mjs';

const directory = resolve('.local');
const keyPath = resolve(directory, 'browser-host-key');
const stopPath = resolve(directory, 'browser-host.stop');
await mkdir(directory, { recursive: true });
if (process.argv.includes('--stop')) {
  const pid = (await readFile(resolve(directory, 'browser-host.lock'), 'utf8')).trim();
  await writeFile(stopPath, pid);
  console.log('Requested a graceful stop of the ProjLib browser host.');
} else if (process.argv.includes('--init')) {
  try { await writeFile(keyPath, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  console.log('Host key is ready in the ignored .local directory.');
} else {
  const key = (await readFile(keyPath, 'utf8')).trim();
  const lockPath = resolve(directory, 'browser-host.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8'));
    try { process.kill(pid, 0); throw new Error('A browser host is already running.'); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    await unlink(lockPath); lock = await open(lockPath, 'wx');
  }
  await lock.writeFile(String(process.pid));
  const host = new RelayHost({ url: process.env.PROJLIB_RELAY_URL || 'wss://projlib-proxy.fabmigfarcos.workers.dev/browser/host', key,
    onStatus: message => console.log(`${new Date().toISOString()} ${message}`) }).start();
  let stopping = false;
  const stopTimer = setInterval(async () => {
    const requested = await readFile(stopPath, 'utf8').catch(() => '');
    if (requested.trim() === String(process.pid)) stop();
  }, 1000);
  stopTimer.unref();
  async function stop() {
    if (stopping) return; stopping = true;
    clearInterval(stopTimer);
    await host.close(); await lock.close(); await unlink(lockPath).catch(() => {});
    await unlink(stopPath).catch(() => {});
    process.exit(0);
  }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
