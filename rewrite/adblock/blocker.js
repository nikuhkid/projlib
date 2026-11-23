// SPDX-License-Identifier: AGPL-3.0-only
import { BraveEngine } from './brave-engine.js';

const PREFIX = '/rewrite/site/';
const MODES = new Set(['standard', 'aggressive', 'off']);
const text = new TextDecoder();
function virtualUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === self.location.origin && url.pathname.startsWith(PREFIX)) return new URL(decodeURIComponent(url.pathname.slice(PREFIX.length)));
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== self.location.origin) return url;
  } catch { /* Controller and about:blank clients have no virtual website. */ }
}
function insertHead(html, injection) {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + injection + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const offset = doctype ? doctype[0].length : 0;
  return html.slice(0, offset) + injection + html.slice(offset);
}
const scriptText = value => value.replace(/<\/script/gi, '<\\/script');
async function verifiedAsset(name, expected) {
  const key = new URL('/rewrite/adblock/vendor/' + name + '?sha256=' + expected, self.location.origin).href;
  let cache;
  try { cache = await caches.open('projlib-brave-adblock-v1'); } catch { /* Storage policy can disable the asset cache. */ }
  let response = await cache?.match(key);
  if (!response) response = await fetch(key);
  if (!response.ok) throw new Error('Brave ad blocking could not load ' + name);
  const bytes = await response.arrayBuffer();
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('Brave ad blocking received an invalid ' + name);
  try { await cache?.put(key, new Response(bytes)); } catch { /* Caching is optional. Verification is not. */ }
  return bytes;
}
function settingsDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('projlib-adblock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sites');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class BraveBlocker {
  modes = new Map();
  counts = new Map();
  contexts = new Map();
  pageModes = new Map();
  constructor(engine, manifest, cosmeticRuntime, database) {
    Object.assign(this, { engine, manifest, cosmeticRuntime, database });
  }
  static async load() {
    const manifestResponse = await fetch('/rewrite/adblock/vendor/manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error('Brave ad blocking could not load its manifest.');
    const manifest = await manifestResponse.json();
    const [wasm, filters, resources, runtime, database] = await Promise.all([
      verifiedAsset('brave-adblock.wasm', manifest.files['brave-adblock.wasm']),
      verifiedAsset('filters.json', manifest.files['filters.json']),
      verifiedAsset('resources.json', manifest.files['resources.json']),
      fetch('/rewrite/adblock-cosmetic-runtime.js').then(response => {
        if (!response.ok) throw new Error('Brave cosmetic filtering could not load.');
        return response.text();
      }), settingsDatabase()
    ]);
    const engine = await BraveEngine.create(wasm);
    engine.initialize(JSON.parse(text.decode(filters)).lists, JSON.parse(text.decode(resources)));
    const blocker = new BraveBlocker(engine, manifest, runtime, database);
    await new Promise((resolve, reject) => {
      const request = database.transaction('sites').objectStore('sites').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        if (MODES.has(cursor.value)) blocker.modes.set(cursor.key, cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    return blocker;
  }
  mode(url) { return this.modes.get(new URL(url).hostname) || 'standard'; }
  topUrl(url, client) { return this.contexts.get(client?.id)?.topUrl || virtualUrl(client?.url)?.href || url; }
  state(url) {
    const hostname = url ? new URL(url).hostname : '';
    return { available: true, engine: this.manifest.engine, version: this.manifest.version,
      mode: url ? this.mode(url) : 'standard', hostname, blocked: this.counts.get(hostname) || 0, updatedAt: this.manifest.updatedAt };
  }
  async setMode(url, mode) {
    if (!MODES.has(mode)) throw new Error('Choose a supported blocking mode.');
    const hostname = new URL(url).hostname;
    await new Promise((resolve, reject) => {
      const transaction = this.database.transaction('sites', 'readwrite');
      transaction.objectStore('sites').put(mode, hostname);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    this.modes.set(hostname, mode);
    return this.state(url);
  }
  registerContext(event) {
    if (!event.resultingClientId) return;
    const url = virtualUrl(event.request.url);
    if (!url) return;
    const topUrl = this.contexts.get(event.clientId)?.topUrl || url.href;
    if (this.contexts.size > 1000) this.contexts.delete(this.contexts.keys().next().value);
    this.contexts.set(event.resultingClientId, { topUrl, url: url.href });
  }
  request(event) {
    const url = event.url.href;
    const top = this.topUrl(url, event.client);
    const mode = this.mode(top);
    if (['document', 'iframe'].includes(event.destination)) {
      if (this.pageModes.size > 200) this.pageModes.delete(this.pageModes.keys().next().value);
      this.pageModes.set(url, mode);
    }
    if (mode === 'off') return;
    const referrer = Object.entries(event.requestHeaders || {}).find(([name]) => name.toLowerCase() === 'referer')?.[1];
    const source = virtualUrl(event.client?.url)?.href || referrer || url;
    const types = { style: 'stylesheet', iframe: 'subdocument', document: 'document', script: 'script', image: 'image', font: 'font', audio: 'media', video: 'media', track: 'media', worker: 'script', sharedworker: 'script' };
    const result = this.engine.check(url, source, types[event.destination] || 'xmlhttprequest', event.method, mode);
    if (result.blocked) {
      const hostname = new URL(top).hostname;
      this.counts.set(hostname, (this.counts.get(hostname) || 0) + 1);
      event.response = Promise.resolve(this.blockedResponse(result, url));
    } else if (result.rewritten_url) event.url = new URL(result.rewritten_url);
  }
  blockedResponse(result, url) {
    let response;
    if (result.redirect?.startsWith('data:')) {
      const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(result.redirect);
      if (match) {
        const body = match[2] ? Uint8Array.from(atob(match[3]), character => character.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3]));
        response = new Response(body, { headers: { 'content-type': match[1] || 'text/plain' } });
      }
    }
    response ||= new Response(null, { status: 204 });
    response.rawHeaders = Object.fromEntries(response.headers);
    response.finalURL = url;
    return response;
  }
  rewriteHtml(html, url) {
    if ((this.pageModes.get(url) || this.mode(url)) === 'off') return html;
    const script = this.engine.cosmetics(url).injected_script;
    return script ? insertHead(html, '<script>' + scriptText('(()=>{const scriptletGlobals=new Map();\n' + script + '\n})();') + '</script>') : html;
  }
  afterRewrite(event) {
    if (!['document', 'iframe'].includes(event.destination) || !String(event.responseHeaders['content-type'] || '').startsWith('text/html')) return;
    const url = event.url.href;
    const mode = this.mode(this.topUrl(url, event.client));
    if (mode === 'off') return;
    const resources = this.engine.cosmetics(url);
    // The helper intentionally runs as native bootstrap code, before Scramjet's runtime.
    // Scriptlets go through rewriteHtml instead, so their site URLs and APIs stay virtual.
    const config = JSON.stringify({ url, mode, resources: { ...resources, injected_script: '' } });
    const injection = '<script>' + scriptText('(()=>{\n' + this.cosmeticRuntime + '\nProjLibCosmetics.start(' + config + ',ProjLibBraveCosmeticRuntime);\n})();') + '</script>';
    const body = typeof event.responseBody === 'string' ? event.responseBody : text.decode(event.responseBody);
    event.responseBody = new TextEncoder().encode(insertHead(body, injection));
  }
  async message(event) {
    if (!event.data?.type?.startsWith('projlib:blocker-') || !event.ports?.[0] || !event.source?.url) return;
    const port = event.ports[0];
    try {
      if (event.data.type === 'projlib:blocker-selectors') {
        const url = virtualUrl(event.source.url);
        if (!url || this.mode(this.topUrl(url.href, event.source)) === 'off') return port.postMessage({ selectors: [] });
        const clean = values => Array.isArray(values) ? values.filter(value => typeof value === 'string' && value.length <= 256).slice(0, 250) : [];
        port.postMessage({ selectors: this.engine.selectors(url.href, clean(event.data.classes), clean(event.data.ids)) });
      } else {
        const caller = new URL(event.source.url);
        if (caller.origin !== self.location.origin || !['/rewrite/', '/rewrite/index.html'].includes(caller.pathname)) throw new Error('Open blocking controls from ProjLib.');
        const url = new URL(event.data.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Open a website first.');
        port.postMessage({ state: event.data.type === 'projlib:blocker-mode' ? await this.setMode(url.href, event.data.mode) : this.state(url.href) });
      }
    } catch (error) { port.postMessage({ error: error.message }); }
  }
}
