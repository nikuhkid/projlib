import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const site = process.argv[2] || 'https://nikuhkid.github.io/projlib/';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(site, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  await page.locator('#homeBtn').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('homeBtn').disabled);
  assert.equal(await page.locator('#proxyToggle').isChecked(), true);
  const config = await (await page.request.get(new URL('hubData.json', site).href)).json();
  const health = await page.request.get(`${config.proxyBase}/health`);
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).status, 'ok');
  await page.locator('#urlInput').fill('https://example.com/');
  await page.getByRole('button', { name: 'Engage' }).click();
  const heading = page.frameLocator('#proxyFrame').locator('h1');
  await heading.waitFor({ state: 'visible', timeout: 45000 });
  assert.equal(await heading.textContent(), 'Example Domain');
  await page.locator('#refreshBtn').click();
  await heading.waitFor({ state: 'visible' });
  assert.equal(await heading.textContent(), 'Example Domain');
  assert.deepEqual(errors, []);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/live-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/live-mobile.png', fullPage: true });
  console.log(JSON.stringify({ site, proxy: config.proxyBase, publicPage: response.status(), workerHealth: health.status(), proxiedPage: 'Example Domain', pageErrors: errors, screenshots: ['test-results/live-desktop.png', 'test-results/live-mobile.png'] }, null, 2));
} finally {
  await browser.close();
}
