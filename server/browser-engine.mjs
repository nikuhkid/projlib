import { EventEmitter } from 'node:events';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { freemem } from 'node:os';
import { chromium } from 'playwright';
import { createNetworkGuard, websiteUrl } from './network-guard.mjs';

const TOKEN = /^[A-Za-z0-9_-]{20,96}$/;
const KEYS = new Set(['Enter', 'Shift+Enter', 'Tab', 'Shift+Tab', 'Escape', 'Backspace', 'Delete',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown',
  'Control+A', 'Control+Backspace', 'Control+ArrowLeft', 'Control+ArrowRight',
  'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+Home', 'Shift+End']);
const digest = value => createHash('sha256').update(String(value)).digest();
const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value)) || min));
const STREAMS = {
  legacy: { quality: 55, maxWidth: 1600, maxHeight: 1200, interval: 125 },
  responsive: { quality: 42, maxWidth: 1152, maxHeight: 864, interval: 50 },
  sharp: { quality: 65, maxWidth: 1600, maxHeight: 1200, interval: 67 }
};
export class BrowserError extends Error {
  constructor(message, code = 'browser-error') { super(message); this.code = code; }
}

export class BrowserEngine {
  constructor({ maxSessions = 2, idleMs = 20 * 60 * 1000, disconnectMs = 60000,
    minFreeBytes = 1024 ** 3, guardFactory = createNetworkGuard, launch = options => chromium.launch(options) } = {}) {
    this.maxSessions = maxSessions;
    this.idleMs = idleMs;
    this.disconnectMs = disconnectMs;
    this.minFreeBytes = minFreeBytes;
    this.guardFactory = guardFactory;
    this.launch = launch;
    this.sessions = new Map();
    this.starts = [];
    this.timer = setInterval(() => this.sweep(), 10000);
    this.timer.unref();
  }

  async ensureBrowser() {
    if (!this.starting) this.starting = (async () => {
      if (freemem() < this.minFreeBytes) throw new BrowserError('Wolfie has too little free memory to start a browser.', 'busy');
      this.guard = await this.guardFactory();
      try {
        this.browser = await this.launch({ headless: true, chromiumSandbox: true,
          proxy: { server: this.guard.url }, args: ['--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
        const guard = this.guard;
        this.browser.on('disconnected', () => {
          for (const session of [...this.sessions.values()]) this.end(session, 'The browser stopped. Start a new session.');
          this.starting = null;
          guard.close().catch(() => {});
        });
      } catch (error) {
        await this.guard.close(); throw error;
      }
    })();
    try { await this.starting; } catch (error) { this.starting = null; throw error; }
    return this.browser;
  }

  async create(url, viewport = {}) {
    websiteUrl(url);
    const now = Date.now();
    this.starts = this.starts.filter(time => now - time < 10 * 60 * 1000);
    if (this.sessions.size >= this.maxSessions || this.starts.length >= 10) throw new BrowserError('The private browser is busy. Try again shortly.', 'busy');
    this.starts.push(now);
    const id = randomBytes(18).toString('base64url');
    const token = randomBytes(32).toString('base64url');
    const session = { id, tokenHash: digest(token), events: new EventEmitter(), pages: new Map(),
      viewport: { width: clamp(viewport.width || 1280, 320, 1600), height: clamp(viewport.height || 800, 240, 1200) },
      lastInput: now, viewers: 0, sequence: Promise.resolve(), queued: 0, lastFrame: 0, streamQuality: 'responsive' };
    this.sessions.set(id, session);
    try {
      const browser = await this.ensureBrowser();
      session.context = await browser.newContext({ viewport: session.viewport, deviceScaleFactor: 1, acceptDownloads: false, permissions: [] });
      if (!this.sessions.has(id)) { await session.context.close(); throw new BrowserError('The session was closed.'); }
      await session.context.route('**/*', route => {
        try {
          const address = route.request().url();
          if (!/^(about:blank|data:|blob:)/i.test(address)) websiteUrl(address);
          return route.continue();
        } catch { return route.abort('blockedbyclient'); }
      });
      session.context.on('page', page => this.attachPage(session, page).catch(() => this.sendError(session)));
      const page = await session.context.newPage();
      await this.attachPage(session, page);
      const record = [...session.pages.values()].find(record => record.page === page);
      await this.navigate(session, record, url);
      this.scheduleDisconnect(session);
      return { sessionId: id, sessionToken: token, idleMs: this.idleMs };
    } catch (error) { await this.end(session); throw error; }
  }

  get(id, token) {
    const session = this.sessions.get(id);
    if (!session || !TOKEN.test(String(token || '')) || !timingSafeEqual(session.tokenHash, digest(token))) {
      throw new BrowserError('This browser session is no longer available.', 'session-unavailable');
    }
    return session;
  }

  async attachPage(session, page) {
    const existing = [...session.pages.values()].find(record => record.page === page);
    if (existing) return existing.ready;
    if (!this.sessions.has(session.id) || session.pages.size >= 4) { await page.close(); return; }
    const record = { id: randomBytes(9).toString('base64url'), page, title: 'New tab', busy: false };
    session.pages.set(record.id, record);
    session.active = record.id;
    page.setDefaultTimeout(15000);
    page.on('download', download => download.cancel().catch(() => {}));
    page.on('filechooser', chooser => { chooser.setFiles([]).catch(() => {}); this.sendError(session, 'File uploads are not available in this browser view yet.'); });
    page.on('dialog', dialog => {
      record.dialog = dialog;
      session.events.emit('message', { type: 'dialog', kind: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() });
    });
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) this.publishState(session); });
    page.on('domcontentloaded', () => {
      page.title().then(title => { record.title = title; this.publishState(session); }).catch(() => {});
    });
    page.on('load', () => { record.busy = false; this.publishState(session); });
    page.on('close', () => {
      session.pages.delete(record.id);
      if (session.active === record.id) session.active = [...session.pages.keys()].at(-1);
      if (!session.pages.size) this.end(session, 'The browser window was closed.');
      else { this.publishState(session); this.capture(session).catch(() => {}); }
    });
    record.ready = (async () => {
      record.cdp = await session.context.newCDPSession(page);
      record.cdp.on('Page.screencastFrame', event => {
        record.cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        if (session.active !== record.id || session.viewers < 1 || session.paused || event.data.length > 1800000) return;
        session.pendingFrame = { tab: record.id, data: event.data, width: session.viewport.width, height: session.viewport.height };
        if (!session.frameTimer) {
          session.frameTimer = setTimeout(() => {
            session.frameTimer = null;
            const frame = session.pendingFrame; session.pendingFrame = null;
            if (!frame || !this.sessions.has(session.id) || session.active !== frame.tab || session.viewers < 1 || session.paused) return;
            session.lastFrame = Date.now();
            session.events.emit('frame', { type: 'frame', data: frame.data, width: frame.width, height: frame.height });
          }, Math.max(0, STREAMS[session.streamQuality].interval - (Date.now() - session.lastFrame)));
          session.frameTimer.unref();
        }
      });
      await this.capture(session);
      this.publishState(session);
    })();
    return record.ready;
  }

  state(session) {
    const active = session.pages.get(session.active);
    return { type: 'state', url: active?.page.url() || '', busy: Boolean(active?.busy),
      activeTab: session.active, viewport: session.viewport, streamQuality: session.streamQuality,
      tabs: [...session.pages.values()].map(record => ({ id: record.id, title: record.title, url: record.page.url() })) };
  }
  publishState(session) { if (this.sessions.has(session.id)) session.events.emit('message', this.state(session)); }
  sendError(session, message = 'The browser could not complete that action.') { session.events.emit('message', { type: 'error', message }); }

  async capture(session) {
    for (const record of session.pages.values()) {
      if (!record.cdp) continue;
      const wanted = record.id === session.active && session.viewers > 0 && !session.paused;
      if (wanted === Boolean(record.capturing)) continue;
      record.capturing = wanted;
      const { quality, maxWidth, maxHeight } = STREAMS[session.streamQuality];
      if (wanted) await record.cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth, maxHeight, everyNthFrame: 1 });
      else await record.cdp.send('Page.stopScreencast').catch(() => {});
    }
  }

  subscribe(session, onMessage, onFrame) {
    clearTimeout(session.disconnectTimer);
    session.viewers++;
    session.lastInput = Date.now();
    session.events.on('message', onMessage);
    session.events.on('frame', onFrame);
    onMessage(this.state(session));
    this.capture(session).catch(() => this.sendError(session));
    return () => {
      session.events.off('message', onMessage); session.events.off('frame', onFrame);
      session.viewers = Math.max(0, session.viewers - 1);
      this.capture(session).catch(() => {});
      this.scheduleDisconnect(session);
    };
  }
  scheduleDisconnect(session) {
    if (!session.viewers && this.sessions.has(session.id)) {
      clearTimeout(session.disconnectTimer);
      session.disconnectTimer = setTimeout(() => this.end(session), this.disconnectMs);
      session.disconnectTimer.unref();
    }
  }

  async navigate(session, record, url) {
    websiteUrl(url);
    record.busy = true; this.publishState(session);
    try { await record.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch { this.sendError(session, 'That page could not be opened. Local and private network addresses are unavailable.'); }
    finally { record.busy = false; this.publishState(session); }
  }

  action(session, command) {
    if (!this.sessions.has(session.id)) throw new BrowserError('The browser session ended.', 'session-unavailable');
    if (session.queued >= 40) throw new BrowserError('The browser is busy.', 'busy');
    session.queued++;
    const run = session.sequence.then(() => this.perform(session, command));
    session.sequence = run.catch(() => {}).finally(() => { session.queued--; });
    return run;
  }
  async perform(session, command) {
    const record = session.pages.get(session.active);
    if (!record) throw new BrowserError('No browser tab is open.');
    const page = record.page;
    const type = command?.type;
    session.lastInput = Date.now();
    if (type === 'navigate') await this.navigate(session, record, command.url);
    else if (type === 'reload') { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); this.publishState(session); }
    else if (type === 'back' || type === 'forward') {
      await page[type === 'back' ? 'goBack' : 'goForward']({ waitUntil: 'domcontentloaded', timeout: 30000 }); this.publishState(session);
    } else if (type === 'text') {
      if (typeof command.text !== 'string' || command.text.length > 16000) throw new BrowserError('Text is too long.');
      await page.keyboard.insertText(command.text);
    } else if (type === 'key') {
      if (!KEYS.has(command.key)) throw new BrowserError('Unsupported keyboard shortcut.');
      await page.keyboard.press(command.key);
    } else if (type === 'pointer') {
      const { x, y } = command;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > session.viewport.width || y > session.viewport.height) throw new BrowserError('Pointer position is outside the page.');
      await page.mouse.move(x, y);
      const button = command.button === 'middle' ? 'middle' : 'left';
      if (command.phase === 'down') await page.mouse.down({ button, clickCount: command.count === 2 ? 2 : 1 });
      else if (command.phase === 'up') await page.mouse.up({ button, clickCount: command.count === 2 ? 2 : 1 });
      else if (command.phase !== 'move') throw new BrowserError('Unsupported pointer action.');
    } else if (type === 'wheel') {
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) throw new BrowserError('Invalid scroll.');
      await page.mouse.wheel(Math.max(-1600, Math.min(1600, command.x)), Math.max(-1600, Math.min(1600, command.y)));
    } else if (type === 'resize') {
      session.viewport = { width: clamp(command.width, 320, 1600), height: clamp(command.height, 240, 1200) };
      await Promise.all([...session.pages.values()].map(record => record.page.setViewportSize(session.viewport)));
      this.publishState(session);
    } else if (type === 'selectTab') {
      if (!session.pages.has(command.tabId)) throw new BrowserError('That tab is unavailable.');
      session.active = command.tabId; await this.capture(session); this.publishState(session);
    } else if (type === 'newTab') {
      if (session.pages.size >= 4) throw new BrowserError('Close a tab before opening another.');
      const url = websiteUrl(command.url).href;
      const next = await session.context.newPage(); await this.attachPage(session, next);
      await this.navigate(session, session.pages.get(session.active), url);
    } else if (type === 'closeTab') {
      const target = session.pages.get(command.tabId);
      if (!target) throw new BrowserError('That tab is unavailable.');
      await target.page.close();
    } else if (type === 'dialog') {
      if (!record.dialog) throw new BrowserError('No dialog is open.');
      const dialog = record.dialog; record.dialog = null;
      if (command.accept) await dialog.accept(typeof command.text === 'string' ? command.text.slice(0,4096) : undefined);
      else await dialog.dismiss();
    } else if (type === 'streamQuality') {
      if (!Object.hasOwn(STREAMS, command.quality)) throw new BrowserError('Unknown stream quality.');
      session.streamQuality = command.quality;
      for (const record of session.pages.values()) if (record.capturing) {
        record.capturing = false; await record.cdp.send('Page.stopScreencast').catch(() => {});
      }
      await this.capture(session); this.publishState(session);
    } else if (type === 'pause') { session.paused = Boolean(command.paused); await this.capture(session); }
    else throw new BrowserError('Unsupported browser command.');
  }

  async end(session, reason = 'Browser session ended.') {
    if (!session || !this.sessions.delete(session.id)) return;
    clearTimeout(session.disconnectTimer);
    clearTimeout(session.frameTimer); session.pendingFrame = null;
    session.events.emit('message', { type: 'ended', message: reason });
    session.events.removeAllListeners();
    await session.context?.close().catch(() => {});
  }
  sweep() {
    const lowMemory = freemem() < 256 * 1024 ** 2;
    for (const session of this.sessions.values()) {
      if (lowMemory || Date.now() - session.lastInput > this.idleMs) this.end(session, lowMemory ? 'The host needs to free memory.' : 'Browser session expired after inactivity.');
    }
  }
  async close() {
    clearInterval(this.timer);
    await Promise.all([...this.sessions.values()].map(session => this.end(session)));
    await this.browser?.close().catch(() => {});
    await this.guard?.close().catch(() => {});
  }
}
