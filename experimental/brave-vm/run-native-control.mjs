import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.platform !== 'linux' || !process.env.GITHUB_ACTIONS) throw new Error('Run this diagnostic only in its disposable Linux CI job.');
const name = 'projlib-native-' + randomBytes(8).toString('hex');
const port = 9222;
let logs = '', socket; const started = Date.now();
const child = spawn('docker', ['run', '--rm', '--name', name, '--network=host', '--cap-add=SYS_ADMIN',
  '--security-opt', 'seccomp=unconfined', '--volume', `${resolve('experimental/brave-vm/desktop')}:/probe:ro`,
  '--entrypoint', '/bin/sh', 'projlib-brave-native:control', '-c',
  `. /probe/fonts.sh; exec env -u DISPLAY dbus-run-session -- brave-browser --headless=new --disable-gpu --disable-dev-shm-usage --no-first-run --no-default-browser-check --user-data-dir="$HOME/profile" --remote-debugging-address=127.0.0.1 --remote-debugging-port=${port} about:blank`],
  { stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { logs = (logs + bytes.toString()).slice(-50000); });
let sequence = 0; const pending = new Map();
function command(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 10000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
try {
  let version;
  while (Date.now()-started < 30000) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!version?.webSocketDebuggerUrl) throw new Error('Native Brave did not expose its loopback-only diagnostic endpoint.');
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  };
  const browserVersion = await command('Browser.getVersion');
  const { targetInfos } = await command('Target.getTargets');
  console.log(JSON.stringify({ browser: browserVersion.product, initialTargets: targetInfos.map(({ type, url }) => ({ type, url })) }));
  let targetId = targetInfos.find(target => target.type === 'page')?.targetId;
  if (!targetId) ({ targetId } = await command('Target.createTarget', { url: 'about:blank' }));
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Page.enable', {}, sessionId);
  const html = '<title>ProjLib native control</title><p id="proof">Actual Brave executed inside the guest</p>';
  const navigation = await command('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(html) }, sessionId);
  console.log(JSON.stringify({ navigationError: navigation.errorText || null }));
  let rendered = false;
  while (Date.now()-started < 60000) {
    const result = await command('Runtime.evaluate', { expression: 'document.getElementById("proof")?.textContent', returnByValue: true }, sessionId);
    if (result.result?.value === 'Actual Brave executed inside the guest') { rendered = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!rendered) throw new Error('Native Brave did not render the controlled HTML through DevTools.');
  console.log(JSON.stringify({ nativeControlledDomRendered: true, elapsedMs: Date.now()-started, sandboxDisabled: false }));
  const syncNavigation = await command('Page.navigate', { url: 'chrome://settings/braveSync' }, sessionId);
  if (syncNavigation.errorText) throw new Error('Native Sync navigation failed.');
  let syncReady = false;
  const syncDeadline = Date.now()+30000;
  while (Date.now()<syncDeadline) {
    const result = await command('Runtime.evaluate', { expression: `(() => { const roots=[document]; while(roots.length) { for(const element of roots.pop().querySelectorAll('*')) { if(element.tagName.toLowerCase().includes('brave-sync')) return location.pathname.includes('braveSync'); if(element.shadowRoot) roots.push(element.shadowRoot); } } return false; })()`, returnByValue: true }, sessionId);
    if (result.result?.value === true) { syncReady = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!syncReady) throw new Error('Native Brave Sync component did not initialize.');
  console.log(JSON.stringify({ nativeSyncUiAvailable: true, syncChainEntered: false, elapsedMs: Date.now()-started }));
  await command('Browser.close').catch(() => {});
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('The disposable control ended.')); }
  socket?.close();
  await promisify(execFile)('docker', ['rm', '--force', name]).catch(() => {});
  await writeFile('native-control.txt', logs);
  console.log(logs.slice(-6000));
}
