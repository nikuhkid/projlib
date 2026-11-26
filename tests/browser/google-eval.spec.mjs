import { test, expect } from '@playwright/test';
import { createRewriteRuntime } from '../rewrite-runtime.mjs';

let runtime, base;
test.beforeAll(async () => { runtime = await createRewriteRuntime({ home: true }); base = (await runtime.ready).origin; });
test.afterAll(async () => runtime?.dispose());

const expected = {
  valueType: 'number', value: 42, sideEffect: 5, directScope: 8,
  indirectCannotSeeLocal: true, objectIdentity: true, boxedStringIdentity: true,
  undefinedUnchanged: true, thrownType: 'RangeError', strictThisUndefined: true
};

for (const route of ['cloudflare', 'home']) for (const framed of [false, true]) for (const host of ['fixture.test', 'accounts.google.com']) {
  test(`${host} preserves eval semantics through ${route} in ${framed ? 'an iframe' : 'the top-level document'}`, async ({ page, context }) => {
    if (route === 'home') {
      const response = await context.request.post(base + '/rewrite/home/login', {
        headers: { origin: base }, data: { password: 'fixture-password' }
      });
      expect(response.status()).toBe(200);
    }
    // Retain a controller tab for bare-mux initialization in both arrangements.
    await page.goto(base + '/rewrite/');
    await expect(page.locator('#homeControls')).toBeVisible();
    const url = `https://${host}/eval-semantics`;
    const documentPage = await context.newPage();
    await documentPage.goto(framed ? base + '/rewrite/#' + new URLSearchParams({ url })
      : base + '/rewrite/site/' + encodeURIComponent(url).replace(/%2F/gi, '/'));
    const target = framed ? await (await documentPage.locator('#site').elementHandle()).contentFrame() : documentPage.mainFrame();
    expect(Boolean(target.parentFrame())).toBe(framed);
    await expect(target.locator('#evalResults')).not.toHaveText('Waiting', { timeout: 15000 });
    expect(JSON.parse(await target.locator('#evalResults').textContent())).toEqual(expected);
    const state = await (await context.request.get(base + '/rewrite/home/status')).json();
    expect(state.route).toBe(route);
    if (route === 'home') expect(state.authorized).toBe(true);
  });
}
