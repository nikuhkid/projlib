// SPDX-License-Identifier: AGPL-3.0-only
export class BraveEngine {
  constructor(instance) { this.exports = instance.exports; }

  static async create(bytes) {
    let instance;
    ({ instance } = await WebAssembly.instantiate(bytes, { env: {
      projlib_panic(pointer, length) {
        const message = new TextDecoder().decode(new Uint8Array(instance.exports.memory.buffer, pointer, length));
        throw new Error('Brave engine: ' + message);
      }
    } }));
    return new BraveEngine(instance);
  }

  call(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const pointer = this.exports.allocate(bytes.length);
    if (!pointer) throw new Error('The Brave engine could not allocate its request.');
    let resultPointer, resultLength;
    try {
      new Uint8Array(this.exports.memory.buffer, pointer, bytes.length).set(bytes);
      const result = this.exports.execute(pointer, bytes.length);
      resultPointer = Number(result >> 32n);
      resultLength = Number(result & 0xffffffffn);
      const text = new TextDecoder().decode(new Uint8Array(this.exports.memory.buffer, resultPointer, resultLength));
      const message = JSON.parse(text);
      if (!message.ok) throw new Error(message.error);
      return message.value;
    } finally {
      this.exports.release(pointer, bytes.length);
      if (resultPointer) this.exports.release(resultPointer, resultLength);
    }
  }

  initialize(lists, resources) { return this.call({ operation: 'initialize', lists, resources }); }
  check(url, source, requestType, method = 'GET', mode = 'standard') {
    return this.call({ operation: 'check', url, source, requestType, method, mode });
  }
  cosmetics(url) { return this.call({ operation: 'cosmetics', url }); }
  selectors(url, classes, ids) { return this.call({ operation: 'selectors', url, classes, ids }); }
}
