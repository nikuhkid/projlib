import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';

export async function startNativeHelper(executable) {
  const key = randomBytes(32).toString('hex');
  const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  let socket;
  const close = () => { lines.close(); socket?.terminate(); child.kill(); };
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The network helper did not start.')), 10000);
      const finish = (error, value) => {
        clearTimeout(timer); child.off('error', failed); child.off('exit', exited); lines.off('line', ready);
        error ? reject(error) : resolve(value);
      };
      const failed = () => finish(new Error('The network helper could not start.'));
      const exited = () => finish(new Error('The network helper exited.'));
      const ready = text => {
        try {
          const value = JSON.parse(text).port;
          if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error();
          finish(null, value);
        } catch { finish(new Error('The network helper returned invalid startup data.')); }
      };
      child.once('error', failed); child.once('exit', exited); lines.once('line', ready);
      child.stdin.on('error', failed);
      child.stdin.end(JSON.stringify({ key }));
    });
    socket = new WebSocket(`ws://127.0.0.1:${port}/relay`, { headers: { 'x-projlib-relay-instance': key, origin: `http://127.0.0.1:${port}` }, handshakeTimeout: 10000, perMessageDeflate: false, maxPayload: 1024 * 1024 });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    child.once('exit', () => socket.terminate());
    return { socket, close };
  } catch (error) { close(); throw error; }
}
