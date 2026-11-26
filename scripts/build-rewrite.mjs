// SPDX-License-Identifier: AGPL-3.0-only
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { patchGoogleIndirectEval } from '../rewrite/scramjet-compat.js';

const root = resolve('.local/rewrite-assets/rewrite');
await mkdir(root, { recursive: true });
for (const file of ['index.html', 'viewer.js', 'viewer.css', 'sw.js', 'transport.mjs', 'source.html', 'LICENSE', 'NOTICE.txt']) {
  await cp(`rewrite/${file}`, `${root}/${file}`);
}
const blockerRoot = resolve('rewrite/adblock/vendor');
const blockerManifest = JSON.parse(await readFile(`${blockerRoot}/manifest.json`, 'utf8'));
for (const [name, expected] of Object.entries(blockerManifest.files)) {
  const bytes = await readFile(resolve(blockerRoot, name));
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Brave adblock snapshot changed: ' + name);
}
for (const [name, expected] of Object.entries(blockerManifest.bridgeSource)) {
  const source = (await readFile(resolve('rewrite/adblock-engine', name), 'utf8')).replaceAll('\r\n', '\n');
  if (createHash('sha256').update(source).digest('hex') !== expected) throw new Error('Rebuild the changed Brave WebAssembly bridge: ' + name);
}
await cp('rewrite/adblock', `${root}/adblock`, { recursive: true });
await build({ entryPoints: ['rewrite/adblock/blocker.js'], bundle: true, format: 'iife', globalName: 'ProjLibAdblock',
  platform: 'browser', target: 'chrome120', outfile: `${root}/adblock-worker.js` });
const cosmeticPage = await build({ entryPoints: ['rewrite/adblock/page.js'], bundle: true, write: false, format: 'iife',
  globalName: 'ProjLibCosmetics', platform: 'browser', target: 'chrome120' });
const braveCosmetics = await build({ entryPoints: ['rewrite/adblock/vendor/content_cosmetic.ts'], bundle: true, write: false,
  format: 'iife', platform: 'browser', target: 'chrome120' });
await writeFile(`${root}/adblock-cosmetic-runtime.js`, cosmeticPage.outputFiles[0].text +
  '\nconst ProjLibBraveCosmeticRuntime=' + JSON.stringify(braveCosmetics.outputFiles[0].text) + ';\n');
const packages = [
  ['scramjet', ['scramjet.all.js', 'scramjet.sync.js', 'scramjet.wasm.wasm']],
  ['bare-mux', ['index.js', 'worker.js']]
];
for (const [name, files] of packages) {
  const directory = name === 'bare-mux' ? 'baremux' : name;
  await mkdir(`${root}/vendor/${directory}`, { recursive: true });
  for (const file of files) await cp(`node_modules/@mercuryworkshop/${name}/dist/${file}`, `${root}/vendor/${directory}/${file}`);
  await cp(`node_modules/@mercuryworkshop/${name}/LICENSE`, `${root}/vendor/${directory}/LICENSE`);
}
// The pinned upstream module drops restored cookies and matches unrelated domain suffixes.
// Replace that module in both worker and page runtimes. Fail closed if the upstream build changes.
const filename = `${root}/vendor/scramjet/scramjet.all.js`;
let bundle = await readFile(filename, 'utf8');
const start = bundle.indexOf('3831:function(e,t,r){');
const end = bundle.indexOf('},1427:function(e,t,r){', start);
if (start < 0 || end < 0 || !bundle.slice(start, end).includes('this.cookies=JSON.parse(e)')) {
  throw new Error('Scramjet cookie module changed. Review the adapter before building.');
}
const result = await build({ entryPoints: ['rewrite/cookie-store.js'], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'ProjLibCookies', target: 'chrome120' });
bundle = bundle.slice(0, start) + '3831:function(e,t,r){\n' + result.outputFiles[0].text +
  '\nr.d(t,{k:()=>ProjLibCookies.CookieStore});' + bundle.slice(end);
// A resource setting cookies must not wait for a page script to acknowledge it.
// A stylesheet can block that very script, leaving the browser waiting forever to paint.
const notifications = 'for(let t in x)if(h){let r=f.dispatch(h,{scramjet$type:"cookie",cookie:t,url:e.href});"document"!==n&&"iframe"!==n&&await r}';
const acknowledgement = 'e.serviceWorker.controller.postMessage(r)}}),e.Trap("Document.prototype.cookie"';
if (!bundle.includes(notifications) || !bundle.includes(acknowledgement)) throw new Error('Scramjet cookie notifications changed.');
bundle = bundle.replace(notifications, 'for(let t of Array.isArray(x)?x:[x])h&&h.postMessage({scramjet$type:"cookie",cookie:t,url:e.href});');
bundle = bundle.replace(acknowledgement, 'void 0!==t.scramjet$token&&e.serviceWorker.controller.postMessage(r)}}),e.Trap("Document.prototype.cookie"');
// Run Brave's generated scriptlets through the same HTML/JS rewriter as the site.
const htmlRewrite = '(0,d.Qs)(await e.text(),i,t,!0)';
if (!bundle.includes(htmlRewrite)) throw new Error('Scramjet HTML rewriting changed. Review the Brave scriptlet hook.');
bundle = bundle.replace(htmlRewrite, '(0,d.Qs)(self.ProjLibBlocker?self.ProjLibBlocker.rewriteHtml(await e.text(),e.finalURL):await e.text(),i,t,!0)');
const storageStart = bundle.indexOf('5289:function(e,t,r){');
const storageEnd = bundle.indexOf('},1323:function(e,t,r){', storageStart);
if (storageStart < 0 || storageEnd < 0 || !bundle.slice(storageStart, storageEnd).includes('e.url.host+"@"')) throw new Error('Scramjet storage module changed.');
const storage = await build({ entryPoints: ['rewrite/storage.js'], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'ProjLibStorage', target: 'chrome120' });
bundle = bundle.slice(0, storageStart) + '5289:function(e,t,r){\n' + storage.outputFiles[0].text +
  '\nr.r(t);r.d(t,{default:()=>ProjLibStorage.installStorage});' + bundle.slice(storageEnd);
bundle = patchGoogleIndirectEval(bundle);
bundle = bundle.replace('//# sourceMappingURL=scramjet.all.js.map', '');
await writeFile(filename, bundle);
await cp('node_modules/tough-cookie/LICENSE', `${root}/vendor/tough-cookie-LICENSE`);
await cp('node_modules/tldts/LICENSE', `${root}/vendor/tldts-LICENSE`);
await cp('node_modules/tldts-core/LICENSE', `${root}/vendor/tldts-core-LICENSE`);

const upstreamRevision = '57ba89e3ffaded81f43cc1597f2e863b15cca6f5';
const upstreamHash = 'd4a29a730c0b24968c2524da98dea2e00b54aa73e58a352c20cfb812c90eb4c2';
const cache = resolve('.local/upstream/scramjet-57ba89e.tar.gz');
await mkdir(resolve('.local/upstream'), { recursive: true });
let upstream;
try { upstream = await readFile(cache); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://codeload.github.com/MercuryWorkshop/scramjet/tar.gz/${upstreamRevision}`);
  if (!response.ok) throw new Error(`Could not download the corresponding Scramjet source (${response.status}).`);
  upstream = Buffer.from(await response.arrayBuffer());
  await writeFile(cache, upstream);
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha256(upstream) !== upstreamHash) throw new Error('Upstream source checksum differs from the verified revision.');
await mkdir(`${root}/source`, { recursive: true });
await writeFile(`${root}/source/scramjet-57ba89e.tar.gz`, upstream);
const sourceRoot = resolve('.local/rewrite-source');
await mkdir(`${sourceRoot}/scripts`, { recursive: true });
await cp('rewrite', `${sourceRoot}/rewrite`, { recursive: true });
await cp('scripts/build-rewrite.mjs', `${sourceRoot}/scripts/build-rewrite.mjs`);
await cp('scripts/update-brave-inputs.mjs', `${sourceRoot}/scripts/update-brave-inputs.mjs`);
for (const file of ['package.json', 'package-lock.json', 'LICENSE']) await cp(file, `${sourceRoot}/${file}`);
await writeFile(`${sourceRoot}/README.md`, `# ProjLib rewriting source

The rewriting component under rewrite/, scripts/build-rewrite.mjs and scripts/update-brave-inputs.mjs is AGPL-3.0-only. See rewrite/LICENSE and rewrite/NOTICE.txt. The root LICENSE describes the separate ProjLib programs. Third-party components retain their own licences.

Install Node.js 22 or later and make tar available. Run npm ci --ignore-scripts, then npm run build:rewrite. The build recreates the deployed viewer under .local/rewrite-assets/rewrite/. It uses the pinned npm package for Scramjet 1.1.0, the readable cookie/storage adapters, rewrite/scramjet-compat.js for the Google indirect-eval correction, and explicit replacements in the build script. Compatibility replacements fail if the expected upstream module differs.

The upstream source archive is distributed beside this download as scramjet-57ba89e.tar.gz. It contains the TypeScript code, Rust rewriter, Cargo lockfile, WebAssembly build script, and upstream build instructions from revision ${upstreamRevision}. Extract it to modify and rebuild the upstream engine.

The actual Brave adblock-rust engine is pinned to ${blockerManifest.revisions.engine}. The readable JSON/WebAssembly bridge and Cargo lockfile are under rewrite/adblock-engine/. Its complete vendored dependency sources, original Rust compiler record, licences and Cargo source replacement configuration accompany the engine in rewrite/adblock/vendor/. Build with Rust's wasm32-unknown-unknown target and the lockfile to modify the bridge; the repository's isolated engine workflow records a complete candidate. Pass the downloaded artifact directory to node scripts/update-brave-inputs.mjs to replace the checked-in snapshot. Ordinary frontend builds need no Rust installation and verify all binary, source, resource and filter hashes.

The vendor directory also includes Brave's original cosmetic executor and procedural implementation, original filter-list texts and attribution, the unmodified upstream preprocessor source plus its extracted function, and complete Brave/uBlock resource source archives. Their MPL/GPL and other notices accompany these files.

The manifest and lockfile retain the original project's package scripts and dependencies for exact version resolution. This archive includes the files needed by build:rewrite. The full ProjLib source is available at https://github.com/nikuhkid/projlib.
`);
await promisify(execFile)('tar', ['-czf', `${root}/source/projlib-rewrite-source.tar.gz`, '-C', sourceRoot, 'rewrite', 'scripts', 'package.json', 'package-lock.json', 'LICENSE', 'README.md']);
const archive = await readFile(`${root}/source/projlib-rewrite-source.tar.gz`);
await writeFile(`${root}/source/manifest.json`, JSON.stringify({
  component: 'ProjLib rewriting', licence: 'AGPL-3.0-only', scramjetVersion: '1.1.0', upstreamRevision,
  checksums: { 'scramjet-57ba89e.tar.gz': upstreamHash, 'projlib-rewrite-source.tar.gz': sha256(archive),
    'scramjet.all.js': sha256(Buffer.from(bundle)) }
}, null, 2) + '\n');
console.log('Built rewriting assets in .local/rewrite-assets/');
