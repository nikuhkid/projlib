import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REVIEWED = '8ec544d2388ab5f77e95eb227296771bfa091f6b65ed8f5e88c4542019afd67d';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Raise only the import's declared maximum. Keep the original artifact and all
// executable instructions intact. The JS loader still allocates a fixed heap;
// this does not enable memory growth or change the guest's configured RAM.
export function raiseSharedHeapMaximum(bytes) {
  if (Buffer.from(bytes.subarray(0, 8)).toString('hex') !== '0061736d01000000') throw new Error('Invalid Wasm header.');
  let offset = 8, maximum;
  const integer = () => {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      if (offset >= bytes.length) throw new Error('Truncated Wasm integer.');
      const byte = bytes[offset++]; value += (byte & 127)*2**shift;
      if (!(byte & 128)) { if (value > 0xffffffff) throw new Error('Oversized Wasm integer.'); return value; }
    }
    throw new Error('Invalid Wasm integer.');
  };
  const name = () => { const size = integer(); if (offset+size > bytes.length) throw new Error('Truncated import.'); const value = new TextDecoder().decode(bytes.subarray(offset, offset+size)); offset += size; return value; };
  const limits = () => {
    const flags = integer(); if (![0, 1, 3].includes(flags)) throw new Error('Unexpected memory/table limits.');
    const minimum = integer(), start = offset, max = flags & 1 ? integer() : null;
    return { flags, minimum, max, start, end: offset };
  };
  while (offset < bytes.length) {
    const section = bytes[offset++], size = integer(), end = offset+size;
    if (end > bytes.length) throw new Error('Truncated Wasm section.');
    if (section === 2) {
      const entries = integer();
      for (let entry = 0; entry < entries; entry++) {
        const module = name(), field = name(), kind = bytes[offset++];
        if (kind === 0) integer();
        else if (kind === 1) { offset++; limits(); }
        else if (kind === 3) offset += 2;
        else if (kind === 2) {
          const memory = limits();
          if (maximum || module !== 'env' || field !== 'memory' || memory.flags !== 3 || memory.minimum !== 48000 || memory.max !== 48000 || memory.end-memory.start !== 3) throw new Error('The reviewed shared memory import differs.');
          maximum = memory;
        } else throw new Error('Unexpected Wasm import kind.');
        if (offset > end) throw new Error('Import exceeds its section.');
      }
      if (offset !== end) throw new Error('Unexpected import section tail.');
    }
    offset = end;
  }
  if (!maximum) throw new Error('The reviewed shared heap import is missing.');
  const patched = Uint8Array.from(bytes); let value = 57344;
  for (let index = maximum.start; index < maximum.end; index++) {
    patched[index] = value & 127; value >>>= 7;
    if (index < maximum.end-1) patched[index] |= 128;
  }
  if (value || !WebAssembly.validate(patched)) throw new Error('The patched Wasm module failed validation.');
  return { bytes: patched, offset: maximum.start };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2]);
  const original = await readFile(resolve(directory, 'qemu-system-x86_64.wasm'));
  if (hash(original) !== REVIEWED) throw new Error('The compiled candidate differs from the reviewed tuned build.');
  const patched = raiseSharedHeapMaximum(original);
  await writeFile(resolve(directory, 'qemu-system-x86_64.heap3584.wasm'), patched.bytes);
  const record = { originalSha256: REVIEWED, patchedSha256: hash(patched.bytes), changedOffset: patched.offset, maximumPagesBefore: 48000, maximumPagesAfter: 57344, initialHeapMiB: 3584, executableInstructionsChanged: false };
  await writeFile(resolve(directory, 'heap-maximum.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
}
