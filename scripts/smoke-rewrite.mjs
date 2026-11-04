import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const targets = process.argv.slice(3);
if (!targets.length) targets.push('https://example.com/', 'https://en.wikipedia.org/wiki/Proxy_server', 'https://www.instagram.com/accounts/login/', 'https://chatgpt.com/');
const browser = await chromium.launch();
try {
  await mkdir('test-results', { recursive: true });
  for (const target of targets) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message.slice(0, 150)));
    try {
      await page.goto(`${base}/rewrite/#${new URLSearchParams({ url: target })}`);
      const site = page.frameLocator('#site');
      await expect(site.locator('body')).not.toBeEmpty({ timeout: 45000 });
      const child = page.frames().find(frame => frame.url().includes('/rewrite/site/'));
      await child.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      if (new URL(target).hostname === 'archive.org') await expect(site.getByRole('main')).toBeVisible({ timeout: 30000 });
      const content = await site.locator('body').ariaSnapshot({ timeout: 15000 });
      const title = await site.locator('html').evaluate(() => document.title);
      const rendering = await site.locator('body').evaluate(body => ({ ready: document.readyState, display: getComputedStyle(body).display, visibility: getComputedStyle(body).visibility, opacity: getComputedStyle(body).opacity, height: body.getBoundingClientRect().height, rootDisplay: getComputedStyle(document.documentElement).display, rootVisibility: getComputedStyle(document.documentElement).visibility, rootOpacity: getComputedStyle(document.documentElement).opacity, styles: document.styleSheets.length, viewport: [innerWidth, innerHeight, scrollY], h1: document.querySelector('h1')?.getBoundingClientRect().toJSON() }));
      rendering.iframe = await page.locator('#site').boundingBox();
      const host = new URL(target).hostname;
      await page.screenshot({ path: `test-results/rewrite-${host}.png`, fullPage: true });
      console.log(JSON.stringify({ host, title, text: content.replace(/\[IP:[^\]]+\]/g, '[connection details omitted]').slice(0, 250), notice: await page.locator('#notice').innerText(), rendering, errors }));
      if (await site.locator('#errorTrace').count()) console.log((await site.locator('#errorTrace').inputValue()).slice(0, 1200));
    } catch (error) { console.log(JSON.stringify({ host: new URL(target).hostname, error: error.message.slice(0, 220), notice: await page.locator('#notice').textContent().catch(() => ''), errors })); }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
