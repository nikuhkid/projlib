// A WebSocket-shaped channel backed by the local guest's serial console.
// Screen and keyboard data remain in this tab; this creates no network socket.
export class GuestDisplayChannel {
  constructor(writeInput) {
    this.writeInput = writeInput;
    this.binaryType = 'arraybuffer'; this.protocol = ''; this.readyState = 0;
    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    this.pending = ''; this.incoming = [];
    this.bootText = '';
    this.sentBytes = 0; this.receivedBytes = 0;
    this.protocolHeader = '';
    this.diagnostics = '';
    this.profileCapable = false; this.profileWaiter = null; this.onprofilecapability = null;
    this.closeCapable = false; this.onclosecapability = null;
    this.inputAckCapable = false; this.inputQueue = []; this.inputBytes = 0; this.inputFlight = null;
  }
  send(data) {
    if (this.readyState !== 1) throw new Error('The local guest display is not connected.');
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    this.sentBytes += bytes.length;
    for (let offset = 0; offset < bytes.length; offset += 256) {
      const encoded = btoa(String.fromCharCode(...bytes.subarray(offset, offset + 256)));
      const record = 'PROJLIB_RFB_INPUT:' + encoded + '\n';
      if (!this.inputAckCapable) this.writeInput(record);
      else {
        if (this.inputBytes + record.length > 1024*1024) throw new Error('The guest input queue is full.');
        this.inputQueue.push(record); this.inputBytes += record.length; this.drainInput();
      }
    }
  }
  drainInput() {
    if (this.inputFlight || !this.inputQueue.length || this.readyState !== 1) return;
    const record = this.inputQueue.shift();
    this.inputFlight = { length: record.length, timer: setTimeout(() => this.close(), 30000) };
    this.writeInput(record);
  }
  acknowledgeInput() {
    if (!this.inputFlight) return;
    clearTimeout(this.inputFlight.timer); this.inputBytes -= this.inputFlight.length; this.inputFlight = null;
    this.drainInput();
  }
  close() {
    this.readyState = 3; this.incoming = [];
    if (this.inputFlight) clearTimeout(this.inputFlight.timer);
    this.inputFlight = null; this.inputQueue = []; this.inputBytes = 0;
    this.finishProfile(new Error('The guest display closed before its profile was saved.'));
    this.onclose?.({ code: 1000, reason: 'Local display closed.' });
  }
  snapshotProfile({ close = false } = {}) {
    if (this.readyState !== 1 || !this.profileCapable) return Promise.reject(new Error('The guest does not support local profile snapshots.'));
    if (this.profileWaiter) return Promise.reject(new Error('A profile snapshot is already running.'));
    if (close && !this.closeCapable) return Promise.reject(new Error('This guest helper does not support normal browser shutdown.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.finishProfile(new Error('The guest profile snapshot timed out.')), close ? 240000 : 120000);
      this.profileWaiter = { resolve, reject, timer };
      const sendWhenDrained = () => {
        if (!this.profileWaiter) return;
        if (this.inputFlight || this.inputQueue.length) { setTimeout(sendWhenDrained, 25); return; }
        this.writeInput(close ? 'PROJLIB_VM_CONTROL:close\n' : 'PROJLIB_VM_CONTROL:save\n');
      };
      sendWhenDrained();
    });
  }
  finishProfile(error, size) {
    const waiter = this.profileWaiter; this.profileWaiter = null;
    if (!waiter) return;
    clearTimeout(waiter.timer); error ? waiter.reject(error) : waiter.resolve(size);
  }
  consume(data) {
    this.pending += data;
    if (this.pending.length > 256000) throw new Error('Invalid local display framing.');
    let lineEnd;
    while ((lineEnd = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, lineEnd).trimEnd(); this.pending = this.pending.slice(lineEnd + 1);
      if (line === 'PROJLIB_RFB_READY') { this.readyState = 1; this.onopen?.(); }
      else if (line === 'PROJLIB_PROFILE_CAPABLE:1') { this.profileCapable = true; this.onprofilecapability?.(); }
      else if (line === 'PROJLIB_CLOSE_CAPABLE:1') { this.closeCapable = true; this.onclosecapability?.(); }
      else if (line === 'PROJLIB_INPUT_ACK_CAPABLE:1') this.inputAckCapable = true;
      else if (line === 'PROJLIB_RFB_INPUT_ACK') this.acknowledgeInput();
      else if (line === 'PROJLIB_INPUT_PROBE_PASS') this.oninputverified?.();
      else if (line === 'PROJLIB_BROWSER_STOPPED') this.browserStopped = true;
      else if (line.startsWith('PROJLIB_PROFILE_READY:')) {
        const size = Number(line.slice('PROJLIB_PROFILE_READY:'.length));
        if (!Number.isSafeInteger(size) || size <= 0 || size > 256*1024*1024) this.finishProfile(new Error('The guest returned an invalid profile size.'));
        else this.finishProfile(null, size);
      }
      else if (line === 'PROJLIB_PROFILE_FAILED') this.finishProfile(new Error('The guest could not create a profile snapshot. The previous save is retained.'));
      else if (line.startsWith('PROJLIB_DIAGNOSTICS:')) {
        this.diagnostics = new TextDecoder().decode(Uint8Array.from(atob(line.slice('PROJLIB_DIAGNOSTICS:'.length)), character => character.charCodeAt(0)));
      }
      else if (line.startsWith('PROJLIB_RFB_DATA:')) {
        const bytes = Uint8Array.from(atob(line.slice('PROJLIB_RFB_DATA:'.length)), character => character.charCodeAt(0));
        this.receivedBytes += bytes.length;
        if (this.protocolHeader.length < 12) this.protocolHeader += new TextDecoder().decode(bytes.subarray(0, 12 - this.protocolHeader.length));
        if (this.onmessage) this.onmessage({ data: bytes.buffer });
        else { if (this.incoming.length >= 64) throw new Error('The local display did not attach.'); this.incoming.push(bytes); }
      } else if (line === 'PROJLIB_RFB_CLOSED') this.close();
      else if (this.readyState !== 1) this.bootText = (this.bootText + line + '\n').slice(-20000);
    }
  }
  flush() { for (const bytes of this.incoming) this.onmessage?.({ data: bytes.buffer }); this.incoming = []; }
}
