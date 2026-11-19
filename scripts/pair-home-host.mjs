import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const file = process.argv[2] || '.local/home-host/config.json';
const { bridgeKey } = JSON.parse(await readFile(resolve(file), 'utf8'));
if (!/^[a-f0-9]{64}$/.test(bridgeKey)) throw new Error('The local host has no valid gateway pairing key.');
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', 'HOME_GATEWAY_KEY', '--config', 'worker/wrangler.jsonc'], {
  windowsHide: true, stdio: ['pipe', 'inherit', 'inherit']
});
child.stdin.end(bridgeKey + '\n');
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
