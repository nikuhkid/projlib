import { solveBreach } from '../support/breach-solver.mjs';

export async function unlockProjLib(page) {
  if (!await page.locator('#breach-gate').count()) return;
  await page.locator('#breach-matrix button').first().waitFor({ state: 'visible' });
  const cells = await page.locator('#breach-matrix button').allTextContents();
  const targets = await page.locator('#breach-sequences .breach-sequence-codes').evaluateAll(rows => rows.map(row => [...row.children].map(code => code.textContent)));
  const path = solveBreach({ size: 6, capacity: 14, cells, targets });
  for (const index of path) await page.locator(`#breach-matrix [data-cell="${index}"]`).click();
  await page.locator('#breach-gate').waitFor({ state: 'detached' });
  await page.locator('.console-container').waitFor({ state: 'visible' });
}
