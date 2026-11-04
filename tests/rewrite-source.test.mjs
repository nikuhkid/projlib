import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('deployed source downloads match their manifest and include the adaptations and upstream WebAssembly source', async () => {
  const root = '.local/rewrite-assets/rewrite';
  const manifest = JSON.parse(await readFile(`${root}/source/manifest.json`, 'utf8'));
  for (const name of ['projlib-rewrite-source.tar.gz', 'scramjet-57ba89e.tar.gz']) {
    const bytes = await readFile(`${root}/source/${name}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.checksums[name]);
  }
  const bundle = await readFile(`${root}/vendor/scramjet/scramjet.all.js`);
  assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.checksums['scramjet.all.js']);
  const run = promisify(execFile);
  const own = (await run('tar', ['-tzf', `${root}/source/projlib-rewrite-source.tar.gz`])).stdout;
  for (const path of ['rewrite/LICENSE', 'rewrite/cookie-store.js', 'rewrite/storage.js', 'scripts/build-rewrite.mjs', 'package-lock.json']) assert.ok(own.includes(path), path);
  assert.ok(!own.includes('browser-host-key'));
  const upstream = (await run('tar', ['-tzf', `${root}/source/scramjet-57ba89e.tar.gz`])).stdout;
  assert.ok(upstream.includes('/rewriter/wasm/src/lib.rs'));
  assert.ok(upstream.includes('/rewriter/wasm/build.sh'));
});
