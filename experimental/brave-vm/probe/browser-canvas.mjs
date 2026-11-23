// Native Brave runs in the local Wasm guest. DevTools packets and images use
// only its local serial bridge; this module never opens a network connection.
export class BrowserCanvas {
  constructor(channel, target, { onReady = () => {}, onNavigate = () => {}, onError = () => {} } = {}) {
    this.channel = channel; this.onReady = onReady; this.onNavigate = onNavigate; this.onError = onError;
    this.sequence = 0; this.pending = new Map(); this.buffer = ''; this.session = null; this.frames = 0; this.closed = false; this.ready = false;
    this.braveAliases = true;
    this.canvas = document.createElement('canvas'); this.canvas.width = 1024; this.canvas.height = 700;
    this.canvas.tabIndex = 0; this.canvas.setAttribute('aria-label', 'Local Brave browser');
    this.canvas.style.cssText = 'display:block;width:100%;max-width:1024px;height:auto;background:white;outline:none';
    target.replaceChildren(this.canvas); this.context = this.canvas.getContext('2d', { alpha: false });
    channel.onopen = () => this.initialize().catch(onError);
    channel.onmessage = event => this.consume(new TextDecoder().decode(event.data));
    channel.onclose = () => { this.closed = true; for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('The local Brave session closed.')); } this.pending.clear(); };
    this.bindInput();
  }
  call(method, params = {}, sessionId = this.session) {
    if (this.closed) return Promise.reject(new Error('The local Brave session closed.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Brave did not respond to ' + method + '.')); }, 120000);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.channel.send(new TextEncoder().encode(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\n')); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async initialize() {
    const { targetInfos } = await this.call('Target.getTargets', {}, null);
    let targetId = targetInfos.find(target => target.type === 'page')?.targetId;
    if (!targetId) ({ targetId } = await this.call('Target.createTarget', { url: 'about:blank' }, null));
    ({ sessionId: this.session } = await this.call('Target.attachToTarget', { targetId, flatten: true }, null));
    await this.call('Page.bringToFront');
    await this.call('Page.enable');
    await this.call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false });
    await this.call('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 1024, maxHeight: 700, everyNthFrame: 1 });
    this.ready = true; this.onReady();
  }
  consume(text) {
    this.buffer += text;
    if (this.buffer.length > 2*1024*1024) throw new Error('The local browser frame exceeded its limit.');
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline+1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id) {
        const pending = this.pending.get(message.id); if (!pending) continue;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        message.error ? pending.reject(new Error('Brave rejected ' + pending.method + ' (' + message.error.code + ').')) : pending.resolve(message.result);
      } else if (message.method === 'Page.screencastFrame') this.paint(message.params, message.sessionId).catch(this.onError);
      else if (message.method === 'Page.frameNavigated' && !message.params.frame.parentId) this.onNavigate(message.params.frame.url);
    }
  }
  async paint(frame, session) {
    try {
      const bytes = Uint8Array.from(atob(frame.data), character => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      this.context.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height); bitmap.close(); this.frames++;
    } finally { await this.call('Page.screencastFrameAck', { sessionId: frame.sessionId }, session); }
  }
  async navigate(url) {
    const result = await this.call('Page.navigate', { url: url.replace(/^brave:\/\//i, 'chrome://') });
    if (result.errorText) throw new Error('Brave could not open that address (' + result.errorText + ').');
    await this.call('Page.bringToFront'); return result;
  }
  async history(offset) {
    const history = await this.call('Page.getNavigationHistory');
    const entry = history.entries[history.currentIndex+offset];
    if (entry) await this.call('Page.navigateToHistoryEntry', { entryId: entry.id });
  }
  insertText(text) { return this.call('Input.insertText', { text }); }
  bindInput() {
    const send = (method, params) => { if (this.session && !this.closed) this.call(method, params).catch(this.onError); };
    const point = event => { const bounds = this.canvas.getBoundingClientRect(); return { x: (event.clientX-bounds.left)*1024/bounds.width, y: (event.clientY-bounds.top)*700/bounds.height }; };
    const buttons = ['left', 'middle', 'right'];
    for (const [dom, type] of [['pointerdown','mousePressed'], ['pointerup','mouseReleased']]) this.canvas.addEventListener(dom, event => {
      event.preventDefault(); this.canvas.focus();
      if (dom === 'pointerdown') this.canvas.setPointerCapture(event.pointerId);
      send('Input.dispatchMouseEvent', { type, ...point(event), button: buttons[event.button] || 'none', buttons: event.buttons, clickCount: 1 });
    });
    this.canvas.addEventListener('pointermove', event => { if (!event.buttons) return; send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point(event), buttons: event.buttons }); });
    this.canvas.addEventListener('wheel', event => { event.preventDefault(); send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point(event), deltaX: event.deltaX, deltaY: event.deltaY }); }, { passive: false });
    for (const [dom, type] of [['keydown','keyDown'], ['keyup','keyUp']]) this.canvas.addEventListener(dom, event => {
      // Let Chrome dispatch its paste event; forwarding Ctrl+V to the guest
      // would use the guest's unrelated clipboard and suppress the local paste.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyV') return;
      event.preventDefault(); if (event.isComposing) return;
      const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
      send('Input.dispatchKeyEvent', { type, key: event.key, code: event.code, windowsVirtualKeyCode: event.keyCode, modifiers,
        ...(type === 'keyDown' && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey ? { text: event.key } : {}) });
    });
    this.canvas.addEventListener('paste', event => { event.preventDefault(); this.insertText(event.clipboardData.getData('text')).catch(this.onError); });
    this.canvas.addEventListener('compositionend', event => { this.insertText(event.data).catch(this.onError); });
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
  }
}
