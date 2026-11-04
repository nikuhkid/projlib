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
      method: 'POST', credentials: 'omit', redirect: 'error', signal,
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
    const socket = new WebSocket(endpoint);
    socket.binaryType = 'arraybuffer';
    let opened = false;
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
    return [data => socket.send(data), (code, reason) => socket.close(code === 1000 || code >= 3000 ? code : 1000, reason)];
  }
}
