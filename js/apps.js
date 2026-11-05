// ProjLib Control Node [BETA]: connect the console to its public web proxy.
(function () {
  'use strict';
  const { utils, data, UI } = window.ProjLib;

  async function init() {
    const frame = document.getElementById('proxyFrame');
    const form = document.getElementById('proxyForm');
    const scannerPanel = document.getElementById('scannerPanel') || form;
    const input = document.getElementById('urlInput');
    const toggle = document.getElementById('proxyToggle');
    const overlay = document.getElementById('loadingOverlay');
    const original = document.getElementById('openOriginal');
    const openProxy = document.getElementById('openProxy');
    const sourceFooter = document.getElementById('viewerSources');
    const themeButton = document.getElementById('themeBtn');
    let currentUrl = '';
    let frameError = false;
    let loadTimer;
    let hub;
    let browser;
    let rewriteReady = false;
    let addressEdited = false;
    scannerPanel.hidden = true;
    document.getElementById('scannerBtn').setAttribute('aria-expanded', 'false');
    const rewriteMode = () => toggle.checked && Boolean(hub?.rewriteProxy);
    const remoteMode = () => toggle.checked && !hub?.rewriteProxy && Boolean(hub?.browserSessions);

    function stopLoading() {
      clearTimeout(loadTimer);
      overlay.hidden = true;
      frame.setAttribute('aria-busy', 'false');
    }

    function showTarget(url) {
      currentUrl = url;
      if (!addressEdited) input.value = url;
      original.href = url;
      original.hidden = false;
      if (openProxy) openProxy.hidden = !rewriteMode();
      if (sourceFooter) {
        sourceFooter.hidden = !rewriteMode();
        if (rewriteMode()) document.getElementById('sourceLink').href = `${new URL(hub.proxyBase).origin}/rewrite/source.html`;
      }
      if (rewriteMode()) {
        if (openProxy) openProxy.href = `${new URL(hub.proxyBase).origin}/rewrite/#${new URLSearchParams({ url })}`;
        try { sessionStorage.setItem('projlib_rewrite_url', url); } catch { /* optional tab restoration */ }
      }
    }

    function loadUrl(value, fromScanner = false) {
      try {
        const target = fromScanner ? utils.resolveScannerInput(value) : utils.normalizeUrl(value);
        addressEdited = false;
        const note = document.getElementById('connectionNote');
        if (!toggle.checked) note.textContent = 'Direct Mode embeds websites that allow it. Enable Proxy Mode here when a website needs proxy routing.';
        else if (rewriteMode()) note.textContent = 'Proxy Mode renders websites in your browser. Sign-ins and site storage stay in this Chrome profile until you clear proxy browsing data. Website compatibility varies.';
        else if (remoteMode()) note.textContent = 'Proxy Mode uses a private browser on Wolfie. Cookies last for this session. Use End session to clear them. Audio, uploads, downloads, and passkeys are unavailable.';
        else note.textContent = 'Proxy Mode routes this website through ProjLib. Some websites and sign-ins may require Open original.';
        if (remoteMode()) {
          stopLoading(); showTarget(target);
          document.getElementById('initialMessage').hidden = true;
          frame.hidden = true;
          frame.removeAttribute('src');
          overlay.hidden = false;
          browser.open(target);
          return;
        }
        browser?.hide();
        frame.setAttribute('sandbox', `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads${rewriteMode() ? ' allow-same-origin' : ''}`);
        let address = target;
        if (toggle.checked) {
          if (!hub.proxyBase) throw new Error('The proxy is not configured yet. Switch off Proxy Mode to open embeddable sites.');
          const endpoint = new URL(hub.proxyBase);
          if (endpoint.origin === location.origin) throw new Error('The proxy must use a separate origin from ProjLib.');
          address = rewriteMode() ? `${endpoint.origin}/rewrite/#${new URLSearchParams({ url: target, sourceFooter: sourceFooter ? 'outside' : 'inside' })}` : `${endpoint.origin}/proxy/${target}`;
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
        if (rewriteMode() && rewriteReady) {
          frame.contentWindow.postMessage({ type: 'projlib:rewrite-command', action: 'navigate', url: target }, new URL(hub.proxyBase).origin);
        } else {
          rewriteReady = false;
          frame.src = address;
        }
        loadTimer = setTimeout(() => {
          stopLoading();
          UI.status('This site is taking a while. Try Refresh or Open original.', true);
        }, 15000);
      } catch (error) {
        UI.status(error.message, true);
      }
    }

    frame.addEventListener('load', () => {
      if (!currentUrl || remoteMode() || rewriteMode()) return;
      stopLoading();
      if (!frameError) UI.status('Frame opened. If the site is blank or refuses to connect, use Open original.');
    });
    frame.addEventListener('error', () => {
      stopLoading();
      UI.status('The site could not be opened. Try Open original.', true);
    });
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow || !toggle.checked || remoteMode()) return;
      if (rewriteMode() && event.origin !== new URL(hub.proxyBase).origin) return;
      if (rewriteMode() && event.data?.type === 'projlib:rewrite-ready') {
        rewriteReady = true;
      } else if (rewriteMode() && event.data?.type === 'projlib:rewrite-ended') {
        rewriteReady = false;
        stopLoading();
        UI.status('Proxy browsing data cleared. Choose a website to start again.');
      } else if (event.data?.type === 'projlib:navigation') {
        try { showTarget(utils.normalizeUrl(event.data.url)); } catch { /* invalid message */ }
      } else if (rewriteMode() && event.data?.type === 'projlib:rewrite-loaded') {
        stopLoading();
        if (event.data.url) { try { showTarget(utils.normalizeUrl(event.data.url)); } catch { /* invalid message */ } }
        UI.status('Website opened. Scrolling and typing run in this browser.');
      } else if (rewriteMode() && event.data?.type === 'projlib:rewrite-error') {
        stopLoading();
        UI.status(event.data.message, true);
      } else if (event.data?.type === 'projlib:error') {
        frameError = true;
        stopLoading();
        UI.status('The proxy could not retrieve this site. Try Open original.', true);
      }
    });
    input.addEventListener('input', () => { addressEdited = true; });
    form.addEventListener('submit', event => { event.preventDefault(); loadUrl(input.value, true); });
    document.getElementById('scannerBtn').addEventListener('click', event => {
      scannerPanel.hidden = !scannerPanel.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!scannerPanel.hidden));
      if (!scannerPanel.hidden) input.focus();
    });
    document.getElementById('homeBtn').addEventListener('click', () => loadUrl(hub.defaultHome));
    document.getElementById('refreshBtn').addEventListener('click', () => {
      if (remoteMode() && browser?.session) browser.send({ type: 'reload' });
      else if (rewriteMode() && rewriteReady && currentUrl) frame.contentWindow.postMessage({ type: 'projlib:rewrite-command', action: 'reload' }, new URL(hub.proxyBase).origin);
      else if (currentUrl) loadUrl(currentUrl);
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
      if (hub.browserSessions && !hub.rewriteProxy) {
        browser = new window.ProjLib.BrowserSession({ base: hub.proxyBase,
          onState: state => {
            if (!remoteMode()) return;
            if (/^https?:/.test(state.url)) showTarget(state.url);
            if (!state.busy) stopLoading();
            UI.status(state.busy ? 'Opening the website…' : 'Private browser connected. Sign in directly on the website.');
          },
          onFrame: () => { if (remoteMode()) stopLoading(); },
          onStatus: (message, error) => { stopLoading(); UI.status(message, error); },
          onEnd: message => { stopLoading(); UI.status(message); }
        });
      }
      UI.renderHub(hub);
      toggle.checked = false;
      toggle.addEventListener('change', () => {
        if (toggle.checked && !hub.proxyBase) {
          toggle.checked = false;
          UI.status('Proxy Mode is not available yet. Use Direct Mode or Open original for now.', true);
          return;
        }
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
        let initialUrl = hub.defaultHome;
        if (hub.rewriteProxy) {
          try { initialUrl = sessionStorage.getItem('projlib_rewrite_url') || initialUrl; } catch { /* optional tab restoration */ }
        }
        loadUrl(initialUrl);
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
