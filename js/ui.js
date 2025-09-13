// ui.js - UI wiring: hub population, dropdowns, scanner, iframe, buttons, history, notifier
(function (ProjLib) {
  'use strict';

  // internal history for back/forward
  const historyStack = [];
  let historyIndex = -1;

  const menuBar = document.getElementById('menu-bar');
  const scannerBtn = document.getElementById('scannerBtn');
  const scannerBar = document.getElementById('scannerBar');
  const urlInput = document.getElementById('urlInput');
  const goBtn = document.getElementById('goBtn');
  const proxyFrame = document.getElementById('proxyFrame');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const initialMessage = document.getElementById('initialMessage');

  function notify(msg) {
    // simple ephemeral notification (uses title bar color)
    const el = document.getElementById('notification') || document.createElement('div');
    el.id = 'notification';
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.bottom = '18px';
    el.style.padding = '8px 12px';
    el.style.background = 'rgba(0,0,0,0.8)';
    el.style.border = '1px solid var(--accent-cyan)';
    el.style.color = 'var(--accent-cyan)';
    el.style.borderRadius = '8px';
    document.body.appendChild(el);
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; setTimeout(()=>el.remove(),400); }, 3000);
  }

  // Load given URL into iframe with overlay + history management
  function loadUrl(raw) {
    if (!raw) return;
    let url = raw.trim();
    if (!/^https?:\/\//i.test(url)) {
      if (/\.\w{2,}/.test(url)) url = 'https://' + url;
      else url = 'https://swisscows.com/web?query=' + encodeURIComponent(url);
    }

    try {
      loadingOverlay.style.display = 'flex';
    } catch {}

    // set src
    proxyFrame.src = url;

    // update history
    if (historyIndex === -1 || historyStack[historyIndex] !== url) {
      historyStack.splice(historyIndex + 1);
      historyStack.push(url);
      historyIndex = historyStack.length - 1;
    }

    // hide initial message (if any)
    if (initialMessage) initialMessage.style.display = 'none';

    // safety: hide overlay after timeout if load blocked by x-frame headers
    const t = setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 4500);

    proxyFrame.onload = () => {
      loadingOverlay.style.display = 'none';
      clearTimeout(t);
    };
    proxyFrame.onerror = () => {
      loadingOverlay.style.display = 'none';
      clearTimeout(t);
      notify('Content failed to load (may block embedding).');
    };
  }

  // Populate the dropdowns from hubData.json -> each .dropdown[data-id]
  function populateMenu(data) {
    if (!data || !Array.isArray(data.categories)) return;
    // map categories by id
    const map = {};
    data.categories.forEach(c => map[c.id] = c);

    Array.from(document.querySelectorAll('.dropdown')).forEach(drop => {
      const id = drop.getAttribute('data-id');
      const container = drop.querySelector('.dropdown-content');
      const btn = drop.querySelector('.dropbtn');
      if (!container || !btn) return;
      container.innerHTML = '';
      const cat = map[id];
      if (!cat) {
        btn.textContent = id;
        continue;
      }
      btn.textContent = cat.label || id;
      if (Array.isArray(cat.links)) {
        cat.links.forEach(link => {
          if (!link || !link.url || !link.name) return;
          const a = document.createElement('a');
          a.href = '#';
          a.textContent = link.name;
          a.dataset.url = link.url;
          a.addEventListener('click', (ev) => {
            ev.preventDefault();
            loadUrl(link.url);
          });
          container.appendChild(a);
        });
      }
    });
  }

  // toolbar wiring
  document.addEventListener('DOMContentLoaded', () => {
    // load hubData and populate menus
    ProjLib.loadHubData('./hubData.json').then(data => {
      if (data && data.defaultHome) {
        loadUrl(data.defaultHome);
      }
      populateMenu(data);
    }).catch(err => {
      console.warn('hub load failed', err);
    });

    // scanner toggle
    if (scannerBtn && scannerBar) {
      scannerBtn.addEventListener('click', () => {
        const shown = !scannerBar.classList.contains('hidden') && scannerBar.style.display !== 'none';
        if (shown) {
          scannerBar.classList.add('hidden'); scannerBar.style.display = 'none';
        } else {
          scannerBar.classList.remove('hidden'); scannerBar.style.display = 'flex';
          setTimeout(()=> urlInput && urlInput.focus(), 60);
        }
      });
    }

    // go button
    if (goBtn && urlInput) {
      goBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const v = urlInput.value && urlInput.value.trim();
        if (v) loadUrl(v);
        urlInput.value = '';
        scannerBar.classList.add('hidden'); scannerBar.style.display = 'none';
      });
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          goBtn.click();
        } else if (e.key === 'Escape') {
          scannerBar.classList.add('hidden'); scannerBar.style.display = 'none';
        }
      });
    }

    // action buttons: home, refresh, back, forward
    const homeBtn = document.getElementById('homeBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const backBtn = document.getElementById('backBtn');
    const forwardBtn = document.getElementById('forwardBtn');

    homeBtn && homeBtn.addEventListener('click', () => {
      // find defaultHome from hubData if loaded
      ProjLib.loadHubData('./hubData.json').then(d => {
        if (d && d.defaultHome) loadUrl(d.defaultHome);
        else notify('No home configured.');
      });
    });

    refreshBtn && refreshBtn.addEventListener('click', () => {
      try { proxyFrame.contentWindow.location.reload(); } catch { proxyFrame.src = proxyFrame.src; }
    });

    backBtn && backBtn.addEventListener('click', () => {
      if (historyIndex > 0) {
        historyIndex -= 1;
        loadUrl(historyStack[historyIndex]);
      } else notify('No back history.');
    });

    forwardBtn && forwardBtn.addEventListener('click', () => {
      if (historyIndex < historyStack.length - 1) {
        historyIndex += 1;
        loadUrl(historyStack[historyIndex]);
      } else notify('No forward history.');
    });

    // theme button is wired inside themeManager.js (button id: themeBtn)
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      // themeManager already sets label on init.
    }
  });

  // expose loadUrl for other modules
  ProjLib.processLoadUrl = loadUrl;

})(window.ProjLib = window.ProjLib || {});
