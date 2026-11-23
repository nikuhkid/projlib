import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveProbe } from './serve-probe.mjs';
import { HOME_SESSION_MS } from '../../server/home-auth.mjs';

if (!process.argv[2] || !process.argv[3]) throw new Error('Pass the engine directory and native relay executable.');
const relayExecutable = await realpath(process.argv[3]);
let offset = 0;
const server = await serveProbe(resolve(process.argv[2]), 0, { relayExecutable, now: () => Date.now() + offset });
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const started = Date.now(); const errors = []; let page;
try {
  page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  const login = () => page.request.post(server.url + 'browser-vm/auth/login', {
    headers: { origin: new URL(server.url).origin }, data: { password: server.labPassword } });
  assert((await login()).ok());
  await page.goto(server.url + '?networkProbe=1&reconnectProbe=1&relay=1');
  await page.locator('#start').click();
  await page.waitForFunction(() => window.projlibProbe?.serial.includes('PROJLIB_NETWORK_RECONNECT_READY'), undefined, { timeout: 150000 });
  console.log('The guest completed initial TLS and is waiting for relay expiry.');
  const first = server.relayStatistics();
  assert.equal(first.helperStarts, 1); assert.equal(first.clients, 1);
  // Move only this isolated relay's injected clock. Production retains its fixed
  // twelve-hour grant, and the actual guest must stay alive throughout the test.
  offset += HOME_SESSION_MS + 1;
  await page.waitForFunction(() => window.projlibProbe?.relayTransport?.phase === 'disconnected', undefined, { timeout: 15000 });
  const status = await page.request.get(server.url + 'browser-vm/auth/status');
  assert.equal((await status.json()).authorized, false);
  await assert.rejects(page.evaluate(() => window.projlibRelayTransport.reconnect()));
  console.log('The expired grant disconnected its helper and rejected reconnection.');
  assert.equal(server.relayStatistics().helperStarts, 1);
  assert((await login()).ok());
  await page.evaluate(() => window.projlibRelayTransport.reconnect());
  await page.evaluate(() => window.projlibContinueNetworkProbe());
  await page.waitForFunction(() => window.projlibProbe?.serial.includes('PROJLIB_NETWORK_RECONNECT_PASS'), undefined, { timeout: 90000 });
  const second = server.relayStatistics();
  assert.equal(second.helperStarts, 2); assert.equal(second.clients, 1); assert.deepEqual(errors, []);
  const evidence = { passed: true, elapsedMs: Date.now()-started, initialTlsPassed: true,
    expiredGrantRejected: true, reverifiedTlsPassedWithoutGuestRestart: true, helperStarts: second.helperStarts, errors };
  await mkdir(resolve('.local/full-browser/evidence'), { recursive: true });
  await writeFile(resolve('.local/full-browser/evidence/guest-reverification.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  const state = await page?.evaluate(() => ({ status: document.querySelector('#status').textContent,
    serial: window.projlibProbe?.serial, errors: window.projlibProbe?.errors, relay: window.projlibProbe?.relayTransport })).catch(() => null);
  console.error(JSON.stringify({ failed: true, elapsedMs: Date.now()-started, message: error.message, state,
    statistics: server.relayStatistics(), pageErrors: errors }));
  process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
