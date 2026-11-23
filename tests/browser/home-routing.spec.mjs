import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRewriteRuntime } from '../rewrite-runtime.mjs';
import { unlockProjLib } from './access.mjs';
import { enableProxy } from './enable-proxy.mjs';
import { startHomeHost } from '../../server/home-host.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

let runtime, proxyBase;
const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
test.beforeAll(async () => { runtime = await createRewriteRuntime({ home: true }); proxyBase = (await runtime.ready).origin; });
test.afterAll(async () => runtime?.dispose());

test('home routing unlocks once per browser, survives reload, keeps its expiry and can be forgotten', async ({ page }) => {
  await page.route('https://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct fixture</h1>' }));
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, rewriteProxy: true, browserSessions: false, proxyBase, defaultHome: 'https://fixture.test/' } }));
  await page.goto('/projlib/'); await unlockProjLib(page);
  await expect(page.locator('#homeRouting')).toBeHidden();
  await enableProxy(page);
  await expect(page.getByRole('button', { name: 'Standard ad blocking', exact: true })).toBeEnabled();
  await expect(page.locator('#adblockMode button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Disable ad blocking for this site', exact: true }).click();
  await expect(page.locator('#adblockStatus')).toContainText('off for this site');
  await page.getByRole('button', { name: 'Standard ad blocking', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#adblockStatus')).toContainText('Brave engine');
  await expect(page.getByRole('button', { name: 'Standard ad blocking', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Standard ad blocking', exact: true })).toHaveAttribute('title', /requests blocked/i);
  await expect(page.locator('#verifyHost')).toBeEnabled();
  await expect(page.locator('#proxyRoute option[value="home"]')).toBeDisabled();
  await page.getByLabel('Host password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Verify host', exact: true }).click();
  await expect(page.locator('#homeRoutingStatus')).toContainText('Incorrect host password');
  await expect(page.locator('#proxyRoute')).toHaveValue('cloudflare');
  await page.getByLabel('Host password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Verify host', exact: true }).click();
  await expect(page.locator('#proxyRoute')).toHaveValue('home');
  const verified = await page.locator('#homeRoutingStatus').textContent();
  await expect(page.locator('#hostPassword')).toHaveValue('');
  const cookies = await page.context().cookies();
  expect(cookies.find(cookie => cookie.name === 'projlib_home_grant')?.httpOnly).toBe(true);
  await page.reload(); await unlockProjLib(page); await enableProxy(page);
  await expect(page.locator('#proxyRoute')).toHaveValue('home');
  await expect(page.locator('#homeRoutingStatus')).toHaveText(verified);
  await page.locator('#proxyRoute').selectOption('cloudflare');
  await expect(page.locator('#proxyRoute')).toHaveValue('cloudflare');
  await expect(page.locator('#homeRoutingStatus')).toHaveText(verified);
  await page.getByRole('button', { name: 'Forget verification' }).click();
  await expect(page.locator('#proxyRoute option[value="home"]')).toBeDisabled();
  await expect(page.locator('#proxyRoute')).toHaveValue('cloudflare');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/blocker-icons-mobile.png', fullPage: true });
});

test('the local host panel saves the password without opening the network listener', async ({ page }) => {
  const directory = await mkdtemp(resolve('.local/home-browser-test-'));
  const host = await startHomeHost({ directory, config: { bridgeKey: 'fixture-bridge' } });
  try {
    await page.goto(host.url);
    await expect(page.locator('#status')).toHaveText('Home proxy stopped.');
    await expect(page.getByRole('button', { name: 'Start home proxy' })).toBeDisabled();
    await page.getByLabel('Host password', { exact: true }).fill('local-fixture-password');
    await page.getByLabel('Confirm password').fill('local-fixture-password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.locator('#status')).toContainText('Password saved');
    await expect(page.getByRole('button', { name: 'Start home proxy' })).toBeEnabled();
    await expect(page.getByLabel('Host password', { exact: true })).toHaveValue('');
    await page.screenshot({ path: 'test-results/home-host-panel.png', fullPage: true });
  } finally {
    await host.close();
    expect(directory.startsWith(resolve('.local') + sep)).toBe(true);
    await rm(directory, { recursive: true, force: true });
  }
});

test('the standalone proxy tab can verify and forget its own host session', async ({ page }) => {
  await page.goto(proxyBase + '/rewrite/#url=https%3A%2F%2Ffixture.test%2F');
  await expect(page.locator('#homeControls')).toBeVisible();
  await page.getByText('Connection options', { exact: true }).click();
  await expect(page.locator('#homeVerify')).toBeEnabled();
  await page.getByLabel('Host password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Verify host' }).click();
  await expect(page.locator('#homeRoute')).toHaveValue('home');
  await page.getByRole('button', { name: 'Forget verification' }).click();
  await expect(page.locator('#homeRoute')).toHaveValue('cloudflare');
  await expect(page.locator('#homeRoute option[value="home"]')).toHaveJSProperty('disabled', true);
});

test('explicit route changes reload the open website through the selected exit', async ({ page }) => {
  await page.goto(proxyBase + '/rewrite/#url=' + encodeURIComponent('https://fixture.test/route'));
  const site = page.frameLocator('#site');
  await expect(site.locator('#egress')).toHaveText('cloudflare');
  await page.getByText('Connection options', { exact: true }).click();
  await page.getByLabel('Host password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Verify host', exact: true }).click();
  await expect(site.locator('#egress')).toHaveText('home');
  await page.locator('#homeRoute').selectOption('cloudflare');
  await expect(site.locator('#egress')).toHaveText('cloudflare');
  await page.locator('#homeRoute').selectOption('home');
  await expect(site.locator('#egress')).toHaveText('home');
  await page.getByRole('button', { name: 'Forget verification' }).click();
  await expect(site.locator('#egress')).toHaveText('cloudflare');
});
