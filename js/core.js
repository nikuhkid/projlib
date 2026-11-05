// Shared data, URL, and preference helpers. ProjLib is open to every visitor.
(function () {
  'use strict';
  const ProjLib = window.ProjLib = window.ProjLib || {};

  function normalizeUrl(input) {
    const value = String(input || '').trim();
    if (!value || /\s/.test(value)) throw new Error('Enter a website address, for example example.com.');
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
    const url = new URL(hasScheme ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error('Use an HTTP or HTTPS address without embedded credentials.');
    }
    return url.href;
  }

  function resolveScannerInput(input) {
    const value = input.trim();
    if (!value) throw new Error('Enter a search or a website address.');
    const host = value.split(/[/?#]/, 1)[0].replace(/:\d+$/, '');
    const dottedHost = /^(?:[\p{L}\p{M}\p{N}-]+\.)+[\p{L}\p{M}\p{N}-]+\.?$/u;
    const ipv6Host = /^\[[a-f\d:.]+\]$/i;
    if (!/\s/.test(value) && (dottedHost.test(host) || ipv6Host.test(host))) {
      return normalizeUrl(`https://${value}`);
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) return normalizeUrl(value);
    return `https://www.bing.com/search?${new URLSearchParams({ q: value })}`;
  }

  // Browsing still works when private browsing or policy disables storage.
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* optional preference */ } }
  };

  ProjLib.utils = { normalizeUrl, resolveScannerInput, storage };
  ProjLib.data = {
    hub: null,
    async loadHubData(path = 'hubData.json') {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Could not load the site directory (HTTP ${response.status}).`);
      const hub = await response.json();
      if (!hub || !Array.isArray(hub.categories) || !Array.isArray(hub.themes) || !hub.themes.length) {
        throw new Error('The site directory is missing its categories or themes.');
      }
      this.hub = hub;
      return hub;
    }
  };
})();
