import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export function upnpBridge(python) {
  const child = spawn(python, ['-u', fileURLToPath(new URL('./home-upnp.py', import.meta.url))],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = [];
  let queue = Promise.resolve();
  let dead = false;
  const fail = error => { for (const entry of waiting.splice(0)) entry.reject(error); };
  child.on('error', error => { dead = true; fail(error); });
  child.on('exit', () => { dead = true; fail(new Error('The UPnP helper stopped.')); });
  child.stdin.on('error', error => { dead = true; fail(error); });
  child.stderr.resume();
  createInterface({ input: child.stdout }).on('line', line => {
    const entry = waiting.shift();
    if (!entry) return;
    try {
      const message = JSON.parse(line);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error));
    } catch (error) { entry.reject(error); }
  });
  return {
    call(command) {
      const operation = queue.then(() => new Promise((resolve, reject) => {
        if (dead || child.exitCode !== null || child.killed) return reject(new Error('The UPnP helper is unavailable.'));
        const timer = setTimeout(() => { dead = true; child.kill(); fail(new Error('The UPnP router did not respond within 45 seconds.')); }, 45000);
        waiting.push({ resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
        child.stdin.write(JSON.stringify(command) + '\n');
      }));
      queue = operation.catch(() => {});
      return operation;
    },
    close() { child.stdin.end(); }
  };
}
