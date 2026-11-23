// Keeps QEMU's virtual socket alive while its authenticated relay is offline.
// The server still ends the grant at twelve hours and kills its native helper.
// A fresh verification opens a new real socket; no guest traffic is buffered or
// sent while disconnected. Existing TCP flows can fail; applications must retry.
export class RelaySocket {
  constructor(url, protocols, { Socket = globalThis.WebSocket, onState = () => {} } = {}) {
    this.url = String(url); this.protocols = protocols; this.Socket = Socket; this.onState = onState;
    this.readyState = 0; this.protocol = ''; this._binaryType = 'arraybuffer';
    this.CONNECTING = 0; this.OPEN = 1; this.CLOSING = 2; this.CLOSED = 3;
    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    this.socket = null; this.connecting = null; this.pendingReject = null;
    this.everOpened = false; this.closed = false; this.droppedBytes = 0;
    void this.reconnect().catch(() => {});
  }
  get binaryType() { return this._binaryType; }
  set binaryType(value) { this._binaryType = value; if (this.socket) this.socket.binaryType = value; }
  get bufferedAmount() { return this.socket?.bufferedAmount || 0; }
  send(data) {
    if (this.closed || this.readyState !== 1) throw new Error('The guest relay socket is not open.');
    if (this.socket?.readyState === 1) this.socket.send(data);
    else this.droppedBytes += data.byteLength || 0;
  }
  reconnect() {
    if (this.closed) return Promise.reject(new Error('The guest relay socket was closed.'));
    if (this.socket?.readyState === 1) return Promise.resolve();
    if (this.connecting) return this.connecting;
    const pending = new Promise((resolve, reject) => {
      this.pendingReject = reject;
      let socket;
      try { socket = new this.Socket(this.url, this.protocols); }
      catch { this.onState({ phase: 'disconnected' }); reject(new Error('Wolfie could not be reached.')); return; }
      this.socket = socket; socket.binaryType = this.binaryType;
      this.onState({ phase: 'connecting' });
      let opened = false;
      socket.onopen = () => {
        if (this.closed || socket !== this.socket) { socket.close(); return; }
        opened = true; this.readyState = 1; this.protocol = socket.protocol || '';
        this.onState({ phase: 'connected' });
        if (!this.everOpened) { this.everOpened = true; this.onopen?.({}); }
        resolve();
      };
      socket.onmessage = event => { if (!this.closed && socket === this.socket) this.onmessage?.({ data: event.data }); };
      socket.onerror = () => {
        if (this.closed || socket !== this.socket) return;
        this.onState({ phase: 'disconnected' });
        if (!opened) reject(new Error('Verify the host before reconnecting to Wolfie.'));
      };
      socket.onclose = event => {
        if (this.closed || socket !== this.socket) return;
        this.onState({ phase: 'disconnected', code: event.code });
        if (!opened) reject(new Error('Verify the host before reconnecting to Wolfie.'));
        // Deliberately retain the already-open virtual QEMU socket. Traffic is
        // dropped until the UI verifies the host and explicitly reconnects.
      };
    });
    this.connecting = pending;
    pending.finally(() => { if (this.connecting === pending) { this.connecting = null; this.pendingReject = null; } }).catch(() => {});
    return pending;
  }
  close(code = 1000, reason = 'Guest relay closed.') {
    if (this.closed) return;
    this.closed = true; this.readyState = 3;
    this.pendingReject?.(new Error('The guest relay socket was closed.'));
    try { this.socket?.close(code, reason); } catch {}
    this.onclose?.({ code, reason, wasClean: true });
  }
}
