import { chromium } from 'playwright';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, sep, basename } from 'node:path';
import { serveProbe } from './serve-probe.mjs';

if (!process.argv[2]) throw new Error('Pass the candidate engine directory.');
const base = resolve('.local/full-browser'); await mkdir(base, { recursive: true });
await mkdir(resolve(base, 'evidence'), { recursive: true });
const profile = await mkdtemp(resolve(base, 'profile-browser-'));
const server = await serveProbe(resolve(process.argv[2]));
const started = Date.now(); const evidence = []; let context;
try {
  for (const phase of ['export', 'import']) {
    context = await chromium.launchPersistentContext(profile, { headless: true, chromiumSandbox: true });
    const page = context.pages()[0] || await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url + '?storageProbe=1' + (process.argv.includes('--bounded-io') ? '&io=bounded' : ''));
    await page.locator('#start').click();
    await page.waitForFunction(() => window.projlibProbe?.completed || window.projlibProbe?.errors.length, undefined, { timeout: 150000 });
    const result = await page.evaluate(() => ({ completed: window.projlibProbe.completed,
      exported: Boolean(window.projlibProbe.storageExportVerified), imported: Boolean(window.projlibProbe.storageImportVerified),
      loaded: Boolean(window.projlibProbe.profileLoaded), errors: window.projlibProbe.errors }));
    if (errors.length || result.errors.length || !result.completed || (phase === 'export' ? !result.exported : !result.imported || !result.loaded)) throw new Error('The guest profile restart check failed: ' + JSON.stringify({ phase, ...result, errors }));
    evidence.push({ phase, elapsedMs: Date.now()-started, ...result });
    console.log(JSON.stringify(evidence.at(-1)));
    await context.close(); context = null;
  }
  await writeFile(resolve(base, 'evidence/profile-browser-restart.json'), JSON.stringify(evidence, null, 2));
} finally {
  await context?.close(); await server.close();
  const actualBase = await realpath(base); const actualProfile = await realpath(profile);
  // Delete only the uniquely created fixture directory inside this workspace.
  if (actualProfile.startsWith(actualBase + sep) && basename(actualProfile).startsWith('profile-browser-')) await rm(actualProfile, { recursive: true, force: true });
}
