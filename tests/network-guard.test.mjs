import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { publicAddress, websiteUrl, resolvePublicHost, createNetworkGuard } from '../server/network-guard.mjs';

test('only globally routable IPs are eligible for browser egress', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1']) {
    assert.equal(publicAddress(address), false, address);
  }
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(publicAddress(address), true);
});

test('browser destinations cannot target local services, files, credentials, or alternate ports', () => {
  for (const value of ['file:///C:/Users/', 'javascript:alert(1)', 'http://localhost/', 'http://localhost./',
    'http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'https://router.home.arpa/',
    'https://db.internal/', 'https://example.com:4325/', 'https://example.com:80/', 'http://example.com:443/', 'https://user:pass@example.com/']) {
    assert.throws(() => websiteUrl(value), undefined, value);
  }
  assert.equal(websiteUrl('https://example.com/path?q=1').hostname, 'example.com');
});

test('DNS rejects private and mixed answers and returns the validated address for pinning', async () => {
  await assert.rejects(() => resolvePublicHost('example.com', async () => [{ address: '127.0.0.1', family: 4 }]));
  await assert.rejects(() => resolvePublicHost('example.com', async () => [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }]));
  let lookups = 0;
  const pinned = await resolvePublicHost('example.com', async () => { lookups++; return [{ address: '1.1.1.1', family: 4 }]; });
  assert.deepEqual(pinned, { address: '1.1.1.1', family: 4 });
  assert.equal(lookups, 1);
});

test('HTTP egress connects to the pinned address and keeps the destination Host header', async () => {
  const fixture = http.createServer((request, response) => response.end(request.headers.host));
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const guard = await createNetworkGuard({
    resolveHost: async host => { assert.equal(host, 'fixture.example.com'); return { address: '127.0.0.1', family: 4 }; },
    makeRequest: (options, handler) => {
      assert.equal(options.hostname, '127.0.0.1');
      return http.request({ ...options, port: fixture.address().port }, handler);
    }
  });
  try {
    const body = await new Promise((resolve, reject) => {
      http.get(guard.url, { path: 'http://fixture.example.com/' }, response => {
        let body = ''; response.on('data', chunk => body += chunk); response.on('end', () => resolve(body));
      }).on('error', reject);
    });
    assert.equal(body, 'fixture.example.com');
  } finally { await guard.close(); await new Promise(resolve => fixture.close(resolve)); }
});

test('CONNECT cannot open the host gateway or cloud metadata services', async () => {
  const guard = await createNetworkGuard();
  try {
    for (const destination of ['127.0.0.1:4325', '169.254.169.254:443', 'localhost:443']) {
      const result = await new Promise((resolve, reject) => {
        const address = new URL(guard.url);
        const socket = net.connect({ host: address.hostname, port: Number(address.port) }, () => socket.write(`CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\n\r\n`));
        socket.once('data', chunk => { socket.destroy(); resolve(chunk.toString()); });
        socket.once('error', reject);
      });
      assert.match(result, /403 Forbidden/);
    }
  } finally { await guard.close(); }
});
