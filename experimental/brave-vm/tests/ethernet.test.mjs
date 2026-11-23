import test from 'node:test';
import assert from 'node:assert/strict';
import { publicWebPacket, QemuWebFilter } from '../relay/ethernet.mjs';

function packet(destination, port = 443, protocol = 6, source = '192.168.127.3') {
  const size = protocol === 6 ? 20 : 8;
  const frame = Buffer.alloc(14 + 20 + size);
  frame.writeUInt16BE(0x0800, 12); frame[14] = 0x45; frame.writeUInt16BE(20 + size, 16); frame[23] = protocol;
  Buffer.from(source.split('.').map(Number)).copy(frame, 26);
  Buffer.from(destination.split('.').map(Number)).copy(frame, 30);
  frame.writeUInt16BE(40000, 34); frame.writeUInt16BE(port, 36);
  if (protocol === 6) frame[46] = 0x50;
  else frame.writeUInt16BE(size, 38);
  return frame;
}
function qemu(frame) { const size = Buffer.alloc(4); size.writeUInt32BE(frame.length); return Buffer.concat([size, frame]); }

test('relay permits public web TCP and rejects private, metadata, alternate-port and host destinations', () => {
  assert(publicWebPacket(packet('93.184.215.14')));
  assert(publicWebPacket(packet('93.184.215.14', 80)));
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '0.0.0.0']) assert.equal(publicWebPacket(packet(ip)), false, ip);
  for (const port of [22, 445, 5900, 8443]) assert.equal(publicWebPacket(packet('93.184.215.14', port)), false);
  assert.equal(publicWebPacket(packet('93.184.215.14'), { blockedAddresses: new Set(['93.184.215.14']) }), false);
  assert.equal(publicWebPacket(packet('93.184.215.14', 443, 6, '127.0.0.1')), false);
});

test('only DHCP and virtual-gateway DNS are allowed over UDP', () => {
  const dhcp = packet('255.255.255.255', 67, 17, '0.0.0.0'); dhcp.writeUInt16BE(68, 34);
  assert(publicWebPacket(dhcp));
  assert(publicWebPacket(packet('192.168.127.1', 53, 17)));
  assert.equal(publicWebPacket(packet('8.8.8.8', 53, 17)), false);
  assert.equal(publicWebPacket(packet('192.168.127.1', 80, 17)), false);
  assert.equal(publicWebPacket(packet('93.184.215.14', 443, 17)), false);
});

test('fragmentation, encapsulation, malformed lengths and hidden transport headers cannot bypass policy', () => {
  for (const offset of [1, 0x2000, 0x8000]) { const frame = packet('93.184.215.14'); frame.writeUInt16BE(offset, 20); assert.equal(publicWebPacket(frame), false); }
  const vlan = packet('93.184.215.14'); vlan.writeUInt16BE(0x8100, 12); assert.equal(publicWebPacket(vlan), false);
  const ipv6 = packet('93.184.215.14'); ipv6.writeUInt16BE(0x86dd, 12); assert.equal(publicWebPacket(ipv6), false);
  const short = packet('93.184.215.14'); short.writeUInt16BE(2000, 16); assert.equal(publicWebPacket(short), false);
  const overlap = packet('93.184.215.14'); overlap[14] = 0x4f; assert.equal(publicWebPacket(overlap), false);
  const tcp = packet('93.184.215.14'); tcp[46] = 0xf0; assert.equal(publicWebPacket(tcp), false);
});

test('QEMU framing is independent of WebSocket fragmentation and filters coalesced packets', () => {
  const allowed = qemu(packet('93.184.215.14')), denied = qemu(packet('127.0.0.1'));
  const input = Buffer.concat([allowed, denied, allowed]);
  for (const width of [1, 3, 4, 19, 64, input.length]) {
    const filter = new QemuWebFilter(); const output = [];
    for (let index = 0; index < input.length; index += width) output.push(...filter.push(input.subarray(index, index + width)));
    assert.deepEqual(Buffer.concat(output), Buffer.concat([allowed, allowed]));
    assert.equal(filter.blocked, 1); assert.equal(filter.pending.length, 0);
  }
  const invalid = new QemuWebFilter();
  assert.throws(() => invalid.push(Buffer.from([0xff, 0xff, 0xff, 0xff])), /frame size/);
});
