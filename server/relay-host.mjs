import WebSocket from 'ws';
import { BrowserEngine, BrowserError } from './browser-engine.mjs';

// Only the Worker can reach this host connection. No inbound server or public CDP.
export class RelayHost {
  constructor({ url, key, engine = new BrowserEngine(), onStatus = () => {} }) {
    const target = new URL(url);
    if (!['wss:', 'ws:'].includes(target.protocol) || (target.protocol === 'ws:' && target.hostname !== '127.0.0.1')) throw new Error('The relay must use TLS.');
    if (!/^[A-Za-z0-9_-]{43,96}$/.test(key || '')) throw new Error('A valid host key is required.');
    this.url = target.href; this.key = key; this.engine = engine; this.onStatus = onStatus;
    this.peers = new Map(); this.delay = 1000;
  }
  start() { this.stopped = false; this.connect(); return this; }
  connect() {
    if (this.stopped) return;
    const socket = this.socket = new WebSocket(this.url, { headers: { 'x-projlib-host-key': this.key }, maxPayload: 100000, handshakeTimeout: 15000 });
    socket.on('open', () => { this.delay = 1000; this.onStatus('Browser relay connected.'); });
    socket.on('message', data => {
      if (String(data) === 'pong') return;
      let envelope; try { envelope = JSON.parse(String(data)); } catch { return; }
      const id = envelope.clientId;
      if (envelope.type === 'join') {
        this.release(id);
        this.peers.set(id, { id, started: Date.now(), count: 0, sequence: Promise.resolve() });
      } else if (envelope.type === 'leave') this.release(id);
      else if (envelope.type === 'message') this.receive(id, envelope.message);
    });
    socket.on('error', () => {}); // Never log URLs, payloads, keyboard input, or secrets.
    socket.on('close', () => {
      clearInterval(this.heartbeat);
      for (const id of [...this.peers.keys()]) this.release(id);
      if (!this.stopped) {
        this.onStatus('Browser relay disconnected; reconnecting.');
        this.reconnect = setTimeout(() => this.connect(), this.delay);
        this.delay = Math.min(this.delay * 2, 30000);
      }
    });
    this.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, 25000);
    this.heartbeat.unref();
  }
  send(peer, message) {
    if (this.peers.get(peer.id) !== peer || this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 2500000) return false;
    this.socket.send(JSON.stringify({ type: 'message', clientId: peer.id, message }));
    return true;
  }
  release(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id); clearTimeout(peer.frameTimer); peer.pendingFrame = null; peer.unsubscribe?.();
  }
  frame(peer, frame) {
    peer.pendingFrame = frame;
    if (peer.awaitingFrame && Date.now() - peer.frameSent < 5000) return;
    if (this.send(peer, frame)) {
      peer.pendingFrame = null; peer.awaitingFrame = true; peer.frameSent = Date.now();
    } else if (!peer.frameTimer && this.peers.get(peer.id) === peer) {
      peer.frameTimer = setTimeout(() => { peer.frameTimer = null; if (peer.pendingFrame) this.frame(peer, peer.pendingFrame); }, 100);
      peer.frameTimer.unref();
    }
  }
  receive(id, message) {
    const peer = this.peers.get(id);
    if (!peer || !message || typeof message !== 'object' || Array.isArray(message)) return;
    if (Date.now() - peer.started >= 1000) { peer.started = Date.now(); peer.count = 0; }
    if (++peer.count > 90) { this.send(peer, { type: 'error', message: 'Too many browser commands.' }); return; }
    if (message.type === 'frameAck') {
      peer.awaitingFrame = false;
      if (peer.pendingFrame) this.frame(peer, peer.pendingFrame);
      return;
    }
    if (peer.queued >= 40) return;
    peer.queued = (peer.queued || 0) + 1;
    peer.sequence = peer.sequence.then(() => this.command(peer, message)).catch(error => {
      this.send(peer, { type: 'error', message: error instanceof BrowserError ? error.message : 'The browser could not complete that action.', code: error.code || 'browser-error' });
    }).finally(() => { peer.queued--; });
  }
  async command(peer, message) {
    if (this.peers.get(peer.id) !== peer) return;
    if (message.type === 'start') {
      if (peer.session) throw new BrowserError('A browser session is already open.');
      let credentials;
      if (message.sessionId && message.sessionToken) {
        try {
          this.engine.get(message.sessionId, message.sessionToken);
          credentials = { sessionId: message.sessionId, sessionToken: message.sessionToken };
        } catch { /* Expired session: create a clean one instead. */ }
      }
      credentials ||= await this.engine.create(message.url, message.viewport);
      const session = this.engine.get(credentials.sessionId, credentials.sessionToken);
      if (this.peers.get(peer.id) !== peer) { this.engine.scheduleDisconnect(session); return; }
      if (session.viewers) throw new BrowserError('This session is already open in another connection.');
      peer.session = session;
      this.send(peer, { type: 'session', ...credentials });
      // One in-flight image and one latest pending image per visitor.
      peer.unsubscribe = this.engine.subscribe(session, message => {
        if (message.type === 'ended') {
          clearTimeout(peer.frameTimer); peer.pendingFrame = null; peer.session = null;
          peer.unsubscribe?.(); peer.unsubscribe = null;
        }
        this.send(peer, message);
      }, frame => this.frame(peer, frame));
      return;
    }
    if (!peer.session || !this.engine.sessions.has(peer.session.id)) throw new BrowserError('Start a browser session first.', 'session-unavailable');
    if (message.type === 'end') {
      await this.engine.end(peer.session);
      clearTimeout(peer.frameTimer); peer.pendingFrame = null;
      peer.unsubscribe?.(); peer.unsubscribe = null; peer.session = null; return;
    }
    await this.engine.action(peer.session, message);
  }
  async close() {
    this.stopped = true; clearTimeout(this.reconnect); clearInterval(this.heartbeat);
    for (const id of [...this.peers.keys()]) this.release(id);
    this.socket?.close(1000, 'Host stopped.');
    await this.engine.close();
  }
}
