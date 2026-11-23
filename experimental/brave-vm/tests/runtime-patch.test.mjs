import test from 'node:test';
import assert from 'node:assert/strict';
import { patchLargeHeapFfi, patchQemuPointers, patchTtyPollTimeout, patchTtyAtomicPointer } from '../patch-runtime.mjs';

test('FFI heap indices retain the high address bit without changing signed data shifts elsewhere', () => {
  const source = `const signedData = -8 >> 2;
function unbox_small_structs(ptr) { return HEAPU32[(ptr >> 2) + 0 >>> 0]; }
// Imports from the Wasm binary.
const otherSignedData = -16 >> 3;`;
  const { source: patched, changes } = patchLargeHeapFfi(source);
  assert.equal(changes, 1);
  assert(patched.includes('const signedData = -8 >> 2;'));
  assert(patched.includes('const otherSignedData = -16 >> 3;'));
  const highPointer = 0x80000020 | 0;
  const memory = { [0x80000020 >>> 2]: 123 };
  const run = code => new Function('HEAPU32', code + '\nreturn unbox_small_structs;')(memory)(highPointer);
  assert.equal(run(source), undefined);
  assert.equal(run(patched), 123);
});

test('guest poll forwards zero and short deadlines and caps indefinite TTY waits', () => {
  const original = `function xterm_pty_old_poll(fds, nfds, timeout) { let nonzero = stream.stream_ops.poll(stream, -1); return nonzero; }\nvar PTY_waitForReadableWithCallback = () => {};`;
  const deadlines = [], waits = []; const stream = { stream_ops: { poll: (_stream, timeout) => { deadlines.push(timeout); return 0; } } };
  const poll = new Function('stream', 'PTY_askToWaitAgain', patchTtyPollTimeout(original) + '\nreturn xterm_pty_old_poll;')(stream, timeout => waits.push(timeout));
  for (const timeout of [0, 5, -1, 1000]) poll(0, 0, timeout);
  assert.deepEqual(deadlines, [0, 0, 0, 0]); assert.deepEqual(waits, [5, 10, 10]);
  stream.stream_ops.poll = () => 1; poll(0, 0, 5);
  assert.equal(waits.length, 3, 'a ready descriptor must prevent a terminal wait');
});

test('the terminal atomic wait retains high heap addresses as nonnegative indices', () => {
  const original = 'let PTY_atomicIndex; PTY_atomicIndex = _malloc(4) >> 2; return PTY_atomicIndex;';
  const allocation = () => 0x80000020 | 0;
  assert(new Function('_malloc', original)(allocation) < 0);
  assert.equal(new Function('_malloc', patchTtyAtomicPointer(original))(allocation), 0x80000020 >>> 2);
});

test('QEMU JIT pointer fields preserve high-bit wasm32 addresses for DataView access', () => {
  const source = `function read() { const tb_ptr = memory_v.getInt32(Module.__wasm32_tb.tb_ptr_ptr, true); }
function init_wasm32_js(tb_ptr_ptr, cur_core_num, to_remove_instance_ptr, to_remove_instance_idx_ptr, instance_garbage_collected_ptr) {
  Module.__wasm32_tb = {
    tb_ptr_ptr,
    cur_core_num,
    to_remove_instance_ptr,
    to_remove_instance_idx_ptr,
    instance_garbage_collected_ptr,
  };
}
function unbox_small_structs() {}`;
  const patched = patchQemuPointers(source);
  assert(patched.includes('memory_v.getUint32(Module.__wasm32_tb.tb_ptr_ptr, true)'));
  const module = {};
  const init = new Function('Module', patched + '\nreturn init_wasm32_js;')(module);
  init(0x80000020 | 0, 2, 0x80000030 | 0, 0x80000040 | 0, 0x80000050 | 0);
  assert.deepEqual(module.__wasm32_tb, { tb_ptr_ptr: 0x80000020, cur_core_num: 2,
    to_remove_instance_ptr: 0x80000030, to_remove_instance_idx_ptr: 0x80000040, instance_garbage_collected_ptr: 0x80000050 });
});
