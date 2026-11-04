import { test, expect } from '@playwright/test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { BrowserEngine } from '../../server/browser-engine.mjs';
import { RelayHost } from '../../server/relay-host.mjs';
import { createNetworkGuard } from '../../server/network-guard.mjs';
import { enableProxy } from './enable-proxy.mjs';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
const KEY = 'test-host-key-for-local-tests-only-1234567890x';
let runtime, fixture, engine, host, proxyBase;
test.beforeAll(async () => {
  fixture = http.createServer((request, response) => {
    if (request.url === '/input') {
      response.setHeader('content-type', 'text/html');
      response.end('<html><head><title>Input fixture</title></head><body style="margin:0"><iframe title="Cross-origin input" src="http://frame.test/drag" style="border:0;width:100%;height:320px"></iframe></body></html>');
      return;
    }
    if (request.url === '/drag') {
      response.setHeader('content-type', 'text/html');
      response.end(`<html><head><style>body{margin:0;font:18px Arial}#box{margin:30px;width:60px;height:60px;background:teal;touch-action:none}button{margin:20px}</style></head><body><button id="click">Click test</button><p id="result">Waiting</p><div id="box">Drag</div><script>
        window.wheelEvents=[];window.addEventListener('wheel',event=>window.wheelEvents.push(event.deltaY));
        const result=document.getElementById('result'),box=document.getElementById('box');let start;
        document.getElementById('click').onclick=()=>result.textContent='Click received';
        box.onpointerdown=event=>{start=event.clientX;box.setPointerCapture(event.pointerId)};
        box.onpointerup=event=>{result.textContent=event.clientX-start>150?'Drag received':'Drag incomplete'};
      </script></body></html>`);
      return;
    }
    if (request.url === '/login' && request.method === 'POST') {
      request.resume(); response.writeHead(303, { location: '/account', 'set-cookie': 'session=fixture; HttpOnly; Path=/; SameSite=Lax' }); response.end(); return;
    }
    const signedIn = request.headers.cookie?.includes('session=fixture');
    response.setHeader('content-type', 'text/html');
    response.end(`<html><head><title>${signedIn ? 'Private account' : 'Fixture sign in'}</title><style>body{background:${signedIn ? '#d0ffcf' : '#fff'};font:20px Arial;padding:24px}input,button{display:block;width:240px;padding:10px;margin:14px 0}</style></head><body><h1>${signedIn ? 'Private account' : 'Fixture sign in'}</h1>${signedIn ? '<p>Only this visitor is signed in.</p>' : '<form method="post" action="/login"><input name="user" aria-label="User"><input type="password" name="password" aria-label="Password"><button>Sign in</button></form>'}</body></html>`);
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: ['index.js', 'browser-relay.js', 'frame-protocol.js', 'rewrite-gateway.js', 'targets.js'].map(name => ({ type: 'ESModule', path: resolve('worker', name) })),
    compatibilityDate: '2026-11-02', port: 0,
    durableObjects: { BROWSER_RELAY: { className: 'BrowserRelay', useSQLite: true } },
    bindings: { FRONTEND_ORIGIN: 'http://127.0.0.1:4173', BROWSER_HOST_KEY: KEY }
  }));
  proxyBase = (await runtime.ready).origin;
  engine = new BrowserEngine({ guardFactory: () => createNetworkGuard({
    resolveHost: async hostname => { if (!['fixture.test', 'frame.test'].includes(hostname)) throw new Error('Fixture only'); return { address: '127.0.0.1', family: 4 }; },
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
  await page.route('**/hubData.json', route => route.fulfill({ json: { ...hub, rewriteProxy: false, browserSessions: true, defaultHome: 'http://fixture.test/', proxyBase } }));
});

async function canvasPoint(page, x, y) {
  const canvas = page.locator('#browserCanvas');
  const geometry = await canvas.evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    return { width: box.width, height: box.height, pixelsW: canvas.width, pixelsH: canvas.height };
  });
  const scale = Math.min(geometry.width / geometry.pixelsW, geometry.height / geometry.pixelsH);
  const viewport = [...engine.sessions.values()][0].viewport;
  return { x: (geometry.width - geometry.pixelsW * scale) / 2 + x * geometry.pixelsW / viewport.width * scale,
    y: (geometry.height - geometry.pixelsH * scale) / 2 + y * geometry.pixelsH / viewport.height * scale };
}
async function clickRemote(page, selector, remote) {
  const box = await remote.locator(selector).boundingBox();
  await page.locator('#browserCanvas').click({ position: await canvasPoint(page, box.x + box.width / 2, box.y + box.height / 2) });
}

test('canvas input signs into a real browser, refresh/resume keep cookies, visitors are isolated, and End session clears the context', async ({ page, browser }) => {
  test.setTimeout(60000);
  await page.setViewportSize({width:1800,height:1400});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/projlib/');
  await enableProxy(page);
  await expect(page.locator('#browserCanvas')).toHaveAttribute('data-has-frame', 'true');
  await expect(page.locator('#browserTabs')).toContainText('Fixture sign in');
  await expect.poll(()=>page.locator('#browserCanvas').evaluate(canvas=>canvas.width)).toBeLessThanOrEqual(1152);
  const first = [...engine.sessions.values()][0];
  const remote = first.pages.get(first.active).page;
  await clickRemote(page, '[name=user]', remote);
  await page.keyboard.type('fixture-userX');
  await expect(remote.locator('[name=user]')).toHaveValue('fixture-userX');
  await page.locator('#browserKeyboard').evaluate(input => input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })));
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
  await page.getByLabel('Stream quality').selectOption('sharp');
  await expect.poll(()=>page.locator('#browserCanvas').evaluate(canvas=>canvas.width)).toBeGreaterThan(1152);
  await page.getByLabel('Stream quality').selectOption('responsive');
  await page.locator('#refreshBtn').click();
  await expect(remote.locator('h1')).toHaveText('Private account');
  await page.reload();
  await enableProxy(page);
  await expect(page.locator('#browserTabs')).toContainText('Private account');
  expect(engine.sessions.size).toBe(1);
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.route('**/hubData.json', route => route.fulfill({ json: { ...hub, rewriteProxy: false, browserSessions: true, defaultHome: 'http://fixture.test/account', proxyBase } }));
  await second.goto('http://127.0.0.1:4173/projlib/');
  await enableProxy(second);
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

test('mouse clicks, drags, and coalesced scrolling reach a cross-origin frame at a narrow viewport', async ({ page }) => {
  const wheelPackets=[];
  page.on('websocket',socket=>socket.on('framesent',({payload})=>{
    const message=JSON.parse(payload);if(message.type==='wheel')wheelPackets.push(message);
  }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/projlib/');
  await enableProxy(page);
  await expect(page.locator('#browserCanvas')).toHaveAttribute('data-has-frame', 'true');
  const session = [...engine.sessions.values()][0];
  const remote = session.pages.get(session.active).page;
  await page.locator('#urlInput').fill('http://fixture.test/input');
  await page.getByRole('button', { name: 'Engage' }).click();
  await expect(page.locator('#browserTabs')).toContainText('Input fixture');
  const child = remote.frameLocator('iframe');
  await clickRemote(page, '#click', child);
  await expect(child.locator('#result')).toHaveText('Click received');
  const box = await child.locator('#box').boundingBox();
  const start = await canvasPoint(page, box.x + 20, box.y + 20);
  const end = await canvasPoint(page, box.x + 200, box.y + 20);
  await page.locator('#browserCanvas').scrollIntoViewIfNeeded();
  const canvasBox = await page.locator('#browserCanvas').boundingBox();
  await page.mouse.move(canvasBox.x + start.x, canvasBox.y + start.y);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + end.x, canvasBox.y + end.y, { steps: 12 });
  await page.mouse.up();
  await expect(child.locator('#result')).toHaveText('Drag received');
  await page.locator('#browserCanvas').evaluate(canvas=>{
    for(let i=0;i<100;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:2,bubbles:true,cancelable:true}));
  });
  await expect.poll(()=>child.locator('body').evaluate(()=>window.wheelEvents.reduce((sum,value)=>sum+value,0))).toBe(200);
  expect(wheelPackets).toEqual([{type:'wheel',x:0,y:200}]);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect.poll(() => engine.sessions.size).toBe(0);
});
