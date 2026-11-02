import WebSocket from 'ws';
import assert from 'node:assert/strict';

const socket = new WebSocket('wss://projlib-proxy.fabmigfarcos.workers.dev/browser/connect', { origin: 'https://nikuhkid.github.io' });
let credential, rendered = false, ready = false;
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Public browser relay timed out.')), 45000);
  socket.once('error', reject);
  socket.once('open', () => socket.send(JSON.stringify({ type: 'start', url: 'https://example.com/', viewport: { width: 1000, height: 700 } })));
  socket.on('message', data => {
    const message = JSON.parse(String(data));
    if (message.type === 'session') credential = message;
    if (message.type === 'state' && message.tabs.some(tab => tab.title === 'Example Domain')) ready = true;
    if (message.type === 'frame') { rendered = true; socket.send(JSON.stringify({ type: 'frameAck' })); }
    if (message.type === 'error') reject(new Error(message.message));
    if (ready && rendered && credential) { clearTimeout(timer); resolve(); }
  });
}).finally(() => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'end' }));
  socket.close();
});
assert.ok(credential?.sessionToken);
console.log(JSON.stringify({ publicRelay: 'connected', privateBrowser: 'example.com rendered', frameReceived: rendered, sessionEnded: true }));
