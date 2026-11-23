import test from 'node:test';
import assert from 'node:assert/strict';
import { patchLargeHeapFfi, patchQemuPointers } from '../patch-runtime.mjs';

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
