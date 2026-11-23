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
      await expect(site.locator('#inline')).toHaveText('true');
      await expect(site.locator('#asset')).toHaveText('true');
      await expect(site.locator('#tracker')).toHaveText('204');
      await expect(site.locator('#allowed')).toHaveText('200');
      await expect(site.locator('#blocked-socket')).toHaveText('blocked');
      await expect(page.locator('#blockerMode')).toBeEnabled();
      await page.locator('#blockerMode').selectOption('aggressive');
      await expect(site.locator('#inline')).toHaveText('true');
      await expect(site.locator('#cosmetic')).toBeHidden();
      await expect(site.locator('#generic')).toBeHidden();
      await expect(site.locator('#procedural')).toHaveCount(0);
      await expect(site.locator('#requests')).toHaveText('0');
      await page.locator('#blockerMode').selectOption('off');
      await expect(site.locator('#inline')).toHaveText('undefined');
      await expect(site.locator('#tracker')).toHaveText('200');
      await expect(site.locator('#blocked-socket')).toHaveText('connected');
      await expect(site.locator('#cosmetic')).toBeVisible();
      await expect(site.locator('#generic')).toBeVisible();
      await expect(site.locator('#procedural')).toHaveCount(1);
      await expect(site.locator('#requests')).not.toHaveText('0');
      await page.reload();
      await page.getByText('Connection options', { exact: true }).click();
      await expect(page.locator('#blockerMode')).toHaveValue('off');
      await expect(site.locator('#inline')).toHaveText('undefined');
    } finally { await runtime.dispose(); }
  });
}
