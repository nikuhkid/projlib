import { cp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('.local/home-release');
await mkdir(root + '/server', { recursive: true });
await mkdir(root + '/scripts', { recursive: true });
for (const file of ['home-host.mjs', 'home-gateway.mjs', 'home-auth.mjs', 'home-upnp.mjs', 'home-upnp.py', 'home-panel.html', 'network-guard.mjs']) {
  await cp(`server/${file}`, `${root}/server/${file}`);
}
for (const name of ['ws', 'ipaddr.js']) await cp(`node_modules/${name}`, `${root}/node_modules/${name}`, { recursive: true });
await cp('scripts/start-home-host.ps1', `${root}/scripts/start-home-host.ps1`);
await cp('LICENSE', `${root}/LICENSE`);
await cp(process.execPath, `${root}/ProjLibHost.exe`);
const licenceCache = resolve(`.local/upstream/node-${process.version}-LICENSE`);
let nodeLicence;
try { nodeLicence = await readFile(licenceCache); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);
  if (!response.ok) throw new Error(`Could not download the licence for Node ${process.version}.`);
  nodeLicence = Buffer.from(await response.arrayBuffer());
  await mkdir(resolve('.local/upstream'), { recursive: true });
  await writeFile(licenceCache, nodeLicence);
}
await writeFile(`${root}/Node-LICENSE`, nodeLicence);
await writeFile(`${root}/package.json`, JSON.stringify({ name: 'projlib-home-host', private: true, type: 'module' }, null, 2));
await writeFile(`${root}/Start ProjLib Host.cmd`, '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\start-home-host.ps1"\r\nif errorlevel 1 pause\r\n');
const hashes = {};
for (const entry of ['server', 'scripts', 'node_modules']) {
  for (const file of await readdir(`${root}/${entry}`, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const absolute = resolve(file.parentPath, file.name);
    const relative = absolute.slice(root.length + 1).replaceAll('\\', '/');
    hashes[relative] = createHash('sha256').update(await readFile(absolute)).digest('hex');
  }
}
for (const file of ['LICENSE', 'Node-LICENSE', 'ProjLibHost.exe', 'package.json', 'Start ProjLib Host.cmd']) hashes[file] = createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex');
await writeFile(`${root}/manifest.json`, JSON.stringify({ component: 'ProjLib Host candidate', builtAt: new Date().toISOString(), hashes }, null, 2) + '\n');
console.log('Built the ProjLib Host candidate in .local/home-release/.');
