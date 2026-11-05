import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, rewriteProxy: false, browserSessions: false, defaultHome: 'https://example.com/', proxyBase: 'https://proxy.example.net' } }));
  await page.route('https://proxy.example.net/**', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><h1>Proxy fixture</h1></body></html>' }));
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct fixture</h1>' }));
});

test('Scanner opens dotted hosts and sends search terms through the selected mode', async ({ page }) => {
  await page.route('https://www.bing.com/search?*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Search fixture</h1>' }));
  await page.goto('/projlib/');
  await expect(page.locator('#homeBtn')).toBeEnabled();
  await page.locator('#scannerBtn').click();
  const input = page.getByRole('textbox', { name: 'Search or enter a website address' });
  const frame = page.locator('#proxyFrame');

  await input.fill('example.com');
  await input.press('Enter');
  await expect(frame).toHaveAttribute('src', 'https://example.com/');

  await input.fill('  facebook  ');
  await input.press('Enter');
  await expect(frame).toHaveAttribute('src', 'https://www.bing.com/search?q=facebook');
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Search fixture');

  await page.locator('#proxyToggle').check();
  await input.fill('facebook.com help & tips');
  await input.press('Enter');
  await expect(frame).toHaveAttribute('src', 'https://proxy.example.net/proxy/https://www.bing.com/search?q=facebook.com+help+%26+tips');

  await input.fill('example.com:8443/path');
  await input.press('Enter');
  await expect(frame).toHaveAttribute('src', 'https://proxy.example.net/proxy/https://example.com:8443/path');
});

test('startup hides Scanner controls and keeps proxy off, including after a previously enabled visit', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/projlib/');
  await expect(page.locator('#proxyToggle')).not.toBeChecked();
  await expect(page.locator('#proxyToggle')).toBeHidden();
  await expect(page.locator('#proxyForm')).toBeHidden();
  await expect(page.locator('#scannerBtn')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Direct fixture');
  await expect(page.locator('.dropdowns-grid select')).toHaveCount(6);
  for (const category of hub.categories) await expect(page.locator(`#${category.id} option`)).toHaveCount(category.links.length + 1);
  await page.locator('#brain').selectOption(hub.categories[0].links[0].url);
  await expect(page.locator('#urlInput')).toHaveValue(hub.categories[0].links[0].url);
  await page.locator('#homeBtn').click();
  await expect(page.locator('#urlInput')).toHaveValue('https://example.com/');
  await page.locator('#scannerBtn').click();
  await expect(page.locator('#urlInput')).toBeFocused();
  await expect(page.locator('#proxyToggle')).toBeVisible();
  await page.locator('#proxyToggle').check();
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Proxy fixture');
  await page.evaluate(() => localStorage.setItem('projlib_proxy_mode', 'proxy'));
  await page.reload();
  await expect(page.locator('#proxyForm')).toBeHidden();
  await expect(page.locator('#proxyToggle')).not.toBeChecked();
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Direct fixture');
  expect(errors).toEqual([]);
});

test('address validation, direct mode, cross-origin refresh, scanner and original link work', async ({ page }) => {
  await page.goto('/projlib/');
  await expect(page.locator('#homeBtn')).toBeEnabled();
  await page.locator('#scannerBtn').click();
  await page.locator('#proxyToggle').check();
  await page.locator('#urlInput').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(page.locator('#statusMessage')).toHaveAttribute('data-error', 'true');
  await page.locator('#urlInput').fill('example.com/next?q=1#section');
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
    source: document.getElementById('proxyFrame').contentWindow,
    data: { type: 'projlib:navigation', url: 'https://example.com/late-update' }
  })));
  await expect(page.locator('#urlInput')).toHaveValue('example.com/next?q=1#section');
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
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Direct fixture');
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
  await page.locator('#scannerBtn').click();
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

test('theme effects cannot paint over the website or filter its container', async ({ page }) => {
  await page.goto('/projlib/');
  await expect(page.frameLocator('#proxyFrame').locator('h1')).toHaveText('Direct fixture');
  for (const name of ['kuromi', 'matrix', 'glitch', 'cyberpunk', 'anime']) {
    await page.evaluate(async name => {
      const theme = window.ProjLib.data.hub.themes.find(theme => theme.name === name);
      await window.ProjLib.UI.applyTheme(theme);
    }, name);
    await expect(page.locator('.console-container')).toHaveCSS('filter', 'none');
    const box = await page.locator('#proxyFrame').boundingBox();
    const clip = { x: box.x + 30, y: box.y + 80, width: 160, height: 100 };
    const before = await page.screenshot({ clip });
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'theme-effect test-overlay';
      probe.style.cssText = 'position:fixed;inset:0;background:magenta;z-index:2147483647';
      window.ProjLib.UI.effectLayer().appendChild(probe);
    });
    const after = await page.screenshot({ clip });
    expect(after.equals(before), `${name} must leave the website pixels clear`).toBe(true);
  }
  await page.evaluate(() => window.ProjLib.UI.applyTheme(window.ProjLib.data.hub.themes.find(theme => theme.name === 'minimal')));
  await expect(page.locator('.theme-effects > *')).toHaveCount(0);
});

test('Anime has seven distinct Dragon Balls and a Hidden Leaf headband; Cyberpunk styles the real controls', async ({ page }) => {
  await page.goto('/projlib/');
  await expect(page.locator('#themeBtn')).toBeEnabled();
  await page.evaluate(() => window.ProjLib.UI.applyTheme(window.ProjLib.data.hub.themes.find(theme => theme.name === 'anime')));
  await expect(page.getByRole('img', { name: 'Naruto Hidden Leaf headband' })).toBeVisible();
  await expect(page.locator('.dragon-ball')).toHaveCount(7);
  for (let count = 1; count <= 7; count++) await expect(page.locator(`.dragon-ball[data-stars="${count}"] polygon`)).toHaveCount(count);
  await page.mouse.move(220, 60);
  await expect.poll(() => page.locator('.dragon-ball').first().evaluate(ball => Number(getComputedStyle(ball).opacity))).toBeGreaterThan(0);
  await page.evaluate(() => window.ProjLib.UI.applyTheme(window.ProjLib.data.hub.themes.find(theme => theme.name === 'cyberpunk')));
  await expect(page.locator('.dragon-ball')).toHaveCount(0);
  await expect(page.locator('#scannerBtn')).toHaveCSS('background-color', 'rgb(244, 235, 54)');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#scannerBtn').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
