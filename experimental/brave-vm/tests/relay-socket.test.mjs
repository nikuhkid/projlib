import test from 'node:test';
import assert from 'node:assert/strict';
import { RelaySocket } from '../probe/relay-socket.mjs';

class FixtureSocket {
  static instances = [];
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.readyState = 0; this.sent = []; FixtureSocket.instances.push(this); }
  open() { this.readyState = 1; this.protocol = 'binary'; this.onopen?.({}); }
  send(data) { this.sent.push(Uint8Array.from(data)); }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
}

test('re-verification replaces only the real relay socket and keeps the guest socket alive', async () => {
  FixtureSocket.instances = [];
  const states = []; const relay = new RelaySocket('wss://fixture.invalid/browser-vm/network', ['binary'], { Socket: FixtureSocket, onState: state => states.push(state) });
  let opens = 0, closes = 0; relay.onopen = () => opens++; relay.onclose = () => closes++;
  const first = FixtureSocket.instances[0]; first.open(); await relay.connecting;
  assert.equal(relay.readyState, relay.OPEN);
  assert.equal(relay.CONNECTING, 0); assert.equal(relay.CLOSING, 2); assert.equal(relay.CLOSED, 3);
  relay.send(Uint8Array.of(1, 2)); assert.equal(first.sent.length, 1);
  first.close(1008);
  assert.equal(relay.readyState, 1); assert.equal(closes, 0);
  relay.send(Uint8Array.of(3, 4)); assert.equal(first.sent.length, 1); assert.equal(relay.droppedBytes, 2);
  const connected = relay.reconnect(); const second = FixtureSocket.instances[1]; second.open(); await connected;
  relay.send(Uint8Array.of(5)); assert.deepEqual([...second.sent[0]], [5]);
  assert.equal(opens, 1); assert.equal(relay.readyState, 1);
  first.onclose({ code: 1008 }); assert.equal(states.at(-1).phase, 'connected');
  relay.close(); assert.equal(closes, 1); assert.equal(relay.readyState, 3);
  await assert.rejects(relay.reconnect(), /closed/);
});

test('an initially rejected relay can be verified and opened without recreating the guest socket', async () => {
  FixtureSocket.instances = [];
  const relay = new RelaySocket('wss://fixture.invalid/browser-vm/network', ['binary'], { Socket: FixtureSocket });
  const failed = relay.connecting; FixtureSocket.instances[0].close(1008);
  await assert.rejects(failed, /Verify/); await Promise.resolve();
  assert.equal(relay.readyState, 0);
  const connected = relay.reconnect(); FixtureSocket.instances[1].open(); await connected;
  assert.equal(relay.readyState, 1); relay.close();
});
