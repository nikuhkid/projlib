(function () {
  'use strict';
  const STORAGE = 'projlib_private_session';
  const specialKeys = new Set(['Enter','Tab','Escape','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']);
  class BrowserSession {
    constructor({ base, onState, onStatus, onFrame, onEnd }) {
      this.base = base; this.onState = onState; this.onStatus = onStatus; this.onFrame = onFrame; this.onEnd = onEnd;
      this.root = document.getElementById('browserView');
      this.stage = document.getElementById('browserStage');
      this.canvas = document.getElementById('browserCanvas');
      this.keyboard = document.getElementById('browserKeyboard');
      this.tabs = document.getElementById('browserTabs');
      this.quality = document.getElementById('streamQuality');
      this.quality.disabled = true;
      this.quality.addEventListener('change', () => this.send({ type: 'streamQuality', quality: this.quality.value }));
      this.root.querySelectorAll('[data-browser-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.browserAction;
        if (action === 'end') this.end();
        else if (action === 'keyboard') this.keyboard.focus({ preventScroll: true });
        else if (action === 'newTab') this.send({ type: action, url: this.currentUrl || 'https://example.com/' });
        else this.send({ type: action });
      }));
      this.bindInput();
      this.observer = new ResizeObserver(() => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => { if (this.session && !this.root.hidden) this.send({ type: 'resize', ...this.viewport() }); }, 250);
      });
      this.observer.observe(this.stage);
      window.addEventListener('pagehide', () => this.socket?.close());
      document.addEventListener('visibilitychange', () => this.send({ type: 'pause', paused: document.hidden || this.root.hidden }));
    }
    viewport() { return { width: Math.max(320, Math.min(1600, this.stage.clientWidth || 1280)), height: Math.max(240, Math.min(1200, this.stage.clientHeight || 800)) }; }
    saved(value) {
      try {
        if (value === null) sessionStorage.removeItem(STORAGE);
        else if (value) sessionStorage.setItem(STORAGE, JSON.stringify(value));
        else return JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
      } catch { return null; }
    }
    send(message) {
      if (!['wheel', 'frameAck', 'ping'].includes(message.type) && this.scrollTimer) {
        clearTimeout(this.scrollTimer); this.scrollTimer = null;
        const wheel = { type: 'wheel', x: this.scrollX, y: this.scrollY };
        this.scrollX = this.scrollY = 0;
        if (this.session && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(wheel));
      }
      if (this.socket?.readyState === WebSocket.OPEN) { this.socket.send(JSON.stringify(message)); return true; }
      return false;
    }
    async open(url) {
      this.root.hidden = false;
      this.currentUrl = url;
      if (this.session && this.socket?.readyState === WebSocket.OPEN) {
        this.send({ type: 'pause', paused: false }); this.send({ type: 'navigate', url }); return;
      }
      if (this.connecting) { this.pendingUrl = url; return; }
      this.connecting = true;
      this.socket?.close();
      const endpoint = new URL('/browser/connect', this.base);
      endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = this.socket = new WebSocket(endpoint);
      socket.binaryType = 'arraybuffer';
      this.onStatus('Connecting to the private browser on Wolfie…');
      let started = false;
      socket.addEventListener('open', () => {
        started = true;
        this.send({ type: 'start', stream: 2, url, viewport: this.viewport(), ...this.saved() });
      });
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return;
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength < 10 || event.data.byteLength > 1350008) return;
          const view = new DataView(event.data), width = view.getUint16(4), height = view.getUint16(6);
          if (width < 320 || width > 1600 || height < 240 || height > 1200) return;
          this.draw({ frameId: view.getUint32(0), width, height, jpeg: event.data.slice(8) });
          return;
        }
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'session') {
          clearTimeout(this.connectTimer);
          this.session = true; this.connecting = false;
          this.saved({ sessionId: message.sessionId, sessionToken: message.sessionToken });
          if (this.pendingUrl) { this.send({ type: 'navigate', url: this.pendingUrl }); this.pendingUrl = null; }
        } else if (message.type === 'state') {
          if (message.streamQuality) { this.quality.value = message.streamQuality; this.quality.disabled = false; }
          this.currentUrl = message.url;
          this.renderTabs(message); this.onState(message);
        } else if (message.type === 'frame') this.draw(message);
        else if (message.type === 'error') {
          this.connecting = false; this.onStatus(message.message, true);
          if (!this.session) { clearTimeout(this.connectTimer); socket.close(); }
        }
        else if (message.type === 'ended') {
          this.session = false; this.saved(null); this.clear(); this.onEnd(message.message);
          socket.close();
        } else if (message.type === 'dialog') {
          let text;
          const accept = message.kind === 'alert' ? (window.alert(message.message), true) : message.kind === 'prompt' ? (text = window.prompt(message.message, message.defaultValue || ''), text !== null) : window.confirm(message.message);
          this.send({ type: 'dialog', accept, text });
        }
      });
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return;
        const wasSession = this.session;
        this.session = false; this.connecting = false;
        clearTimeout(this.connectTimer);
        if (wasSession || !started) this.onStatus('The browser connection closed. Wolfie may be offline or busy. Press Engage to reconnect; disconnected sessions expire after one minute.', true);
      });
      socket.addEventListener('error', () => this.onStatus('Could not reach the browser on Wolfie. Press Engage to retry.', true));
      clearTimeout(this.connectTimer);
      this.connectTimer = setTimeout(() => {
        if (!this.session) { socket.close(); this.connecting = false; this.onStatus('The browser did not respond. Wolfie may be offline or busy. Press Engage to retry.', true); }
      }, 45000);
    }
    async draw(frame) {
      const socket = this.socket, generation = this.generation;
      const sequence = this.receivedFrame = (this.receivedFrame || 0) + 1;
      let picture, objectUrl;
      try {
        if (frame.jpeg && typeof createImageBitmap === 'function') picture = await createImageBitmap(new Blob([frame.jpeg], { type: 'image/jpeg' }));
        else {
          picture = new Image();
          picture.src = frame.jpeg ? (objectUrl = URL.createObjectURL(new Blob([frame.jpeg], { type: 'image/jpeg' }))) : `data:image/jpeg;base64,${frame.data}`;
          await picture.decode();
        }
        if (socket !== this.socket || generation !== this.generation || !this.session) return;
        if (sequence <= (this.presentedFrame || 0)) return;
        this.presentedFrame = sequence;
        this.imageViewport = { width: frame.width, height: frame.height };
        if (this.canvas.width !== picture.width || this.canvas.height !== picture.height) {
          this.canvas.width = picture.width; this.canvas.height = picture.height;
        }
        this.canvas.getContext('2d', { alpha: false }).drawImage(picture, 0, 0);
        this.canvas.dataset.hasFrame = 'true';
        this.onFrame();
      } catch { /* A damaged frame is replaced by the next one. */ }
      finally {
        picture?.close?.(); if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'frameAck', frameId: frame.frameId }));
      }
    }
    clear() {
      this.generation = (this.generation || 0) + 1;
      clearTimeout(this.scrollTimer); this.scrollTimer = null; this.scrollX = this.scrollY = 0;
      this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
      delete this.canvas.dataset.hasFrame; this.keyboard.value = ''; this.tabs.replaceChildren();
    }
    hide() { this.root.hidden = true; this.send({ type: 'pause', paused: true }); }
    end() { if (!this.send({ type: 'end' })) { this.saved(null); this.clear(); this.onEnd('Browser session ended.'); } }
    renderTabs(state) {
      this.tabs.replaceChildren(...state.tabs.map(tab => {
        const group = document.createElement('span'); group.className = 'browser-tab';
        const button = document.createElement('button'); button.type = 'button'; button.textContent = tab.title || 'New tab';
        button.setAttribute('aria-pressed', String(tab.id === state.activeTab)); button.title = tab.url;
        button.addEventListener('click', () => this.send({ type: 'selectTab', tabId: tab.id }));
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
        close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
        close.addEventListener('click', () => this.send({ type: 'closeTab', tabId: tab.id }));
        group.append(button, close); return group;
      }));
    }
    point(event) {
      const rect = this.canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / this.canvas.width, rect.height / this.canvas.height);
      return { x: (event.clientX - rect.left - (rect.width - this.canvas.width * scale) / 2) / scale * (this.imageViewport?.width || this.canvas.width) / this.canvas.width,
        y: (event.clientY - rect.top - (rect.height - this.canvas.height * scale) / 2) / scale * (this.imageViewport?.height || this.canvas.height) / this.canvas.height };
    }
    bindInput() {
      const pointer = (event, phase) => {
        const point = this.point(event);
        if (point.x < 0 || point.y < 0 || point.x > (this.imageViewport?.width || this.canvas.width) || point.y > (this.imageViewport?.height || this.canvas.height)) return;
        this.send({ type: 'pointer', phase, ...point, button: event.button === 1 ? 'middle' : 'left', count: event.detail === 2 ? 2 : 1 });
      };
      this.canvas.addEventListener('pointerdown', event => {
        event.preventDefault(); this.canvas.setPointerCapture(event.pointerId);
        if (event.pointerType === 'touch') this.touch = { x: event.clientX, y: event.clientY, moved: false };
        else { this.keyboard.focus({ preventScroll: true }); pointer(event, 'down'); }
      });
      this.canvas.addEventListener('pointermove', event => {
        if (this.touch) {
          const dy = this.touch.y - event.clientY;
          if (Math.abs(dy) > 4 || this.touch.moved) { this.touch.moved = true; this.send({ type: 'wheel', x: 0, y: dy * 2 }); this.touch.y = event.clientY; }
        } else if (Date.now() - (this.lastPointer || 0) > 35) { pointer(event, 'move'); this.lastPointer = Date.now(); }
      });
      this.canvas.addEventListener('pointerup', event => {
        if (this.touch) { if (!this.touch.moved) { pointer(event, 'down'); pointer(event, 'up'); } this.touch = null; }
        else pointer(event, 'up');
      });
      this.canvas.addEventListener('pointercancel', event => { this.touch = null; pointer(event, 'up'); });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
      const scroll = (x, y) => {
        this.scrollX = (this.scrollX || 0) + x; this.scrollY = (this.scrollY || 0) + y;
        if (!this.scrollTimer) this.scrollTimer = setTimeout(() => {
          this.scrollTimer = null; this.send({ type: 'wheel', x: this.scrollX, y: this.scrollY }); this.scrollX = this.scrollY = 0;
        }, 33);
      };
      this.canvas.addEventListener('wheel', event => { event.preventDefault(); scroll(event.deltaX, event.deltaY); }, { passive: false });
      for (const target of [this.canvas, this.keyboard]) {
        target.addEventListener('keydown', event => {
          if (event.isComposing) return;
          const control = event.ctrlKey || event.metaKey;
          if (control && event.key.toLowerCase() === 'v') return; // Native paste supplies text, never the host clipboard.
          if (specialKeys.has(event.key) || (control && event.key.toLowerCase() === 'a')) {
            event.preventDefault();
            const key = `${control ? 'Control+' : ''}${event.shiftKey ? 'Shift+' : ''}${control && event.key.toLowerCase() === 'a' ? 'A' : event.key}`;
            this.send({ type: 'key', key });
          } else if (target === this.canvas && event.key.length === 1 && !control && !event.altKey) {
            event.preventDefault(); this.send({ type: 'text', text: event.key });
          } else if (control || event.altKey) event.preventDefault();
        });
        target.addEventListener('paste', event => { event.preventDefault(); this.send({ type: 'text', text: event.clipboardData.getData('text/plain').slice(0,16000) }); });
      }
      const flush = () => { if (!this.composing && this.keyboard.value) { this.send({ type: 'text', text: this.keyboard.value.slice(0,16000) }); this.keyboard.value = ''; } };
      // Phone keyboards may emit input events without a useful keydown value.
      this.keyboard.addEventListener('beforeinput', event => {
        if (event.isComposing || this.composing) return;
        const key = { deleteContentBackward: 'Backspace', deleteContentForward: 'Delete', insertLineBreak: 'Enter', insertParagraph: 'Enter' }[event.inputType];
        if (key) { event.preventDefault(); this.send({ type: 'key', key }); }
      });
      this.keyboard.addEventListener('input', flush);
      this.keyboard.addEventListener('compositionstart', () => { this.composing = true; });
      this.keyboard.addEventListener('compositionend', () => { this.composing = false; flush(); });
    }
  }
  window.ProjLib.BrowserSession = BrowserSession;
})();
