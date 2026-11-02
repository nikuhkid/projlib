// ProjLib Control Node [BETA]: connect the console to its public web proxy.
(function () {
  'use strict';
  const { utils, data, UI } = window.ProjLib;

  async function init() {
    const frame = document.getElementById('proxyFrame');
    const form = document.getElementById('proxyForm');
    const input = document.getElementById('urlInput');
    const toggle = document.getElementById('proxyToggle');
    const overlay = document.getElementById('loadingOverlay');
    const original = document.getElementById('openOriginal');
    const themeButton = document.getElementById('themeBtn');
    let currentUrl = '';
    let frameError = false;
    let loadTimer;
    let hub;

    function stopLoading() {
      clearTimeout(loadTimer);
      overlay.hidden = true;
      frame.setAttribute('aria-busy', 'false');
    }

    function showTarget(url) {
      currentUrl = url;
      input.value = url;
      original.href = url;
      original.hidden = false;
    }

    function loadUrl(value) {
      try {
        const target = utils.normalizeUrl(value);
        let address = target;
        if (toggle.checked) {
          if (!hub.proxyBase) throw new Error('The proxy is not configured yet. Switch off Proxy Mode to open embeddable sites.');
          const endpoint = new URL(hub.proxyBase);
          if (endpoint.origin === location.origin) throw new Error('The proxy must use a separate origin from ProjLib.');
          address = `${endpoint.origin}/proxy/${target}`;
        } else if (location.protocol === 'https:' && target.startsWith('http:')) {
          throw new Error('HTTP sites need Proxy Mode on this HTTPS page.');
        }
        stopLoading();
        frameError = false;
        showTarget(target);
        document.getElementById('initialMessage').hidden = true;
        frame.hidden = false;
        frame.setAttribute('aria-busy', 'true');
        overlay.hidden = false;
        UI.status(`Opening ${new URL(target).hostname} in ${toggle.checked ? 'Proxy' : 'Direct'} Mode…`);
        frame.src = address;
        loadTimer = setTimeout(() => {
          stopLoading();
          UI.status('This site is taking a while. Try Refresh or Open original.', true);
        }, 15000);
      } catch (error) {
        UI.status(error.message, true);
      }
    }

    frame.addEventListener('load', () => {
      if (!currentUrl) return;
      stopLoading();
      if (!frameError) UI.status('Frame opened. If the site is blank or refuses to connect, use Open original.');
    });
    frame.addEventListener('error', () => {
      stopLoading();
      UI.status('The site could not be opened. Try Open original.', true);
    });
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow || !toggle.checked) return;
      if (event.data?.type === 'projlib:navigation') {
        try { showTarget(utils.normalizeUrl(event.data.url)); } catch { /* invalid message */ }
      } else if (event.data?.type === 'projlib:error') {
        frameError = true;
        stopLoading();
        UI.status('The proxy could not retrieve this site. Try Open original.', true);
      }
    });
    form.addEventListener('submit', event => { event.preventDefault(); loadUrl(input.value); });
    document.getElementById('scannerBtn').addEventListener('click', event => {
      form.hidden = !form.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) input.focus();
    });
    document.getElementById('homeBtn').addEventListener('click', () => loadUrl(hub.defaultHome));
    document.getElementById('refreshBtn').addEventListener('click', () => {
      if (currentUrl) loadUrl(currentUrl);
    });
    document.getElementById('fullscreenBtn').addEventListener('click', async () => {
      try {
        const container = document.getElementById('proxyContainer');
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (container.requestFullscreen) await container.requestFullscreen();
        else throw new Error('Fullscreen is unavailable in this browser.');
      } catch (error) { UI.status(error.message, true); }
    });

    try {
      hub = await data.loadHubData();
      UI.renderHub(hub);
      const preference = utils.storage.get('projlib_proxy_mode');
      toggle.checked = Boolean(hub.proxyBase) && preference !== 'direct';
      toggle.addEventListener('change', () => {
        if (toggle.checked && !hub.proxyBase) {
          toggle.checked = false;
          UI.status('Proxy Mode is not available yet. Use Direct Mode or Open original for now.', true);
          return;
        }
        utils.storage.set('projlib_proxy_mode', toggle.checked ? 'proxy' : 'direct');
        if (currentUrl) loadUrl(currentUrl);
      });
      document.querySelectorAll('.dropdowns-grid select').forEach(select => {
        select.addEventListener('change', () => {
          if (select.value) loadUrl(select.value);
          select.value = '';
        });
      });
      const saved = utils.storage.get('projlib_theme_name') || utils.storage.get('projlib_theme');
      let themeIndex = Math.max(0, hub.themes.findIndex(theme => theme.name === saved));
      async function setTheme() {
        themeButton.disabled = true;
        try { await UI.applyTheme(hub.themes[themeIndex]); }
        catch (error) { UI.status(error.message, true); }
        finally { themeButton.disabled = false; }
      }
      themeButton.addEventListener('click', async () => {
        themeIndex = (themeIndex + 1) % hub.themes.length;
        await setTheme();
      });
      await setTheme();
      document.querySelectorAll('[data-needs-config]').forEach(control => { control.disabled = false; });
      if (hub.proxyBase) {
        loadUrl(hub.defaultHome);
      } else {
        document.getElementById('connectionNote').textContent = 'Direct Mode embeds sites that allow it. Use Open original if a site will not open here. Proxy Mode is not available yet.';
        UI.status('Direct Mode is ready. Choose a site or enter a website address.');
      }
    } catch (error) {
      stopLoading();
      UI.status(`${error.message} Reload the page to try again.`, true);
    }
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
