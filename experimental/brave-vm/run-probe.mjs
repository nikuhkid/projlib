import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveProbe } from './serve-probe.mjs';

if (!process.argv[2]) throw new Error('Pass the candidate engine directory.');
const server = await serveProbe(resolve(process.argv[2]));
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const started = Date.now();
const errors = [];
let result;
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  const isolated = await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
  if (!isolated) throw new Error('The test page did not obtain cross-origin isolation.');
  await page.locator('#start').click();
  let previous = '';
  while (Date.now() - started < 10 * 60 * 1000) {
    await page.waitForTimeout(10000);
    result = await page.evaluate(() => ({ ...window.projlibProbe, status: document.querySelector('#status').textContent }));
    const progress = result.serial.slice(-1000);
    if (progress !== previous || result.errors.length || errors.length) {
      console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000), status: result.status,
        serialTail: progress, errors: [...result.errors, ...errors] }));
      previous = progress;
    }
    if (result.completed || errors.length || result.errors.some(value => /abort|out of memory|unreachable|exception/i.test(value))) break;
  }
  const directory = resolve('.local/full-browser/evidence');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'guest-probe.json'), JSON.stringify({ elapsedMs: Date.now() - started, result, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ actualBraveExecuted: Boolean(result?.completed), elapsedMs: Date.now() - started, evidence: '.local/full-browser/evidence/guest-probe.json' }));
  if (!result?.completed) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
