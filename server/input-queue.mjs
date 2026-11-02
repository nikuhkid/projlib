const move = command => command?.type === 'pointer' && command.phase === 'move';
const finiteWheel = command => command?.type === 'wheel' && Number.isFinite(command.x) && Number.isFinite(command.y);
const bound = value => Math.max(-1600, Math.min(1600, value));

export class InputQueue {
  constructor(execute, onError, limit = 40) { this.execute = execute; this.onError = onError; this.limit = limit; this.pending = []; }
  push(command) {
    if (this.closed) return;
    const last = this.pending.at(-1);
    if (last && move(last) && move(command)) this.pending[this.pending.length-1] = command;
    else if (last && finiteWheel(last) && finiteWheel(command)) {
      last.x = bound(last.x + command.x); last.y = bound(last.y + command.y);
    } else {
      if (this.pending.length >= this.limit) return;
      this.pending.push({ ...command });
    }
    this.drain();
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed && this.pending.length) {
        try { await this.execute(this.pending.shift()); } catch (error) { this.onError(error); }
      }
    } finally { this.running = false; }
  }
  close() { this.closed = true; this.pending.length = 0; }
}
