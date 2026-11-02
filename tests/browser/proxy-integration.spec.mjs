import { test, expect } from '@playwright/test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
let runtime;
let proxyBase;
test.beforeAll(async () => {
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, scriptPath: resolve('worker/index.js'), compatibilityDate: '2026-11-02', port: 0,
    bindings: { FRONTEND_ORIGIN: 'http://127.0.0.1:4173' },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.pathname === '/api') return Response.json({ message: 'Fetch stayed on the proxy' });
      if (url.pathname === '/redirect') return new Response(null, { status: 302, headers: { location: '/next' } });
      if (url.pathname === '/style.css') return new Response('#styled{color:rgb(12,34,56)}', { headers: { 'content-type': 'text/css' } });
      const title = url.pathname === '/next' ? 'Next page' : url.pathname === '/find' ? `Results: ${url.searchParams.get('q')}` : 'Proxy integration';
      return new Response(`<!doctype html><html><head><title>Fixture</title><link rel="stylesheet" href="/style.css"></head><body><h1>${title}</h1><p id="styled">Styled through the proxy</p><p id="api">Waiting</p><a href="/next">Next</a><form action="/find"><input name="q" aria-label="Query"><button>Search</button></form><script>fetch('/api').then(r=>r.json()).then(data=>document.getElementById('api').textContent=data.message)</script></body></html>`, {
        headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' }
      });
    }
  }));
  proxyBase = (await runtime.ready).origin;
});
test.afterAll(async () => { await runtime?.dispose(); });

test('browser executes real rewritten HTML, CSS, fetch, links, forms and redirects inside the sandbox', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, defaultHome: 'https://example.com/', proxyBase } }));
  await page.goto('/projlib/');
  const frame = page.frameLocator('#proxyFrame');
  await expect(frame.locator('h1')).toHaveText('Proxy integration');
  await expect(frame.locator('#api')).toHaveText('Fetch stayed on the proxy');
  await expect(frame.locator('#styled')).toHaveCSS('color', 'rgb(12, 34, 56)');
  await frame.getByRole('link', { name: 'Next', exact: true }).click();
  await expect(frame.locator('h1')).toHaveText('Next page');
  await expect(page.locator('#urlInput')).toHaveValue('https://example.com/next');
  await frame.getByLabel('Query').fill('hello');
  await frame.getByRole('button', { name: 'Search' }).click();
  await expect(frame.locator('h1')).toHaveText('Results: hello');
  await expect(page.locator('#urlInput')).toHaveValue('https://example.com/find?q=hello');
  await page.locator('#urlInput').fill('https://example.com/redirect');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(frame.locator('h1')).toHaveText('Next page');
  await expect(page.locator('#urlInput')).toHaveValue('https://example.com/next');
  await page.locator('#refreshBtn').click();
  await expect(frame.locator('h1')).toHaveText('Next page');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/local-console-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'test-results/local-console-mobile.png', fullPage: true });
});
