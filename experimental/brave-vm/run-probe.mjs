import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { serveProbe } from './serve-probe.mjs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

if (!process.argv[2]) throw new Error('Pass the candidate engine directory.');
const helperOption = process.argv.indexOf('--network-helper');
const durationOption = process.argv.indexOf('--duration-seconds');
const durationSeconds = durationOption >= 0 ? Number(process.argv[durationOption+1]) : 600;
const profileOption = process.argv.indexOf('--browser-profile');
const portOption = process.argv.indexOf('--probe-port');
const probePort = portOption >= 0 ? Number(process.argv[portOption+1]) : 0;
if (!Number.isInteger(durationSeconds) || durationSeconds < 30 || durationSeconds > 1800) throw new Error('Probe duration must be between 30 and 1800 seconds.');
if (!Number.isInteger(probePort) || (probePort !== 0 && (probePort < 1024 || probePort > 65535))) throw new Error('Invalid loopback probe port.');
if (helperOption >= 0 && !process.argv[helperOption + 1]) throw new Error('Pass the native relay executable.');
if (process.argv.includes('--network-probe') && helperOption < 0) throw new Error('The network probe requires --network-helper.');
const relayExecutable = helperOption >= 0 ? await realpath(process.argv[helperOption + 1]) : undefined;
if (relayExecutable && !(await stat(relayExecutable)).isFile()) throw new Error('The native relay executable is missing.');
let browserProfile;
if (profileOption >= 0) {
  if (!process.argv[profileOption+1]) throw new Error('Pass a dedicated lab browser profile.');
  const base = await realpath('.local/full-browser'); browserProfile = resolve(process.argv[profileOption+1]);
  if (dirname(browserProfile) !== base || !basename(browserProfile).startsWith('brave-browser-')) throw new Error('Use a brave-browser-* fixture directory inside .local/full-browser.');
  const marker = resolve(browserProfile, '.projlib-lab.json');
  try {
    if (await realpath(browserProfile) !== browserProfile || JSON.parse(await readFile(marker, 'utf8')).kind !== 'projlib-brave-lab') throw new Error('This existing browser profile is not owned by the probe.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(browserProfile); await writeFile(marker, JSON.stringify({ kind: 'projlib-brave-lab' }), { flag: 'wx' });
  }
}
const engineDirectory = await realpath(process.argv[2]);
const runtimeSha256 = createHash('sha256').update(await readFile(resolve(engineDirectory, 'out.js'))).digest('hex');
const runtimePatch = JSON.parse(await readFile(resolve(engineDirectory, 'runtime-patch.json'), 'utf8'));
if (runtimePatch.patchedSha256 !== runtimeSha256) throw new Error('The runtime does not match its reviewed patch record.');
const server = await serveProbe(engineDirectory, probePort, { relayExecutable });
const browser = browserProfile ? await chromium.launchPersistentContext(browserProfile, { headless: true, chromiumSandbox: true }) : await chromium.launch({ headless: true, chromiumSandbox: true });
console.log(JSON.stringify({ probeUrl: server.url, dedicatedBrowserProfile: browserProfile || null }));
const started = Date.now();
const errors = [];
const options = new URLSearchParams();
if (process.argv.includes('--cpu-max')) options.set('cpu', 'max');
if (process.argv.includes('--cpu-rng')) options.set('cpu', 'rng');
if (process.argv.includes('--diagnose')) options.set('diagnose', '1');
if (process.argv.includes('--desktop')) options.set('desktop', '1');
if (process.argv.includes('--single-core')) options.set('single', '1');
if (process.argv.includes('--tsc-clock')) options.set('clock', 'tsc');
if (process.argv.includes('--trace')) options.set('trace', '1');
if (process.argv.includes('--debug-processes')) options.set('debug', '1');
if (process.argv.includes('--persistent-profile')) options.set('profile', '1');
if (process.argv.includes('--jitless')) options.set('jitless', '1');
if (process.argv.includes('--bounded-io')) options.set('io', 'bounded');
if (helperOption >= 0) options.set('relay', '1');
if (process.argv.includes('--network-probe')) {
  options.set('networkProbe', '1');
}
if (process.argv.includes('--storage-probe')) options.set('storageProbe', '1');
if (process.argv.includes('--input-probe')) options.set('inputProbe', '1');
const directory = resolve('.local/full-browser/evidence');
await mkdir(directory, { recursive: true });
const evidence = resolve(directory, `guest-probe-${started}.json`);
let result;
let stop = false;
const commands = createInterface({ input: process.stdin });
try {
  const page = await browser.newPage();
  if (options.has('desktop')) await page.setViewportSize({ width: 1280, height: 1200 });
  if (server.labPassword) {
    const login = await page.request.post(server.url + 'browser-vm/auth/login', {
      headers: { origin: new URL(server.url).origin }, data: { password: server.labPassword } });
    if (!login.ok()) throw new Error('The disposable lab relay could not be authenticated.');
  }
    const snapshot = () => page.evaluate(() => { return ({ ...window.projlibProbe, diagnostics: window.projlibChannel?.diagnostics || '', status: document.querySelector('#status').textContent,
    display: window.projlibDisplay ? { state: window.projlibDisplay._rfbConnectionState, phase: window.projlibDisplay._rfbInitState,
      channel: window.projlibChannel?.readyState, sent: window.projlibChannel?.sentBytes,
      received: window.projlibChannel?.receivedBytes, header: window.projlibChannel?.protocolHeader,
      inputAckCapable: window.projlibChannel?.inputAckCapable,
      inputQueuedBytes: window.projlibChannel?.inputBytes,
      inputInFlight: Boolean(window.projlibChannel?.inputFlight) } : null }); })
    .then(value => ({ ...value, relay: server.relayStatistics() }));
  commands.on('line', async command => {
    try {
    if (command.trim() === 'stop') stop = true;
    if (command.trim() === 'snapshot') { const state = await snapshot(); console.log(JSON.stringify({ status: state.status, display: state.display, relay: state.relay, disconnect: state.displayDisconnect, errors: state.errors })); }
    if (command.trim() === 'screenshot') {
      await page.screenshot({ path: resolve(directory, 'brave-desktop.png'), fullPage: true });
      console.log('Saved the local guest display screenshot.');
    }
    if (['navigate-sync', 'navigate-example'].includes(command.trim())) {
      const address = command.trim() === 'navigate-sync' ? 'brave://settings/braveSync/setup' : 'https://example.com/';
      await page.evaluate(async address => {
        const display = window.projlibDisplay;
        if (!display || display._rfbConnectionState !== 'connected') throw new Error('The guest display is not connected.');
        display.sendKey(0xffe3, 'ControlLeft', true); display.sendKey(0x6c, 'KeyL'); display.sendKey(0xffe3, 'ControlLeft', false);
        for (const letter of address) { display.sendKey(letter.codePointAt(0)); await new Promise(resolve => setTimeout(resolve, 100)); }
        display.sendKey(0xff0d, 'Enter');
      }, address);
      console.log('Sent the selected fixture address through the guest input channel.');
    }
    if (command.trim() === 'save-profile') {
      await page.evaluate(() => window.saveProjlibProfile());
      console.log('Saved the actual Brave profile checkpoint on this device.');
    }
    if (command.trim() === 'close-profile') {
      await page.evaluate(() => window.saveProjlibProfile({ close: true }));
      console.log('Brave closed normally and its final profile checkpoint is saved on this device.');
    }
    } catch (error) { console.log('Probe control failed: ' + error.message); }
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url + '?' + options);
  const isolated = await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
  if (!isolated) throw new Error('The test page did not obtain cross-origin isolation.');
  await page.locator('#start').click();
  let previous = '';
  while (!stop && Date.now() - started < durationSeconds * 1000) {
    await page.waitForTimeout(10000);
    result = await snapshot();
    await writeFile(evidence, JSON.stringify({ elapsedMs: Date.now() - started, engineDirectory, runtimeSha256, runtimePatch,
      options: options.toString(), result, pageErrors: errors }, null, 2));
    const progress = result.serial.slice(-1000);
    if (progress !== previous || result.errors.length || errors.length) {
      console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000), status: result.status,
        serialTail: progress, display: result.display, errors: [...result.errors, ...errors] }));
      previous = progress;
    }
    if (options.has('desktop') && result.displayConnected && !process.argv.includes('--linger')) {
      await page.waitForTimeout(20000);
      await page.screenshot({ path: resolve(directory, 'brave-desktop.png'), fullPage: true });
      break;
    }
    if (result.completed || result.displayDisconnect || errors.length || /Kernel panic - not syncing|fatal error:|Illegal instruction|PROJLIB_DISPLAY_START_FAILED|PROJLIB_DISPLAY_HELPER_FAILED/.test(result.serial)
        || result.errors.length) break;
  }
  console.log(JSON.stringify({ braveBinaryVersion: result?.serial.match(/Brave Browser [\d.]+/)?.[0] || null,
    controlledDomRendered: Boolean(result?.domRendered), tlsNetworkVerified: Boolean(result?.networkVerified), storageExportVerified: Boolean(result?.storageExportVerified), inputIntegrityVerified: Boolean(result?.inputVerified),
    localDisplayConnected: Boolean(result?.displayConnected), elapsedMs: Date.now() - started, evidence }));
  if (!result?.completed) process.exitCode = 1;
} finally { commands.close(); await browser.close(); await server.close(); }
