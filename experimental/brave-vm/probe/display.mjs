// A WebSocket-shaped channel backed by the local guest's serial console.
// Screen and keyboard data remain in this tab; this creates no network socket.
export class GuestDisplayChannel {
  constructor(writeInput) {
    this.writeInput = writeInput;
    this.binaryType = 'arraybuffer'; this.protocol = ''; this.readyState = 0;
    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    this.pending = ''; this.incoming = [];
    this.bootText = '';
  }
  send(data) {
    if (this.readyState !== 1) throw new Error('The local guest display is not connected.');
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      const encoded = btoa(String.fromCharCode(...bytes.subarray(offset, offset + 4096)));
      this.writeInput('PROJLIB_RFB_INPUT:' + encoded + '\n');
    }
  }
  close() { this.readyState = 3; this.incoming = []; this.onclose?.({ code: 1000, reason: 'Local display closed.' }); }
  consume(data) {
    this.pending += data;
    if (this.pending.length > 256000) throw new Error('Invalid local display framing.');
    let lineEnd;
    while ((lineEnd = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, lineEnd).trimEnd(); this.pending = this.pending.slice(lineEnd + 1);
      if (line === 'PROJLIB_RFB_READY') { this.readyState = 1; this.onopen?.(); }
      else if (line.startsWith('PROJLIB_RFB_DATA:')) {
        const bytes = Uint8Array.from(atob(line.slice('PROJLIB_RFB_DATA:'.length)), character => character.charCodeAt(0));
        if (this.onmessage) this.onmessage({ data: bytes.buffer });
        else { if (this.incoming.length >= 64) throw new Error('The local display did not attach.'); this.incoming.push(bytes); }
      } else if (line === 'PROJLIB_RFB_CLOSED') this.close();
      else if (this.readyState === 0) this.bootText = (this.bootText + line + '\n').slice(-20000);
    }
  }
  flush() { for (const bytes of this.incoming) this.onmessage?.({ data: bytes.buffer }); this.incoming = []; }
}
