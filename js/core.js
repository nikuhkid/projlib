// js/core.js
// Core utilities + data loader
// Full-file: drop-in replacement / foundation module.

(function () {
  if (!window.ProjLib) window.ProjLib = {};
  const ProjLib = window.ProjLib;

  // ---------- basic helpers ----------
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function fetchWithRetry(url, opts = {}, attempts = 3, delayMs = 600) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, opts);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        // Try parse JSON if content-type indicates JSON
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          return await res.json();
        } else {
          return await res.text();
        }
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) await sleep(delayMs);
      }
    }
    throw lastErr;
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k in node) node[k] = v;
        else node.setAttribute(k, v);
      });
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  }

  function clearNode(n) {
    if (!n) return;
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function safeText(s) {
    if (s == null) return '';
    return String(s);
  }

  function log(...args) { console.log('[ProjLib]', ...args); }

  // ---------- simple environment helper (UNVERIFIED - adapt to your Wix) ----------
  // [Unverified] I cannot verify your Wix environment. Adapt getCurrentUserEmail() to your Wix login.
  function getCurrentUserEmail() {
    try {
      // Common places you might expose a user email — adapt as needed:
      if (window.wixUsers && window.wixUsers.currentUser && typeof window.wixUsers.currentUser.getEmail === 'function') {
        // wix-users sdk: currentUser.getEmail() returns a Promise in real Wix; we can't await here.
        // So caller should use ProjLib.utils.getCurrentUserEmailAsync if needed.
        return null;
      }
      if (window.__wix && window.__wix.currentUser && window.__wix.currentUser.email) return window.__wix.currentUser.email;
      if (window.currentUser && window.currentUser.email) return window.currentUser.email;
      if (window.wixUser && window.wixUser.email) return window.wixUser.email;
      // fallback to global hook if site added it
      if (window.PROJLIB_CURRENT_USER_EMAIL) return window.PROJLIB_CURRENT_USER_EMAIL;
    } catch (e) {
      log('getCurrentUserEmail error', e);
    }
    return null;
  }

  // Async helper to support Wix SDK style currentUser.getEmail()
  async function getCurrentUserEmailAsync() {
    try {
      if (window.wixUsers && window.wixUsers.currentUser && typeof window.wixUsers.currentUser.getEmail === 'function') {
        // [Unverified] Wix API returns a Promise<string> — adapt if your integration is different.
        return await window.wixUsers.currentUser.getEmail();
      }
    } catch (e) {
      // swallow and fallback to sync
    }
    return getCurrentUserEmail();
  }


  // ---------- data layer ----------
  const data = {
    hub: null,
    /**
     * Load hub JSON (default: hubData.json). Returns parsed JSON or throws.
     * @param {string} path
     */
    async loadHubData(path = 'hubData.json') {
      log('loading hubData from', path);
      try {
        const j = await fetchWithRetry(path, { cache: 'no-cache' }, 3, 600);
        // ensure shape
        this.hub = j || {};
        return this.hub;
      } catch (err) {
        log('Failed to load hubData.json:', err);
        // fallback default minimal shape
        this.hub = { defaultHome: '/', categories: [], themes: [] };
        return this.hub;
      }
    }
  };

  // Expose utilities
  ProjLib.utils = ProjLib.utils || {};
  Object.assign(ProjLib.utils, {
    sleep,
    fetchWithRetry,
    el,
    clearNode,
    safeText,
    log,
    getCurrentUserEmail,
    getCurrentUserEmailAsync
  });

  ProjLib.data = data;

})();
