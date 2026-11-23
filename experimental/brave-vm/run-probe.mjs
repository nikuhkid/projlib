import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveProbe } from './serve-probe.mjs';

if (!process.argv[2]) throw new Error('Pass the candidate engine directory.');
const server = await serveProbe(resolve(process.argv[2]));
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
const started = Date.now();
const errors = [];
const options = new URLSearchParams();
if (process.argv.includes('--cpu-max')) options.set('cpu', 'max');
if (process.argv.includes('--cpu-rng')) options.set('cpu', 'rng');
if (process.argv.includes('--diagnose')) options.set('diagnose', '1');
if (process.argv.includes('--desktop')) options.set('desktop', '1');
const directory = resolve('.local/full-browser/evidence');
await mkdir(directory, { recursive: true });
const evidence = resolve(directory, `guest-probe-${started}.json`);
let result;
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url + '?' + options);
  const isolated = await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
  if (!isolated) throw new Error('The test page did not obtain cross-origin isolation.');
  await page.locator('#start').click();
  let previous = '';
  while (Date.now() - started < 10 * 60 * 1000) {
    await page.waitForTimeout(10000);
    result = await page.evaluate(() => ({ ...window.projlibProbe, status: document.querySelector('#status').textContent }));
    await writeFile(evidence, JSON.stringify({ elapsedMs: Date.now() - started, options: options.toString(), result, pageErrors: errors }, null, 2));
    const progress = result.serial.slice(-1000);
    if (progress !== previous || result.errors.length || errors.length) {
      console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000), status: result.status,
        serialTail: progress, errors: [...result.errors, ...errors] }));
      previous = progress;
    }
    if (options.has('desktop') && result.displayConnected) {
      await page.waitForTimeout(20000);
      await page.screenshot({ path: resolve(directory, 'brave-desktop.png'), fullPage: true });
      break;
    }
    if (result.completed || errors.length || /Kernel panic - not syncing|fatal error:|Illegal instruction/.test(result.serial)
        || result.errors.some(value => /abort|out of memory|unreachable|exception/i.test(value))) break;
  }
  console.log(JSON.stringify({ actualBraveExecuted: Boolean(result?.completed), elapsedMs: Date.now() - started, evidence }));
  if (!result?.completed) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
