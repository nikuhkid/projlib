import { mkdir, writeFile } from 'node:fs/promises';
import { BrowserEngine } from '../server/browser-engine.mjs';

await mkdir('test-results', { recursive: true });
const engine = new BrowserEngine({ maxSessions: 1 });
try {
  for (const [name, url] of [['facebook','https://www.facebook.com/'], ['instagram','https://www.instagram.com/accounts/login/'], ['chatgpt','https://chatgpt.com/']]) {
    const credentials = await engine.create(url);
    const session = engine.get(credentials.sessionId, credentials.sessionToken);
    const page = session.pages.get(session.active).page;
    await page.locator('body').waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const result = { name, url: page.url(), title: await page.title(),
      text: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000),
      passwordFields: await page.locator('input[type=password]').count(),
      userAgent: await page.evaluate(() => navigator.userAgent).catch(() => '') };
    await page.screenshot({ path: `test-results/browser-${name}.png` }).catch(() => {});
    await writeFile(`test-results/browser-${name}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    await engine.end(session);
  }
} finally { await engine.close(); }
