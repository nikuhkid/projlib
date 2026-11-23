import test from 'node:test';
import assert from 'node:assert/strict';
import { GuestDisplayChannel } from '../probe/display.mjs';

test('local display accepts split serial records without retaining screen or keyboard contents in boot evidence', () => {
  const input = [];
  const channel = new GuestDisplayChannel(value => input.push(value));
  let opens = 0;
  const received = [];
  channel.onopen = () => opens++;
  channel.onmessage = event => received.push(Buffer.from(event.data));
  const record = value => 'PROJLIB_RFB_DATA:' + Buffer.from(value).toString('base64') + '\n';
  const serial = 'guest booted\nPROJLIB_RFB_READY\n' + record('RFB 003.008\n') + record('private-screen-fixture');
  for (let offset = 0; offset < serial.length; offset += 7) channel.consume(serial.slice(offset, offset + 7));
  assert.equal(opens, 1);
  assert.equal(channel.protocolHeader, 'RFB 003.008\n');
  assert.equal(Buffer.concat(received).toString(), 'RFB 003.008\nprivate-screen-fixture');
  assert.equal(channel.bootText, 'guest booted\n');
  channel.send(new TextEncoder().encode('private-keyboard-fixture'));
  assert.equal(input.length, 1);
  const encoded = input[0].slice('PROJLIB_RFB_INPUT:'.length).trim();
  assert.equal(Buffer.from(encoded, 'base64').toString(), 'private-keyboard-fixture');
  assert(!JSON.stringify({ boot: channel.bootText, header: channel.protocolHeader }).includes('private-'));
});

test('local display rejects oversized unterminated records and input before connection', () => {
  const channel = new GuestDisplayChannel(() => {});
  assert.throws(() => channel.send(Uint8Array.of(1)), /not connected/);
  assert.throws(() => channel.consume('x'.repeat(256001)), /framing/);
});

test('long guest input waits for acknowledgements and stays below terminal-buffer limits', () => {
  const input = []; const channel = new GuestDisplayChannel(value => input.push(value));
  channel.consume('PROJLIB_RFB_READY\nPROJLIB_INPUT_ACK_CAPABLE:1\n');
  const original = new TextEncoder().encode('disposable-long-input-fixture '.repeat(300));
  channel.send(original);
  assert.equal(input.length, 1);
  while (channel.inputFlight) channel.consume('PROJLIB_RFB_INPUT_ACK\n');
  assert(input.length > 1);
  assert(input.every(record => record.length < 400));
  const decoded = input.map(record => Buffer.from(record.slice('PROJLIB_RFB_INPUT:'.length).trim(), 'base64'));
  assert.deepEqual(Buffer.concat(decoded), Buffer.from(original));
  assert.equal(channel.inputBytes, 0);
  channel.close();
});

test('final profile save waits for queued keyboard input before closing the guest browser', async () => {
  const input = []; const channel = new GuestDisplayChannel(value => input.push(value));
  channel.consume('PROJLIB_RFB_READY\nPROJLIB_PROFILE_CAPABLE:1\nPROJLIB_INPUT_ACK_CAPABLE:1\nPROJLIB_CLOSE_CAPABLE:1\n');
  channel.send(new TextEncoder().encode('disposable keyboard fixture'));
  const saved = channel.snapshotProfile({ close: true });
  assert.equal(input.length, 1);
  channel.consume('PROJLIB_RFB_INPUT_ACK\n');
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(input.at(-1), 'PROJLIB_VM_CONTROL:close\n');
  channel.consume('PROJLIB_BROWSER_STOPPED\nPROJLIB_PROFILE_READY:2048\n');
  assert.equal(await saved, 2048); assert.equal(channel.browserStopped, true); channel.close();
});
