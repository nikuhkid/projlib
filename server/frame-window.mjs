// Bounded latency: a small number of unacknowledged frames and one latest image.
export class FrameWindow {
  constructor(send, { limit = 2, timeoutMs = 3000 } = {}) {
    this.send = send; this.limit = limit; this.timeoutMs = timeoutMs;
    this.inflight = new Map(); this.sequence = 0;
  }
  push(frame) { if (!this.closed) { this.pending = frame; this.pump(); } }
  acknowledge(id) {
    if (id === undefined && this.limit === 1) id = this.inflight.keys().next().value;
    if (this.inflight.delete(id)) this.pump();
  }
  pump() {
    clearTimeout(this.timer);
    if (this.closed) return;
    const now = Date.now();
    for (const [id, sent] of this.inflight) if (now-sent >= this.timeoutMs) this.inflight.delete(id);
    if (this.pending == null) return;
    if (this.inflight.size < this.limit) {
      const id = (this.sequence + 1) >>> 0;
      if (this.send(this.pending, id)) {
        this.sequence = id; this.inflight.set(id, now); this.pending = null; return;
      }
    }
    const oldest = this.inflight.values().next().value;
    this.timer = setTimeout(() => this.pump(), this.inflight.size >= this.limit ? Math.max(1, this.timeoutMs-(now-oldest)) : 33);
    this.timer.unref();
  }
  close() { this.closed = true; clearTimeout(this.timer); this.pending = null; this.inflight.clear(); }
}
