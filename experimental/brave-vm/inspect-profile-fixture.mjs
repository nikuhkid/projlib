import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { serveProbe } from './serve-probe.mjs';

const [engine, profilePath, portText] = process.argv.slice(2);
if (!engine || !profilePath || !portText) throw new Error('Pass engine, dedicated fixture browser profile, and its original loopback port.');
const profile = await realpath(profilePath), base = await realpath('.local/full-browser');
assert.equal(dirname(profile), base); assert(basename(profile).startsWith('brave-browser-'));
assert.equal(JSON.parse(await readFile(resolve(profile, '.projlib-lab.json'), 'utf8')).kind, 'projlib-brave-lab');
const port = Number(portText); assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
const server = await serveProbe(await realpath(engine), port);
const browser = await chromium.launchPersistentContext(profile, { headless: true, chromiumSandbox: true });
try {
  const page = browser.pages()[0] || await browser.newPage(); await page.goto(server.url);
  const state = await page.evaluate(async () => {
    const { loadProfile } = await import('/profile-store.mjs'); const saved = await loadProfile();
    if (!saved) throw new Error('The dedicated fixture has no saved profile.');
    const text = new TextDecoder(); const bytes = saved.bytes;
    for (let offset = 0; offset + 512 <= bytes.length;) {
      const header = bytes.subarray(offset, offset+512);
      const name = text.decode(header.subarray(0, 100)).split('\0')[0];
      const size = parseInt(text.decode(header.subarray(124, 136)).replace(/\0/g, '').trim() || '0', 8);
      if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length) throw new Error('Invalid fixture tar record.');
      if (name === 'profile/Default/Preferences') {
        const preferences = JSON.parse(text.decode(bytes.subarray(offset+512, offset+512+size)));
        return { savedAt: saved.savedAt, compressedBytes: saved.compressedBytes,
          exitType: preferences.profile?.exit_type, exitedCleanly: preferences.profile?.exited_cleanly };
      }
      if (!name) break;
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    throw new Error('Brave preferences were not present in the saved fixture.');
  });
  // Report only exit metadata, never profile contents, cookies, or Sync material.
  console.log(JSON.stringify(state));
  // Chromium records an OS-session/SIGTERM close as SessionEnded. Crashed is
  // distinct; accepting arbitrary or missing exit state would hide data loss.
  assert(['Normal', 'SessionEnded'].includes(state.exitType), 'the saved fixture still has a crash or unknown exit state');
} finally { await browser.close(); await server.close(); }
