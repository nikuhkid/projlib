import test from 'node:test';
import assert from 'node:assert/strict';
import { raiseSharedHeapMaximum } from '../patch-heap-import.mjs';

const integer = value => { const bytes=[]; do { const byte=value & 127; value >>>= 7; bytes.push(byte | (value ? 128 : 0)); } while (value); return bytes; };
const name = text => [text.length, ...Buffer.from(text)];
const fixture = (field = 'memory', maximum = 48000) => {
  const imports = [1, ...name('env'), ...name(field), 2, 3, ...integer(48000), ...integer(maximum)];
  return Uint8Array.from([0,97,115,109,1,0,0,0,2,...integer(imports.length),...imports]);
};

test('extended fixed heap changes only the reviewed shared import maximum and preserves the input', () => {
  const original = fixture(), saved = Uint8Array.from(original);
  const patched = raiseSharedHeapMaximum(original);
  assert.deepEqual(original, saved); assert.equal(patched.bytes.length, original.length);
  assert.deepEqual(patched.bytes.subarray(0, patched.offset), original.subarray(0, patched.offset));
  assert.deepEqual(patched.bytes.subarray(patched.offset+3), original.subarray(patched.offset+3));
  assert.deepEqual([...patched.bytes.subarray(patched.offset, patched.offset+3)], integer(57344));
  assert(WebAssembly.validate(patched.bytes));
});

test('memory comparison rejects drift, wrong imports and truncated sections', () => {
  assert.throws(() => raiseSharedHeapMaximum(fixture('other')));
  assert.throws(() => raiseSharedHeapMaximum(fixture('memory', 65535)));
  assert.throws(() => raiseSharedHeapMaximum(fixture().subarray(0, 18)));
});
