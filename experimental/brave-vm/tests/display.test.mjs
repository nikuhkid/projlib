import test from 'node:test';
import assert from 'node:assert/strict';
import { GuestDisplayChannel } from '../probe/display.mjs';

test('local display accepts split serial records without retaining screen or keyboard contents in boot evidence', async () => {
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
  await Promise.resolve();
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

test('long guest input waits for acknowledgements and stays below terminal-buffer limits', async () => {
  const input = []; const channel = new GuestDisplayChannel(value => input.push(value));
  channel.consume('PROJLIB_RFB_READY\nPROJLIB_INPUT_ACK_CAPABLE:1\n');
  const original = new TextEncoder().encode('disposable-long-input-fixture '.repeat(300));
  channel.send(original);
  await Promise.resolve();
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
  await Promise.resolve();
  assert.equal(input.length, 1);
  channel.consume('PROJLIB_RFB_INPUT_ACK\n');
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(input.at(-1), 'PROJLIB_VM_CONTROL:close\n');
  channel.consume('PROJLIB_BROWSER_STOPPED\nPROJLIB_PROFILE_READY:2048\n');
  assert.equal(await saved, 2048); assert.equal(channel.browserStopped, true); channel.close();
});

test('adjacent key press and release share one guest serial record without retaining mutable noVNC buffers', async () => {
  const input = []; const channel = new GuestDisplayChannel(value => input.push(value));
  channel.consume('PROJLIB_RFB_READY\nPROJLIB_INPUT_ACK_CAPABLE:1\n');
  const down = Uint8Array.of(4, 1, 0, 0, 0, 0, 0, 47);
  const up = Uint8Array.of(4, 0, 0, 0, 0, 0, 0, 47);
  channel.send(down); channel.send(up); down.fill(255); up.fill(255);
  await Promise.resolve();
  assert.equal(input.length, 1);
  const decoded = Buffer.from(input[0].slice('PROJLIB_RFB_INPUT:'.length).trim(), 'base64');
  assert.deepEqual([...decoded], [4,1,0,0,0,0,0,47,4,0,0,0,0,0,0,47]);
  channel.consume('PROJLIB_RFB_INPUT_ACK\n'); channel.close();
});

test('the local CDP display keeps private protocol contents out of boot evidence', async () => {
  const sent = [], received = [];
  const channel = new GuestDisplayChannel(record => sent.push(record), { protocol: 'CDP', maxRecordBytes: 2*1024*1024 });
  channel.onmessage = event => received.push(new TextDecoder().decode(event.data));
  channel.consume('boot ready\nPROJLIB_INPUT_ACK_CAPABLE:1\nPROJLIB_CDP_READY\n');
  const payload = '{"id":1,"result":{"private":"synthetic-private-profile-fixture"}}\n';
  channel.consume('PROJLIB_CDP_DATA:' + Buffer.from(payload).toString('base64') + '\n');
  assert.equal(received[0], payload); assert.equal(channel.protocolHeader, ''); assert.equal(channel.bootText, 'boot ready\n');
  channel.send(new TextEncoder().encode('{"method":"Input.insertText","params":{"text":"synthetic-private-input"}}\n'));
  await Promise.resolve(); assert(sent[0].startsWith('PROJLIB_CDP_INPUT:'));
  channel.consume('PROJLIB_CDP_INPUT_ACK\n'); channel.close();
  assert(!channel.bootText.includes('private'));
});
