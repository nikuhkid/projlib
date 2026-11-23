import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(directory, '.local/viewer');
await mkdir(output, { recursive: true });
const revision = 'a8dfd6a3ea3c74244f5ebdaa5a7f1023007a7820';
const checksum = 'ebb8eabcd3670ce1a02e4025f03976826c289121cf631183647bd8325b003403';
const archive = resolve(directory, '.local/novnc-source.tar.gz');
let bytes;
try { bytes = await readFile(archive); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://codeload.github.com/novnc/noVNC/tar.gz/${revision}`);
  if (!response.ok) throw new Error('Could not fetch the pinned noVNC source.');
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('The noVNC source archive checksum differs.');
await writeFile(archive, bytes);
const source = resolve(directory, '.local/novnc-source');
await mkdir(source, { recursive: true });
await promisify(execFile)('tar', ['-xzf', archive, '-C', source, '--strip-components=1']);
await build({ entryPoints: [resolve(source, 'core/rfb.js')], outfile: resolve(output, 'novnc.mjs'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'linked' });
await copyFile(resolve(source, 'LICENSE.txt'), resolve(output, 'noVNC-LICENSE.txt'));
await copyFile(archive, resolve(output, 'noVNC-source.tar.gz'));
await writeFile(resolve(output, 'source.json'), JSON.stringify({ project: 'noVNC', version: '1.6.0', revision, sha256: checksum, licence: 'MPL-2.0' }, null, 2));
console.log('Built the local guest display client.');
