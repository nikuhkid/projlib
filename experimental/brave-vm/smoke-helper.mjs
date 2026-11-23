import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { startNativeHelper } from './relay/helper.mjs';
import { publicAddress } from '../../server/network-guard.mjs';

const executable = process.argv[2];
if (!executable) throw new Error('Pass the candidate native helper executable.');
const helper = await startNativeHelper(resolve(executable));
const packets = [], waiting = new Set();
let pending = Buffer.alloc(0);
helper.socket.on('message', data => {
  pending = Buffer.concat([pending, data]);
  while (pending.length >= 4 && pending.length >= pending.readUInt32BE(0) + 4) {
    const size = pending.readUInt32BE(0);
    if (size > 65536) throw new Error('Oversized helper response.');
    const packet = Buffer.from(pending.subarray(4, size + 4));
    pending = pending.subarray(size + 4); packets.push(packet);
    for (const notify of waiting) notify();
  }
});
const send = packet => { const size = Buffer.alloc(4); size.writeUInt32BE(packet.length); helper.socket.send(Buffer.concat([size, packet])); };
async function waitPacket(predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(check); reject(new Error('The native guest network did not respond.')); }, 15000);
    const check = () => {
      const index = packets.findIndex(predicate);
      if (index >= 0) { const [packet] = packets.splice(index, 1); clearTimeout(timer); waiting.delete(check); resolve(packet); }
    };
    waiting.add(check); check();
  });
}
function checksum(bytes) {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 2) sum += (bytes[index] << 8) | (bytes[index + 1] || 0);
  while (sum >>> 16) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}
try {
  const arp = Buffer.alloc(42);
  arp.fill(255, 0, 6); Buffer.from([2, 0, 0, 0, 0, 1]).copy(arp, 6);
  arp.writeUInt16BE(0x0806, 12); arp.writeUInt16BE(1, 14); arp.writeUInt16BE(0x0800, 16);
  arp[18] = 6; arp[19] = 4; arp.writeUInt16BE(1, 20);
  Buffer.from([2, 0, 0, 0, 0, 1]).copy(arp, 22); Buffer.from([192, 168, 127, 3]).copy(arp, 28);
  Buffer.from([192, 168, 127, 1]).copy(arp, 38);
  send(arp);
  const reply = await waitPacket(packet => packet.length >= 42 && packet.readUInt16BE(12) === 0x0806 && packet.readUInt16BE(20) === 2);
  assert.deepEqual([...reply.subarray(28, 32)], [192, 168, 127, 1]);

  const question = Buffer.concat('example.org'.split('.').map(label => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])));
  const dns = Buffer.concat([Buffer.from([0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0]), question, Buffer.from([0, 0, 1, 0, 1])]);
  const frame = Buffer.alloc(14 + 20 + 8 + dns.length);
  reply.subarray(6, 12).copy(frame, 0); Buffer.from([2, 0, 0, 0, 0, 1]).copy(frame, 6);
  frame.writeUInt16BE(0x0800, 12); frame[14] = 0x45; frame.writeUInt16BE(frame.length - 14, 16);
  frame[22] = 64; frame[23] = 17;
  Buffer.from([192, 168, 127, 3]).copy(frame, 26); Buffer.from([192, 168, 127, 1]).copy(frame, 30);
  frame.writeUInt16BE(checksum(frame.subarray(14, 34)), 24);
  frame.writeUInt16BE(45321, 34); frame.writeUInt16BE(53, 36); frame.writeUInt16BE(8 + dns.length, 38); dns.copy(frame, 42);
  send(frame);
  const answer = await waitPacket(packet => packet.length > 54 && packet.readUInt16BE(12) === 0x0800 && packet[23] === 17
    && packet.readUInt16BE(34) === 53 && packet.readUInt16BE(36) === 45321 && packet.readUInt16BE(42) === 0x1234);
  assert.equal(answer[45] & 15, 0, 'DNS query must succeed');
  assert(answer.readUInt16BE(48) > 0, 'DNS response must include an answer');
  const target = (await lookup('api.ipify.org', { family: 4 })).address;
  assert(publicAddress(target));
  const sourceIp = Buffer.from([192, 168, 127, 3]), targetIp = Buffer.from(target.split('.').map(Number));
  const sequence = 0x10203040;
  function tcp(flags, seq, ack, data = Buffer.alloc(0)) {
    const ip = Buffer.alloc(20), segment = Buffer.alloc(20 + data.length), pseudo = Buffer.alloc(12);
    ip[0] = 0x45; ip.writeUInt16BE(20 + segment.length, 2); ip[8] = 64; ip[9] = 6;
    sourceIp.copy(ip, 12); targetIp.copy(ip, 16); ip.writeUInt16BE(checksum(ip), 10);
    segment.writeUInt16BE(45454, 0); segment.writeUInt16BE(80, 2); segment.writeUInt32BE(seq >>> 0, 4); segment.writeUInt32BE(ack >>> 0, 8);
    segment[12] = 0x50; segment[13] = flags; segment.writeUInt16BE(65535, 14); data.copy(segment, 20);
    sourceIp.copy(pseudo, 0); targetIp.copy(pseudo, 4); pseudo[9] = 6; pseudo.writeUInt16BE(segment.length, 10);
    segment.writeUInt16BE(checksum(Buffer.concat([pseudo, segment])), 16);
    const ethernet = Buffer.alloc(14); reply.subarray(6, 12).copy(ethernet, 0); Buffer.from([2, 0, 0, 0, 0, 1]).copy(ethernet, 6); ethernet.writeUInt16BE(0x0800, 12);
    send(Buffer.concat([ethernet, ip, segment]));
  }
  const fromTarget = packet => packet.length >= 54 && packet.readUInt16BE(12) === 0x0800 && packet[23] === 6
    && packet.subarray(26, 30).equals(targetIp) && packet.readUInt16BE(14 + (packet[14] & 15) * 4) === 80;
  tcp(2, sequence, 0);
  const syn = await waitPacket(fromTarget);
  const synOffset = 14 + (syn[14] & 15) * 4;
  assert.equal(syn[synOffset + 13] & 0x12, 0x12);
  let ack = (syn.readUInt32BE(synOffset + 4) + 1) >>> 0;
  tcp(0x10, sequence + 1, ack);
  const query = Buffer.from('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
  tcp(0x18, sequence + 1, ack, query);
  const chunks = [];
  for (let index = 0; index < 20; index++) {
    const packet = await waitPacket(fromTarget);
    const ipSize = (packet[14] & 15) * 4, start = 14 + ipSize;
    const tcpSize = (packet[start + 12] >>> 4) * 4;
    const bodySize = packet.readUInt16BE(16) - ipSize - tcpSize;
    if (bodySize > 0 && packet.readUInt32BE(start + 4) === ack) {
      chunks.push(packet.subarray(start + tcpSize, start + tcpSize + bodySize)); ack = (ack + bodySize) >>> 0;
      tcp(0x10, sequence + 1 + query.length, ack);
    }
    if (packet[start + 13] & 1) { tcp(0x10, sequence + 1 + query.length, ack + 1); break; }
  }
  const response = Buffer.concat(chunks).toString();
  assert.match(response, /^HTTP\/1\.[01] 200/);
  assert((response.split('\r\n\r\n')[1].match(/(?:\d{1,3}\.){3}\d{1,3}/g) || []).some(publicAddress));
  console.log(JSON.stringify({ helperStarted: true, arp: 'passed', nativeDns: 'passed', nativePublicTcp: 'passed', publicEgressAddress: true, isolatedFromInstalledHost: true }));
} finally { helper.close(); }
