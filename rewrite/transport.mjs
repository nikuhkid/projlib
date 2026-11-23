// Bare-mux transport. All HTTP and WebSocket traffic goes through our Worker.
export default class WorkerTransport {
  ready = false;
  constructor(base) { this.base = base; }
  async init() { this.ready = true; }
  meta() { return {}; }

  async request(remote, method, body, headers, signal) {
    // Fetch upload streams require HTTP/2, and a service-worker redirect may replay a form body.
    const payload = body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body;
    const response = await fetch(`${this.base}/fetch`, {
      method: 'POST', credentials: 'include', redirect: 'error', signal,
      headers: { 'x-projlib-request': encodeURIComponent(JSON.stringify({ url: remote.href, method, headers })) },
      body: payload
    });
    if (!response.ok) throw new Error(`The proxy transport returned HTTP ${response.status}.`);
    const meta = JSON.parse(decodeURIComponent(response.headers.get('x-projlib-response')));
    return { ...meta, body: response.body };
  }

  connect(url, protocols, headers, onopen, onmessage, onclose, onerror) {
    const endpoint = new URL(`${this.base}/socket`);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket;
    let closed = false;
    let opened = false;
    const start = async () => {
      const source = Object.entries(headers || {}).find(([name]) => ['origin', 'referer'].includes(name.toLowerCase()))?.[1]
        || url.href.replace(/^ws/, 'http');
      const check = await fetch(`${this.base}/adblock/socket`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.href, source }) });
      if (!check.ok) throw new Error('Brave ad blocking could not check this WebSocket.');
      if ((await check.json()).blocked) throw new Error('This WebSocket was blocked by Brave ad blocking.');
      if (closed) return;
      socket = new WebSocket(endpoint);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => socket.send(JSON.stringify({ url: url.href, protocols, headers }));
      socket.onmessage = event => {
        if (!opened) {
          try {
            const message = JSON.parse(event.data);
            if (message.type !== 'open') throw new Error('Invalid proxy handshake.');
            opened = true;
            onopen(message.protocol);
          } catch { onerror('Invalid proxy WebSocket handshake.'); socket.close(); }
          return;
        }
        onmessage(event.data);
      };
      socket.onclose = event => onclose(event.code, event.reason);
      socket.onerror = () => onerror('The proxy WebSocket connection failed.');
    };
    start().catch(error => { if (!closed) { onerror(error.message); onclose(1008, error.message); } });
    return [data => socket.send(data), (code, reason) => { closed = true; socket?.close(code === 1000 || code >= 3000 ? code : 1000, reason); }];
  }
}
