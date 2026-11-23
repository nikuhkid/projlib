import { test, expect } from '@playwright/test';
import { createRewriteRuntime } from '../rewrite-runtime.mjs';

for (const route of ['cloudflare', 'home']) {
  test(`Brave filtering blocks before ${route} egress, applies cosmetics and scriptlets, and preserves site controls`, async ({ page }) => {
    const runtime = await createRewriteRuntime({ home: true, adblockFixture: true });
    try {
      const base = (await runtime.ready).origin;
      await page.goto(base + '/rewrite/');
      await page.getByText('Connection options', { exact: true }).click();
      if (route === 'home') {
        await page.getByLabel('Host password', { exact: true }).fill('fixture-password');
        await page.getByRole('button', { name: 'Verify host', exact: true }).click();
        await expect(page.locator('#homeRoute')).toHaveValue('home');
      }
      await page.goto(base + '/rewrite/#url=https%3A%2F%2Ffixture.test%2Fadblock');
      const site = page.frameLocator('#site');
      const siteFrame = await (await page.locator('#site').elementHandle()).contentFrame();
      async function selectMode(name) {
        // Observe the replacement document before checking effects that can also pass in about:blank.
        await Promise.all([
          page.waitForEvent('framenavigated', frame => frame === siteFrame),
          page.getByRole('button', { name, exact: true }).click()
        ]);
        await expect(site.locator('h1')).toHaveText('Adblock fixture');
      }
      await expect(site.locator('#inline')).toHaveText('true');
      await expect(site.locator('#asset')).toHaveText('true');
      await expect(site.locator('#tracker')).toHaveText('204');
      await expect(site.locator('#allowed')).toHaveText('200');
      await expect(site.locator('#blocked-socket')).toHaveText('blocked');
      await expect(page.getByRole('button', { name: 'Standard ad blocking', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#blockerMode button')).toHaveCount(3);
      await selectMode('Aggressive ad blocking');
      await expect(page.getByRole('button', { name: 'Aggressive ad blocking', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(site.locator('#inline')).toHaveText('true');
      await expect(site.locator('#cosmetic')).toBeHidden();
      await expect(site.locator('#generic')).toBeHidden();
      await expect(site.locator('#procedural')).toHaveCount(0);
      await expect(site.locator('#requests')).toHaveText('0');
      await selectMode('Disable ad blocking for this site');
      await expect(site.locator('#inline')).toHaveText('undefined');
      await expect(site.locator('#tracker')).toHaveText('200');
      await expect(site.locator('#blocked-socket')).toHaveText('connected');
      await expect(site.locator('#cosmetic')).toBeVisible();
      await expect(site.locator('#generic')).toBeVisible();
      await expect(site.locator('#procedural')).toHaveCount(1);
      await expect(site.locator('#requests')).not.toHaveText('0');
      await page.reload();
      await page.getByText('Connection options', { exact: true }).click();
      await expect(page.getByRole('button', { name: 'Disable ad blocking for this site', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Disable ad blocking for this site', exact: true })).toHaveAttribute('title', /off for this site/i);
      await expect(site.locator('#inline')).toHaveText('undefined');
      if (route === 'cloudflare') await page.screenshot({ path: 'test-results/blocker-icons-standalone.png' });
    } finally { await runtime.dispose(); }
  });
}
