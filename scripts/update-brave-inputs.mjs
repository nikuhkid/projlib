// SPDX-License-Identifier: AGPL-3.0-only
// Explicit updater: normal builds use the checked-in, hashed snapshot.
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const destination = resolve('rewrite/adblock/vendor');
const cache = resolve('.local/brave-inputs');
const artifactDirectory = resolve(process.argv[2] || '.local/brave-adblock-final');
await mkdir(destination, { recursive: true });
await mkdir(resolve(destination, 'filter-sources'), { recursive: true });
await mkdir(cache, { recursive: true });
const revisions = {
  engine: '1108c61472dd5a29ae56388ee936048c4fe5a69f',
  resources: 'b84ad0fd6663a88c1402bc06a4abd5ab8be8fb3c',
  mirror: 'fe6a274730b345ed91ff45c5c72a411b371dd0ef',
  core: '89d7419b40e907125dc4713e81cd4af4211beb71',
  packager: '92d922f0a6570828603f8df70a2b35299d9b7999',
  ublock: 'cfa955fa8e1732e895e59fc6b8014e2317695ff3'
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(url) {
  const filename = resolve(cache, sha256(url));
  try { return await readFile(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Download returned ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(filename, bytes);
  return bytes;
}
const raw = (repository, revision, path) => `https://raw.githubusercontent.com/${repository}/${revision}/${path}`;
const catalog = JSON.parse(await download(raw('brave/adblock-resources', revisions.resources, 'filter_lists/list_catalog.json')));
const upstreamPreprocessor = (await download(raw('brave/brave-core-crx-packager', revisions.packager, 'lib/adBlockRustUtils.js'))).toString();
await writeFile(resolve(destination, 'brave-packager-original.js'), upstreamPreprocessor);
const start = upstreamPreprocessor.indexOf('const IF_CONDITIONS = new Map(');
const end = upstreamPreprocessor.indexOf('const checkAdblockRustV086Compat', start);
if (start < 0 || end < 0) throw new Error('Review the changed Brave preprocessor before updating.');
await writeFile(resolve(destination, 'brave-preprocess.mjs'), '// MPL-2.0. Extracted unchanged from the accompanying brave-packager-original.js.\n' + upstreamPreprocessor.slice(start, end) + '\nexport { preprocess };\n');
const { preprocess } = await import(pathToFileURL(resolve(destination, 'brave-preprocess.mjs')));
const titles = ['Brave Default Adblock Filters', 'Brave Default Privacy Filters', 'Brave First Party Adblock Filters'];
const listSources = [];
const lists = [];
for (const title of titles) {
  const entry = catalog.find(item => item.title === title);
  if (!entry) throw new Error('Brave removed a selected default list: ' + title);
  const parts = await Promise.all(entry.sources.map(async source => {
    const sourceHash = createHash('md5').update(source.url).digest('hex');
    const mirrorUrl = raw('brave/adblock-lists-mirror', revisions.mirror, `lists/${sourceHash}.txt`);
    const bytes = await download(mirrorUrl);
    await writeFile(resolve(destination, 'filter-sources', sourceHash + '.txt'), bytes);
    const title = source.title || entry.title;
    let { data } = preprocess({ title, data: bytes.toString() });
    if (!title.startsWith('Brave ')) data = data.split('\n').filter(line => !line.includes('+js(brave-')).join('\n');
    listSources.push({ title, originalUrl: source.url, mirrorUrl, sourceFile: 'filter-sources/' + sourceHash + '.txt', sha256: sha256(bytes), bytes: bytes.length });
    return data;
  }));
  lists.push({ name: title, firstParty: !entry.first_party_protections, permissions: entry.permission_mask || 0, text: parts.join('\n') });
}

const archive = await download(`https://codeload.github.com/brave/uBlock/tar.gz/${revisions.ublock}`);
const archivePath = resolve(cache, 'ublock-source.tar.gz');
await writeFile(archivePath, archive);
const { stdout: paths } = await exec('tar', ['-tf', archivePath], { maxBuffer: 8 * 1024 * 1024 });
if (paths.trim().split(/\r?\n/).some(path => path.startsWith('/') || path.split('/').includes('..'))) throw new Error('Unsafe upstream archive path.');
await exec('tar', ['-xf', archivePath, '-C', cache]);
const ublock = resolve(cache, 'uBlock-' + revisions.ublock);
const { builtinScriptlets } = await import(pathToFileURL(resolve(ublock, 'src/js/resources/scriptlets.js')));
const { default: redirects } = await import(pathToFileURL(resolve(ublock, 'src/js/redirect-resources.js')));
const mime = { '.js': 'application/javascript', '.json': 'application/json', '.html': 'text/html', '.txt': 'text/plain', '.gif': 'image/gif', '.png': 'image/png', '.mp3': 'audio/mp3', '.mp4': 'video/mp4', '.xml': 'text/xml', '.css': 'text/css' };
const resources = [];
for (const [name, properties] of redirects) {
  if (name === 'google-ima-dai.js') continue; // Brave's packager excludes this resource.
  const path = resolve(ublock, 'src/web_accessible_resources', name);
  if (!path.startsWith(resolve(ublock, 'src/web_accessible_resources') + sep)) throw new Error('Unsafe redirect resource path.');
  const type = name === 'empty' ? 'application/octet-stream' : mime[extname(name)];
  if (!type) throw new Error('Review the new resource MIME type: ' + name);
  let bytes = await readFile(path);
  if (['application/javascript', 'text/html', 'text/plain'].includes(type)) bytes = Buffer.from(bytes.toString().replaceAll('\r', ''));
  resources.push({ name, aliases: Array.isArray(properties.alias) ? properties.alias : properties.alias ? [properties.alias] : [], kind: { mime: type }, content: bytes.toString('base64') });
}
resources.push(...JSON.parse(await download(raw('brave/adblock-resources', revisions.resources, 'dist/resources.json'))));
resources.push(...builtinScriptlets.map(scriptlet => ({ name: scriptlet.name, aliases: scriptlet.aliases || [], kind: { mime: 'application/javascript' }, content: Buffer.from(scriptlet.fn.toString()).toString('base64'), dependencies: scriptlet.dependencies || [], permission: scriptlet.requiresTrust ? 1 : 0 })));
await writeFile(resolve(destination, 'filters.json'), JSON.stringify({ lists }));
await writeFile(resolve(destination, 'resources.json'), JSON.stringify(resources));
for (const name of ['content_cosmetic.ts', 'procedural_filters.ts']) {
  await writeFile(resolve(destination, name), await download(raw('brave/brave-core', revisions.core, 'components/cosmetic_filters/resources/data/' + name)));
}
await writeFile(resolve(destination, 'Brave-MPL-2.0'), await download(raw('brave/adblock-rust', revisions.engine, 'LICENSE')));
await cp(resolve(ublock, 'LICENSE.txt'), resolve(destination, 'uBlock-GPL-3.0'));
await cp(archivePath, resolve(cache, 'ublock-published-source.tar.gz'));
const wasm = await readFile(resolve(artifactDirectory, 'brave-adblock.wasm'));
await writeFile(resolve(destination, 'brave-adblock.wasm'), wasm);
for (const name of ['dependencies-source.tar.gz', 'dependencies.json', 'cargo-config.toml', 'rust-toolchain.txt']) {
  await cp(resolve(artifactDirectory, name), resolve(destination, name));
}
await cp(archivePath, resolve(destination, 'ublock-source.tar.gz'));
await writeFile(resolve(destination, 'brave-resources-source.tar.gz'),
  await download(`https://codeload.github.com/brave/adblock-resources/tar.gz/${revisions.resources}`));
for (const name of ['LICENSE-MIT', 'LICENSE-APACHE']) {
  await writeFile(resolve(destination, 'Rust-' + name), await download(raw('rust-lang/rust', '0ef1bc386059596dada8fb65b50425aab2ea637a', name)));
}
const manifest = { engine: 'brave/adblock-rust', version: '0.13.6', revisions, updatedAt: new Date().toISOString(), lists: listSources, resources: resources.length, files: {} };
manifest.lists.sort((a, b) => a.originalUrl.localeCompare(b.originalUrl));
for (const name of ['brave-adblock.wasm', 'filters.json', 'resources.json', 'content_cosmetic.ts', 'procedural_filters.ts', 'brave-preprocess.mjs', 'brave-packager-original.js', 'Brave-MPL-2.0', 'uBlock-GPL-3.0', 'dependencies-source.tar.gz', 'dependencies.json', 'cargo-config.toml', 'rust-toolchain.txt', 'ublock-source.tar.gz', 'brave-resources-source.tar.gz', 'Rust-LICENSE-MIT', 'Rust-LICENSE-APACHE']) manifest.files[name] = sha256(await readFile(resolve(destination, name)));
manifest.bridgeSource = {};
for (const name of ['src/lib.rs', 'Cargo.toml', 'Cargo.lock']) manifest.bridgeSource[name] = sha256((await readFile(resolve('rewrite/adblock-engine', name), 'utf8')).replaceAll('\r\n', '\n'));
for (const source of manifest.lists) manifest.files[source.sourceFile] = source.sha256;
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ engine: manifest.engine, version: manifest.version, sourceLists: listSources.length, listBytes: lists.reduce((sum, list) => sum + list.text.length, 0), resources: resources.length, wasmBytes: wasm.length }));
