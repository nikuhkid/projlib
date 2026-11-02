import http from 'node:http';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function publicAddress(address) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    return parsed.range() === 'unicast';
  } catch { return false; }
}

export function websiteUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !host.includes('.') || ipaddr.isValid(host.replace(/^\[|\]$/g, '')) ||
      /(^|\.)(localhost|local|localdomain|internal|lan|home|invalid)$/.test(host) || host.endsWith('.home.arpa') ||
      url.port) {
    throw new Error('Use a public HTTP or HTTPS website on its standard port.');
  }
  return url;
}

export async function resolvePublicHost(hostname, resolver = lookup) {
  const addresses = await resolver(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) {
    throw new Error('Local and private network destinations are unavailable.');
  }
  // The connection uses this IP, not a second DNS lookup that could rebind.
  return addresses.find(entry => entry.family === 4) || addresses[0];
}

export async function createNetworkGuard({ port = 0, resolveHost = resolvePublicHost, connect = net.connect, makeRequest = http.request, maxSockets = 128 } = {}) {
  const sockets = new Set();
  function track(socket) {
    if (sockets.size >= maxSockets) { socket.destroy(); return false; }
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(120000, () => socket.destroy());
    return true;
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (request, response) => {
    try {
      const target = websiteUrl(request.url);
      if (target.protocol !== 'http:') throw new Error('HTTPS must use CONNECT.');
      const pinned = await resolveHost(target.hostname);
      const headers = { ...request.headers, host: target.host };
      for (const name of ['proxy-authorization', 'proxy-connection', 'connection']) delete headers[name];
      const upstream = makeRequest({ hostname: pinned.address, family: pinned.family, port: 80,
        method: request.method, path: target.pathname + target.search, headers, agent: false }, result => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      });
      upstream.on('socket', socket => track(socket));
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502);
        response.end('The destination could not be reached.');
      });
      request.pipe(upstream);
    } catch {
      response.writeHead(403);
      response.end('This destination is not available.');
    }
  });
  server.on('connection', track);
  server.on('connect', async (request, client, head) => {
    try {
      const target = websiteUrl(`https://${request.url}/`);
      if (target.port && target.port !== '443') throw new Error('Unsupported port.');
      const pinned = await resolveHost(target.hostname);
      const upstream = connect({ host: pinned.address, family: pinned.family, port: 443 });
      if (!track(upstream)) throw new Error('Connection limit reached.');
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => client.destroy());
      client.once('close', () => upstream.destroy());
      upstream.once('close', () => client.destroy());
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  // Cleartext websocket upgrades are not needed by HTTPS account services.
  server.on('upgrade', (request, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
