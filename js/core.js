// core.js - utility functions and hub loader
(function (ProjLib) {
  'use strict';

  ProjLib.isValidUrl = function (s) {
    try {
      const u = new URL(s.startsWith('http') ? s : 'https://' + s);
      return !!u.hostname && (u.hostname.includes('.') || u.hostname === 'localhost');
    } catch { return false; }
  };

  ProjLib.sanitizeText = function (txt) {
    const d = document.createElement('div');
    d.textContent = txt;
    return d.innerHTML;
  };

  ProjLib.fetchWithTimeout = function (url, opts = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {...opts, signal: controller.signal})
      .then(resp => { clearTimeout(timer); return resp; })
      .catch(err => { clearTimeout(timer); throw err; });
  };

  ProjLib.fetchWithRetry = function (url, opts={}, retries=2, timeoutMs=15000) {
    return ProjLib.fetchWithTimeout(url, opts, timeoutMs).catch(err => {
      if (retries > 0) return ProjLib.fetchWithRetry(url, opts, retries - 1, timeoutMs);
      throw err;
    });
  };

  ProjLib.loadHubData = function (path='./hubData.json') {
    return ProjLib.fetchWithRetry(path, {}, 2, 10000)
      .then(resp => { if(!resp.ok) throw new Error('bad hub fetch'); return resp.json(); })
      .catch(() => ({ categories: [] }));
  };

})(window.ProjLib = window.ProjLib || {});
