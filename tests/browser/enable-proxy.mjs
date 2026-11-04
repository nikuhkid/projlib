export async function enableProxy(page) {
  await page.locator('#scannerBtn').click();
  await page.locator('#proxyToggle').check();
}
