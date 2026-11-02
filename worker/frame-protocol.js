const ID = /^[a-f0-9-]{36}$/;
const MAGIC = [0x50, 0x4c, 0x46, 2];
export const MAX_JPEG_BYTES = 1350000;

// Host: magic(4), client UUID(36), sequence(4), viewport w/h(2+2), JPEG.
// Client: sequence(4), viewport w/h(2+2), JPEG. Routing identity stays at relay.
export function encodeHostFrame(clientId, frameId, width, height, jpeg) {
  if (!ID.test(clientId) || jpeg.length > MAX_JPEG_BYTES || jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Invalid frame.');
  const packet = new Uint8Array(48 + jpeg.length);
  packet.set(MAGIC); packet.set(new TextEncoder().encode(clientId), 4);
  const view = new DataView(packet.buffer);
  view.setUint32(40, frameId); view.setUint16(44, width); view.setUint16(46, height);
  packet.set(jpeg, 48);
  return packet;
}

export function decodeHostFrame(data) {
  if (!(data instanceof ArrayBuffer) || data.byteLength < 50 || data.byteLength > MAX_JPEG_BYTES + 48) throw new Error('Invalid frame size.');
  const bytes = new Uint8Array(data);
  if (MAGIC.some((value,i) => bytes[i] !== value) || bytes[48] !== 0xff || bytes[49] !== 0xd8) throw new Error('Invalid frame header.');
  const clientId = new TextDecoder().decode(bytes.subarray(4,40));
  const view = new DataView(data), width = view.getUint16(44), height = view.getUint16(46);
  if (!ID.test(clientId) || width < 320 || width > 1600 || height < 240 || height > 1200) throw new Error('Invalid frame destination.');
  return { clientId, data: data.slice(40) };
}
