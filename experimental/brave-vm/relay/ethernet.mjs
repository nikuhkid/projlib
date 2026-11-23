import { publicAddress } from '../../../server/network-guard.mjs';

const MAX_FRAME = 65536;
const address = (packet, offset) => [...packet.subarray(offset, offset + 4)].join('.');

// QEMU guests send Ethernet frames. Check every outbound packet before it reaches
// the native network stack, which otherwise has access to Wolfie's local network.
export function publicWebPacket(frame, { blockedAddresses = new Set(), guest = '192.168.127.3', gateway = '192.168.127.1' } = {}) {
  if (frame.length < 14 || frame.length > MAX_FRAME) return false;
  const type = frame.readUInt16BE(12);
  if (type === 0x0806) {
    if (frame.length < 42 || frame.readUInt16BE(14) !== 1 || frame.readUInt16BE(16) !== 0x0800 || frame[18] !== 6 || frame[19] !== 4) return false;
    return [1, 2].includes(frame.readUInt16BE(20)) && ['0.0.0.0', guest].includes(address(frame, 28))
      && [guest, gateway].includes(address(frame, 38));
  }
  // Reject VLAN encapsulation, IPv6 and other protocols rather than forwarding unchecked traffic.
  if (type !== 0x0800 || frame.length < 34 || frame[14] >>> 4 !== 4) return false;
  const header = (frame[14] & 15) * 4;
  const length = frame.readUInt16BE(16);
  if (header < 20 || header > 60 || length < header || 14 + length > frame.length || frame.readUInt16BE(20) & ~0x4000) return false;
  const source = address(frame, 26), destination = address(frame, 30);
  const start = 14 + header;
  const protocol = frame[23];
  if (protocol === 17) {
    if (length < header + 8 || frame.length < start + 8) return false;
    const from = frame.readUInt16BE(start), to = frame.readUInt16BE(start + 2), size = frame.readUInt16BE(start + 4);
    if (size < 8 || size > length - header) return false;
    if (from === 68 && to === 67 && ['0.0.0.0', guest].includes(source) && ['255.255.255.255', gateway].includes(destination)) return true;
    return source === guest && destination === gateway && to === 53;
  }
  if (protocol !== 6 || source !== guest || length < header + 20 || !publicAddress(destination)
      || blockedAddresses.has(destination) || frame.length < start + 20) return false;
  const tcpHeader = (frame[start + 12] >>> 4) * 4;
  return tcpHeader >= 20 && tcpHeader <= length - header && [80, 443].includes(frame.readUInt16BE(start + 2));
}

export class QemuWebFilter {
  constructor(options = {}) { this.options = options; this.pending = Buffer.alloc(0); this.blocked = 0; }
  push(data) {
    const chunk = Buffer.from(data);
    if (chunk.length > 1024 * 1024) throw new Error('Relay message is too large.');
    const bytes = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const accepted = [];
    let offset = 0;
    while (bytes.length - offset >= 4) {
      const size = bytes.readUInt32BE(offset);
      if (size < 14 || size > MAX_FRAME) throw new Error('Invalid QEMU frame size.');
      if (bytes.length - offset < size + 4) break;
      const frame = bytes.subarray(offset + 4, offset + 4 + size);
      if (publicWebPacket(frame, this.options)) accepted.push(bytes.subarray(offset, offset + size + 4));
      else this.blocked++;
      offset += size + 4;
    }
    this.pending = Buffer.from(bytes.subarray(offset));
    return accepted;
  }
}
