import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, browserSessions: false, defaultHome: 'https://example.com/', proxyBase: 'https://proxy.example.net' } }));
  await page.route('https://proxy.example.net/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><h1>Proxy fixture</h1></body></html>' }));
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct fixture</h1>' }));
});

test('anonymous startup wires all six categories and enables the proxy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/projlib/');
  await expect(page.locator('#proxyToggle')).toBeChecked();
  await expect(page.locator('#proxyFrame')).toHaveAttribute('src', 'https://proxy.example.net/proxy/https://example.com/');
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Proxy fixture');
  await expect(page.locator('.dropdowns-grid select')).toHaveCount(6);
  for (const category of hub.categories) await expect(page.locator(`#${category.id} option`)).toHaveCount(category.links.length + 1);
  await page.locator('#brain').selectOption(hub.categories[0].links[0].url);
  await expect(page.locator('#urlInput')).toHaveValue(hub.categories[0].links[0].url);
  await page.locator('#homeBtn').click();
  await expect(page.locator('#urlInput')).toHaveValue('https://example.com/');
  expect(errors).toEqual([]);
});

test('address validation, direct mode, cross-origin refresh, scanner and original link work', async ({ page }) => {
  await page.goto('/projlib/');
  await expect(page.locator('#homeBtn')).toBeEnabled();
  await page.locator('#urlInput').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(page.locator('#statusMessage')).toHaveAttribute('data-error', 'true');
  await page.locator('#urlInput').fill('example.com/next?q=1#section');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(page.locator('#proxyFrame')).toHaveAttribute('src', 'https://proxy.example.net/proxy/https://example.com/next?q=1#section');
  await expect(page.locator('#openOriginal')).toHaveAttribute('href', 'https://example.com/next?q=1#section');
  await page.locator('#proxyToggle').uncheck();
  await expect(page.locator('#proxyFrame')).toHaveAttribute('src', 'https://example.com/next?q=1#section');
  await page.locator('#refreshBtn').click();
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Direct fixture');
  await page.locator('#scannerBtn').click();
  await expect(page.locator('#proxyForm')).toBeHidden();
  await page.locator('#scannerBtn').click();
  await expect(page.locator('#urlInput')).toBeFocused();
});

test('every theme loads, cleans up, and persists across reloads', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/projlib/');
  await expect(page.locator('body')).toHaveClass(/theme-main/);
  for (const theme of hub.themes.slice(1)) {
    await page.locator('#themeBtn').click();
    await expect(page.locator('#themeBtn')).toBeEnabled();
    await expect(page.locator('body')).toHaveClass(`theme-${theme.name}`);
  }
  await expect(page.locator('.matrix-char, .kuromi-sprite, .cp-overlay, .glitch-bar')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('body')).toHaveClass('theme-minimal');
  expect(errors).toEqual([]);
});

test('blocked browser storage does not prevent anonymous startup', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }));
  await page.goto('/projlib/');
  await expect(page.locator('#homeBtn')).toBeEnabled();
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Proxy fixture');
});

test('configuration failures are visible and leave navigation disabled', async ({ page }) => {
  await page.route('**/hubData.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/projlib/');
  await expect(page.locator('#statusMessage')).toContainText('HTTP 503');
  await expect(page.locator('#homeBtn')).toBeDisabled();
});

test('without a deployed proxy the console stays in Direct Mode and explains the unavailable switch', async ({ page }) => {
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, browserSessions: false, proxyBase: '' } }));
  await page.goto('/projlib/');
  await expect(page.locator('#homeBtn')).toBeEnabled();
  await expect(page.locator('#proxyFrame')).toBeHidden();
  await expect(page.locator('#proxyToggle')).not.toBeChecked();
  await page.locator('#proxyToggle').click();
  await expect(page.locator('#proxyToggle')).not.toBeChecked();
  await expect(page.locator('#statusMessage')).toContainText('Proxy Mode is not available yet');
  await page.locator('#urlInput').fill('example.com');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Direct fixture');
  await expect(page.locator('#openOriginal')).toHaveAttribute('href', 'https://example.com/');
});

test('console fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/projlib/');
  await expect(page.locator('#homeBtn')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
