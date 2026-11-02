import { test, expect } from '@playwright/test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { BrowserEngine } from '../../server/browser-engine.mjs';
import { RelayHost } from '../../server/relay-host.mjs';
import { createNetworkGuard } from '../../server/network-guard.mjs';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
const KEY = 'test-host-key-for-local-tests-only-1234567890x';
let runtime, fixture, engine, host, proxyBase;
test.beforeAll(async () => {
  fixture = http.createServer((request, response) => {
    if (request.url === '/login' && request.method === 'POST') {
      request.resume(); response.writeHead(303, { location: '/account', 'set-cookie': 'session=fixture; HttpOnly; Path=/; SameSite=Lax' }); response.end(); return;
    }
    const signedIn = request.headers.cookie?.includes('session=fixture');
    response.setHeader('content-type', 'text/html');
    response.end(`<html><head><title>${signedIn ? 'Private account' : 'Fixture sign in'}</title><style>body{background:${signedIn ? '#d0ffcf' : '#fff'};font:20px Arial;padding:24px}input,button{display:block;width:240px;padding:10px;margin:14px 0}</style></head><body><h1>${signedIn ? 'Private account' : 'Fixture sign in'}</h1>${signedIn ? '<p>Only this visitor is signed in.</p>' : '<form method="post" action="/login"><input name="user" aria-label="User"><input type="password" name="password" aria-label="Password"><button>Sign in</button></form>'}</body></html>`);
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: ['index.js', 'browser-relay.js'].map(name => ({ type: 'ESModule', path: resolve('worker', name) })),
    compatibilityDate: '2026-11-02', port: 0,
    durableObjects: { BROWSER_RELAY: { className: 'BrowserRelay', useSQLite: true } },
    bindings: { FRONTEND_ORIGIN: 'http://127.0.0.1:4173', BROWSER_HOST_KEY: KEY }
  }));
  proxyBase = (await runtime.ready).origin;
  engine = new BrowserEngine({ guardFactory: () => createNetworkGuard({
    resolveHost: async hostname => { if (hostname !== 'fixture.test') throw new Error('Fixture only'); return { address: '127.0.0.1', family: 4 }; },
    makeRequest: (options, callback) => http.request({ ...options, port: fixture.address().port }, callback)
  }) });
  await new Promise(resolve => {
    host = new RelayHost({ url: proxyBase.replace('http:', 'ws:') + '/browser/host', key: KEY, engine,
      onStatus: message => { if (message === 'Browser relay connected.') resolve(); } }).start();
  });
});
test.afterAll(async () => {
  await host?.close(); await runtime?.dispose();
  if (fixture) await new Promise(resolve => fixture.close(resolve));
});
test.beforeEach(async ({ page }) => {
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, browserSessions: true, defaultHome: 'http://fixture.test/', proxyBase } }));
});

async function clickRemote(page, selector, remote) {
  const box = await remote.locator(selector).boundingBox();
  const canvas = page.locator('#browserCanvas');
  const geometry = await canvas.evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    return { width: box.width, height: box.height, pixelsW: canvas.width, pixelsH: canvas.height };
  });
  const scale = Math.min(geometry.width / geometry.pixelsW, geometry.height / geometry.pixelsH);
  await canvas.click({ position: { x: (geometry.width - geometry.pixelsW * scale) / 2 + (box.x + box.width / 2) * scale,
    y: (geometry.height - geometry.pixelsH * scale) / 2 + (box.y + box.height / 2) * scale } });
}

test('canvas input signs into a real browser, refresh/resume keep cookies, visitors are isolated, and End session clears the context', async ({ page, browser }) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/projlib/');
  await expect(page.locator('#browserCanvas')).toHaveAttribute('data-has-frame', 'true');
  await expect(page.locator('#browserTabs')).toContainText('Fixture sign in');
  const first = [...engine.sessions.values()][0];
  const remote = first.pages.get(first.active).page;
  await clickRemote(page, '[name=user]', remote);
  await page.keyboard.type('fixture-user');
  await expect(remote.locator('[name=user]')).toHaveValue('fixture-user');
  await page.keyboard.press('Tab'); await page.keyboard.type('fixture-password');
  await expect(remote.locator('[name=password]')).toHaveValue('fixture-password');
  await page.keyboard.press('Enter');
  await expect(page.locator('#browserTabs')).toContainText('Private account');
  await expect.poll(() => page.locator('#browserCanvas').evaluate(canvas => {
    const [r,g,b] = canvas.getContext('2d').getImageData(10,10,1,1).data;
    return r < 230 && g > 240 && b < 230;
  })).toBe(true);
  await expect(page.locator('#urlInput')).toHaveValue('http://fixture.test/account');
  await page.locator('#refreshBtn').click();
  await expect(remote.locator('h1')).toHaveText('Private account');
  await page.reload();
  await expect(page.locator('#browserTabs')).toContainText('Private account');
  expect(engine.sessions.size).toBe(1);
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.route('**/hubData.json', route => route.fulfill({ json: { ...hub, browserSessions: true, defaultHome: 'http://fixture.test/account', proxyBase } }));
  await second.goto('http://127.0.0.1:4173/projlib/');
  await expect(second.locator('#browserTabs')).toContainText('Fixture sign in');
  await second.getByRole('button', { name: 'End session', exact: true }).click();
  await secondContext.close();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#browserCanvas')).toBeVisible();
  await expect.poll(() => page.locator('#browserCanvas').evaluate(canvas => canvas.width)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: 'test-results/private-browser-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.locator('#statusMessage')).toContainText('Browser session ended');
  await expect.poll(() => engine.sessions.size).toBe(0);
  expect(errors).toEqual([]);
});
