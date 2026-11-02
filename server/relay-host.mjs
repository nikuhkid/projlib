import WebSocket from 'ws';
import { BrowserEngine, BrowserError } from './browser-engine.mjs';
import { FrameWindow } from './frame-window.mjs';
import { InputQueue } from './input-queue.mjs';
import { encodeHostFrame } from '../worker/frame-protocol.js';

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
        const peer = { id, started: Date.now(), count: 0 };
        peer.queue = new InputQueue(message => this.command(peer, message), error => {
          this.send(peer, { type: 'error', message: error instanceof BrowserError ? error.message : 'The browser could not complete that action.', code: error.code || 'browser-error' });
        });
        this.peers.set(id, peer);
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
    this.peers.delete(id); peer.frames?.close(); peer.queue.close(); peer.unsubscribe?.();
  }
  sendFrame(peer, frame, frameId) {
    if (!peer.binary) return this.send(peer, { ...frame, frameId });
    if (this.peers.get(peer.id) !== peer || this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 256000) return false;
    this.socket.send(encodeHostFrame(peer.id, frameId, frame.width, frame.height, Buffer.from(frame.data, 'base64')));
    return true;
  }
  receive(id, message) {
    const peer = this.peers.get(id);
    if (!peer || !message || typeof message !== 'object' || Array.isArray(message)) return;
    if (message.type === 'frameAck') { peer.frames?.acknowledge(message.frameId); return; }
    if (Date.now() - peer.started >= 1000) { peer.started = Date.now(); peer.count = 0; }
    if (++peer.count > 90) { this.send(peer, { type: 'error', message: 'Too many browser commands.' }); return; }
    if (message.type === 'ping') { this.send(peer, { type: 'pong', id: Number.isSafeInteger(message.id) ? message.id : null }); return; }
    peer.queue.push(message);
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
      peer.binary = message.stream === 2;
      if (!peer.binary && session.streamQuality !== 'legacy') await this.engine.action(session, { type: 'streamQuality', quality: 'legacy' });
      else if (peer.binary && session.streamQuality === 'legacy') await this.engine.action(session, { type: 'streamQuality', quality: 'responsive' });
      peer.frames = new FrameWindow((frame, id) => this.sendFrame(peer, frame, id), { limit: peer.binary ? 2 : 1 });
      this.send(peer, { type: 'session', ...credentials });
      peer.unsubscribe = this.engine.subscribe(session, message => {
        if (message.type === 'ended') {
          peer.frames.close(); peer.session = null;
          peer.unsubscribe?.(); peer.unsubscribe = null;
        }
        this.send(peer, message);
      }, frame => peer.frames.push(frame));
      return;
    }
    if (!peer.session || !this.engine.sessions.has(peer.session.id)) throw new BrowserError('Start a browser session first.', 'session-unavailable');
    if (message.type === 'end') {
      await this.engine.end(peer.session);
      peer.frames.close();
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
