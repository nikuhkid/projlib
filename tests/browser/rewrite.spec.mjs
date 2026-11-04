import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRewriteRuntime } from '../rewrite-runtime.mjs';
import { enableProxy } from './enable-proxy.mjs';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
let runtime, proxyBase;
test.beforeAll(async () => { runtime = await createRewriteRuntime(); proxyBase = (await runtime.ready).origin; });
test.afterAll(async () => { await runtime?.dispose(); });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  for (const frame of page.frames()) {
    console.log(await frame.locator('body').innerText().catch(() => 'Frame unavailable'));
    if (await frame.locator('#errorTrace').count()) console.log(await frame.locator('#errorTrace').inputValue());
  }
});

async function openFixture(page) {
  await page.route('https://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct fixture</h1>' }));
  await page.route('**/hubData.json', route => route.fulfill({ json: {
    ...hub, browserSessions: false, rewriteProxy: true, defaultHome: 'https://fixture.test/', proxyBase
  } }));
  await page.goto('/projlib/');
  await enableProxy(page);
  return page.frameLocator('#proxyFrame').frameLocator('#site');
}

test('rewriting renders locally with modules, fetch, native identity, WebSockets, login and isolated browser storage', async ({ page, browser }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.log(message.text()); });
  const site = await openFixture(page);
  await expect(site.locator('h1')).toHaveText('Fixture sign in', { timeout: 25000 });
  await expect(site.locator('#module')).toHaveText('Module loaded');
  await expect(site.locator('#dynamic')).toHaveText('Relative dynamic import loaded');
  await expect(site.locator('#api')).toHaveText('Dynamic fetch worked');
  await expect(site.locator('#socket')).toHaveText('WebSocket echo worked');
  await expect(page.locator('#viewerSources')).toBeVisible();
  const viewer = await page.locator('#proxyContainer').boundingBox();
  const sources = await page.locator('#viewerSources').boundingBox();
  expect(sources.y).toBeGreaterThanOrEqual(viewer.y + viewer.height);
  await expect(page.frameLocator('#proxyFrame').locator('#viewerFooter')).toBeHidden();
  await expect(site.locator('#styled')).toHaveCSS('color', 'rgb(12, 34, 56)');
  await expect(site.locator('#identity')).toHaveText(await page.evaluate(() => navigator.userAgent));
  expect(await site.locator('h1').evaluate(() => {
    localStorage.setItem('key-test', 'value-test');
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    delete localStorage['key-test'];
    const deleted = localStorage.getItem('key-test') === null;
    return { keys: keys.sort(), deleted };
  })).toEqual({ keys: ['fixture', 'key-test'], deleted: true });
  await page.context().setOffline(true);
  await site.getByRole('button', { name: 'Local click' }).click();
  await expect(site.locator('#clicked')).toHaveText('Clicked locally');
  await page.context().setOffline(false);
  // Controlled fake credentials only. No real third-party accounts are used.
  await site.getByLabel('User', { exact: true }).fill('fixture');
  await site.getByLabel('Password').fill('fixture-password');
  await site.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(site.locator('h1')).toHaveText('Private fixture account');
  await expect(site.locator('#cookie')).not.toContainText('session=');
  await expect(site.locator('#cookie')).toContainText('style=loaded');
  await expect(site.locator('#storage')).toHaveText('saved in this browser');
  const debug = await page.context().newCDPSession(page);
  await debug.send('ServiceWorker.enable');
  await debug.send('ServiceWorker.stopAllWorkers');
  await debug.detach();
  await page.reload();
  await expect(page.locator('#proxyToggle')).not.toBeChecked();
  await enableProxy(page);
  await expect(site.locator('h1')).toHaveText('Private fixture account');
  await expect(page.locator('#urlInput')).toHaveValue('https://fixture.test/account');
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    const separateSite = await openFixture(second);
    await expect(separateSite.locator('h1')).toHaveText('Fixture sign in');
    await expect(separateSite.locator('#storage')).toHaveText('empty');
    await second.goto(`${proxyBase}/rewrite/#${new URLSearchParams({ url: 'https://fixture.test/' })}`);
    await expect(second.frameLocator('#site').locator('h1')).toHaveText('Fixture sign in');
    await expect(second.locator('#viewerFooter')).toBeVisible();
    const siteBox = await second.locator('#site').boundingBox();
    const footerBox = await second.locator('#viewerFooter').boundingBox();
    expect(footerBox.y).toBeGreaterThanOrEqual(siteBox.y + siteBox.height);
  } finally { await other.close(); }
  await site.getByRole('link', { name: 'Other site' }).click();
  await expect(site.locator('h1')).toHaveText('Fixture sign in');
  await expect(site.locator('#storage')).toHaveText('empty');
  await site.locator('h1').evaluate(() => localStorage.clear());
  await expect(page.locator('#urlInput')).toHaveValue('https://other.test/account');
  await page.locator('#urlInput').fill('https://fixture.test/account');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(site.locator('h1')).toHaveText('Private fixture account');
  await expect(site.locator('#storage')).toHaveText('saved in this browser');
  await page.locator('#refreshBtn').click();
  await expect(site.locator('h1')).toHaveText('Private fixture account');
  await site.getByRole('link', { name: 'Sign out' }).click();
  await expect(site.locator('h1')).toHaveText('Fixture sign in');
  expect(errors).toEqual([]);
});

test('clearing proxy data removes its cookies and local storage', async ({ page }) => {
  const site = await openFixture(page);
  await expect(site.locator('h1')).toHaveText('Fixture sign in', { timeout: 25000 });
  await site.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(site.locator('h1')).toHaveText('Private fixture account');
  await page.frameLocator('#proxyFrame').getByRole('button', { name: 'Clear browsing data' }).click();
  await expect(page.frameLocator('#proxyFrame').locator('body')).toContainText('Proxy browsing data cleared');
  await page.reload();
  await enableProxy(page);
  await expect(site.locator('h1')).toHaveText('Fixture sign in');
  await expect(site.locator('#storage')).toHaveText('empty');
});
