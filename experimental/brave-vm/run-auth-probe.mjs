import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { realpath } from 'node:fs/promises';
import { serveProbe } from './serve-probe.mjs';

if (!process.argv[2] || !process.argv[3]) throw new Error('Pass the engine directory and native relay executable.');
const server = await serveProbe(await realpath(process.argv[2]), 0, { relayExecutable: await realpath(process.argv[3]) });
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url + '?desktop=1&profile=1&relay=1');
  await page.waitForFunction(() => document.querySelector('#host-status').textContent === 'Verify Wolfie to start Brave.');
  assert(await page.locator('#start').isDisabled());
  await page.locator('#host-password').fill('wrong-disposable-password');
  await page.locator('#verify-host').click();
  await page.waitForFunction(() => document.querySelector('#host-status').textContent === 'Incorrect host password.');
  assert(await page.locator('#start').isDisabled());
  assert.equal(await page.locator('#host-password').inputValue(), '');
  await page.evaluate(() => { window.reconnects = 0; window.projlibRelayTransport = { reconnect: async () => window.reconnects++ }; });
  await page.locator('#host-password').fill(server.labPassword); await page.locator('#verify-host').click();
  await page.waitForFunction(() => !document.querySelector('#start').disabled && window.reconnects === 1);
  await page.locator('#disconnect-host').click();
  await page.waitForFunction(() => document.querySelector('#start').disabled);
  await page.locator('#host-password').fill(server.labPassword); await page.locator('#verify-host').click();
  await page.waitForFunction(() => !document.querySelector('#start').disabled && window.reconnects === 2);
  assert.equal(await page.locator('#host-password').inputValue(), '');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.equal(server.relayStatistics().helperStarts, 0); assert.deepEqual(errors, []);
  console.log('Host verification UI passed: wrong-password rejection, login, logout, re-verification, password clearing, and no guest boot.');
} finally { await browser.close(); await server.close(); }
