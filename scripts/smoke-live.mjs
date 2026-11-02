import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const site = process.argv[2] || 'https://nikuhkid.github.io/projlib/';
const browser = await chromium.launch();
let page;
const failedRequests = [];
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(site, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  await page.locator('#homeBtn').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('homeBtn').disabled);
  const config = await (await page.request.get(new URL('hubData.json', site).href)).json();
  const hasProxy = Boolean(config.proxyBase);
  assert.equal(await page.locator('#proxyToggle').isChecked(), hasProxy);
  let workerHealth = null;
  if (hasProxy) {
    const health = await page.request.get(`${config.proxyBase}/health`);
    workerHealth = health.status();
    assert.equal(workerHealth, 200);
    assert.equal((await health.json()).status, 'ok');
  } else {
    assert.equal(await page.locator('#proxyFrame').isHidden(), true);
    assert.match(await page.locator('#statusMessage').textContent(), /Direct Mode is ready/);
  }
  await page.locator('#urlInput').fill('https://example.com/');
  await page.getByRole('button', { name: 'Engage' }).click();
  const frameBody = page.frameLocator('#proxyFrame').locator('body');
  await expect(frameBody).toContainText(/documentation examples/i, { timeout: 30000 });
  await Promise.all([
    page.waitForEvent('framenavigated', frame => frame.parentFrame() !== null && frame.url().includes('example.com')),
    page.locator('#refreshBtn').click()
  ]);
  await expect(frameBody).toContainText(/documentation examples/i, { timeout: 30000 });
  await expect(page.locator('#loadingOverlay')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#statusMessage')).toHaveAttribute('data-error', 'false', { timeout: 10000 });
  assert.deepEqual(errors, []);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/live-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/live-mobile.png', fullPage: true });
  console.log(JSON.stringify({ site, mode: hasProxy ? 'Proxy' : 'Direct', proxy: config.proxyBase || null, publicPage: response.status(), workerHealth, embeddedPage: 'example.com (rendered)', pageErrors: errors, screenshots: ['test-results/live-desktop.png', 'test-results/live-mobile.png'] }, null, 2));
} catch (error) {
  await mkdir('test-results', { recursive: true });
  if (page) {
    await page.screenshot({ path: 'test-results/live-failure.png', fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ status: await page.locator('#statusMessage').textContent().catch(() => null), frames: page.frames().map(frame => frame.url()), failedRequests }, null, 2));
  }
  throw error;
} finally {
  await browser.close();
}
