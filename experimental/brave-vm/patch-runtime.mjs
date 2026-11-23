import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGINAL = 'aa07e4b6ab4ad2925e05d2e66ced958630a4ce1d6a98e8b3342acee6bf762512';
const hash = value => createHash('sha256').update(value).digest('hex');

export function patchLargeHeapFfi(source) {
  const start = source.indexOf('function unbox_small_structs(');
  const end = source.indexOf('// Imports from the Wasm binary.', start);
  if (start < 0 || end < start) throw new Error('The pinned libffi runtime section is missing.');
  let changes = 0;
  const ffi = source.slice(start, end).replace(/HEAP(?:U|F)?(?:8|16|32|64)\[([^\]\n]*)\]/g, view =>
    view.replace(/(?<!>)>>\s*([123])\b/g, (_match, bits) => { changes++; return '>>> ' + bits; }));
  if (!changes) throw new Error('No signed pointer shifts were found in the libffi runtime.');
  return { source: source.slice(0, start) + ffi + source.slice(end), changes };
}

export function patchQemuPointers(source) {
  const read = 'const tb_ptr = memory_v.getInt32(Module.__wasm32_tb.tb_ptr_ptr, true);';
  if (!source.includes(read)) throw new Error('The reviewed QEMU JIT pointer read is missing.');
  source = source.replace(read, read.replace('getInt32', 'getUint32'));
  const start = source.indexOf('function init_wasm32_js(');
  const end = source.indexOf('function unbox_small_structs(', start);
  if (start < 0 || end < start) throw new Error('The QEMU JIT pointer initializer is missing.');
  let fields = 0;
  const initializer = source.slice(start, end).replace(/^(\s+)(tb_ptr_ptr|to_remove_instance_ptr|to_remove_instance_idx_ptr|instance_garbage_collected_ptr),$/gm,
    (_match, space, field) => { fields++; return `${space}${field}: ${field} >>> 0,`; });
  if (fields !== 4) throw new Error('The QEMU JIT pointer layout differs from the reviewed build.');
  return source.slice(0, start) + initializer + source.slice(end);
}

export function patchGuestSocketFactory(source) {
  const constructor = 'WebSocketConstructor = WebSocket;';
  if (source.split(constructor).length !== 2) throw new Error('The reviewed guest socket constructor differs.');
  return source.replace(constructor, 'WebSocketConstructor = Module["projlibRelaySocket"] || WebSocket;');
}

export function patchTtyPollTimeout(source) {
  const start = source.indexOf('function xterm_pty_old_poll(fds, nfds, timeout) {');
  const end = source.indexOf('var PTY_waitForReadableWithCallback', start);
  if (start < 0 || end < start) throw new Error('The reviewed PTY poll implementation is missing.');
  const section = source.slice(start, end);
  const call = 'stream.stream_ops.poll(stream, -1)';
  if (section.split(call).length !== 2) throw new Error('The reviewed PTY poll call differs.');
  // poll may return early. Bound the TTY wait because its EAGAIN interrupts the
  // descriptor scan; network and timer descriptors must be revisited promptly.
  return source.slice(0, start) + section.replace(call, 'stream.stream_ops.poll(stream, timeout < 0 ? 10 : Math.min(timeout, 10))') + source.slice(end);
}

export function patchTtyAtomicPointer(source) {
  const allocation = 'PTY_atomicIndex = _malloc(4) >> 2;';
  if (source.split(allocation).length !== 2) throw new Error('The reviewed PTY atomic pointer allocation differs.');
  return source.replace(allocation, 'PTY_atomicIndex = _malloc(4) >>> 2;');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2]);
  const original = await readFile(resolve(directory, 'out.upstream.js'), 'utf8').catch(() => readFile(resolve(directory, 'out.js'), 'utf8'));
  if (hash(original) !== ORIGINAL) throw new Error('The candidate runtime differs from the reviewed build.');
  const patched = patchLargeHeapFfi(original);
  patched.source = patchQemuPointers(patched.source);
  patched.source = patchGuestSocketFactory(patched.source);
  patched.source = patchTtyPollTimeout(patched.source);
  patched.source = patchTtyAtomicPointer(patched.source);
  await writeFile(resolve(directory, 'out.upstream.js'), original);
  await writeFile(resolve(directory, 'out.js'), patched.source);
  await writeFile(resolve(directory, 'runtime-patch.json'), JSON.stringify({
    originalSha256: ORIGINAL, patchedSha256: hash(patched.source), changes: patched.changes,
    qemuJitPointerCorrections: 5,
    guestRelaySocketFactory: true,
    ttyPollDeadlineForwardedAndCappedMs: 10,
    ttyAtomicPointerCorrections: 1,
    reason: 'Normalize wasm32 pointers above 2 GiB: libffi heap indices require logical shifts, and QEMU JIT DataView pointer offsets require unsigned values.'
  }, null, 2));
  console.log(JSON.stringify({ patchedHeapIndices: patched.changes }));
}
