import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unlockProjLib } from './access.mjs';

const hub = JSON.parse(await readFile('hubData.json', 'utf8'));
test('console startup waits for real puzzle completion and reload locks it again', async ({ page }) => {
  let loads = 0;
  await page.route('**/hubData.json', route => { loads++; return route.fulfill({ json: { ...hub, proxyBase: '', browserSessions: false, rewriteProxy: false } }); });
  await page.goto('/projlib/');
  await expect(page.locator('#breach-matrix button')).toHaveCount(36);
  await expect(page.locator('.console-container')).toBeHidden();
  await expect(page.locator('.console-container')).toHaveAttribute('inert', '');
  expect(loads).toBe(0);
  await expect(page).toHaveTitle('ProjLib Control Node [BETA]');
  await expect(page.locator('#breach-retry,#breach-new,#breach-help,#breach-circuit')).toHaveCount(0);
  await unlockProjLib(page);
  await expect(page.locator('#homeBtn')).toBeEnabled(); expect(loads).toBe(1);
  await expect(page.locator('#scannerPanel')).toBeHidden();
  await expect(page.locator('#proxyToggle')).not.toBeChecked();
  await page.reload();
  await expect(page.locator('#breach-gate')).toBeVisible();
  await expect(page.locator('.console-container')).toBeHidden(); expect(loads).toBe(1);
});

test('an incorrect access key shows denial then redirects directly to Google', async ({ page }) => {
  let loads = 0;
  await page.route('**/hubData.json', route => { loads++; return route.fulfill({ json: hub }); });
  await page.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Google destination fixture</title>' }));
  await page.goto('/projlib/');
  await page.locator('#breach-password').fill('incorrect-test-key');
  await page.locator('#breach-password-submit').click();
  await expect(page.locator('#breach-outcome-title')).toHaveText('ACCESS DENIED');
  await expect(page.locator('.console-container')).toBeHidden();
  await page.waitForURL('https://www.google.com/'); expect(loads).toBe(0);
});

test('a failed puzzle shows denial then redirects without any circuit fallback', async ({ page }) => {
  await page.route('https://www.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Google destination fixture</title>' }));
  await page.goto('/projlib/');
  await expect(page.locator('#breach-matrix button')).toHaveCount(36);
  for (let pick = 0; pick < 14; pick++) {
    await page.locator('#breach-matrix button.available').first().click();
    if (await page.locator('#breach-outcome').isVisible()) break;
  }
  await expect(page.locator('#breach-outcome-title')).toHaveText('ACCESS DENIED');
  await expect(page.locator('#breach-circuit')).toHaveCount(0);
  await page.waitForURL('https://www.google.com/');
});
