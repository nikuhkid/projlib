// themeManager.js - swaps CSS + loads per-theme JS, handles cleanup API
(function (TM) {
  'use strict';

  const THEMES = ['dark','kuromi','comic','glitch','matrix','anime','cyberpunk','minimal'];
  let index = 0;
  let currentScript = null;

  function setTheme(name) {
    // remove old theme body class
    THEMES.forEach(t => document.body.classList.remove('theme-' + t));
    document.body.classList.add('theme-' + name);

    // swap CSS file
    const link = document.getElementById('theme-stylesheet');
    if (link) link.href = 'css/themes/' + name + '.css';

    // call cleanup function if provided by previous theme script
    if (window.__themeCleanup && typeof window.__themeCleanup === 'function') {
      try { window.__themeCleanup(); } catch (e) { console.warn('theme cleanup failed', e); }
      window.__themeCleanup = null;
    }

    // remove previously injected script (if any)
    if (currentScript) {
      currentScript.remove();
      currentScript = null;
    }

    // load theme-specific JS if exists
    const src = 'js/themes/' + name + '.js';
    // attempt to fetch first to fail gracefully (optional)
    fetch(src, { method: 'HEAD' }).then(res => {
      if (res.ok) {
        const s = document.createElement('script');
        s.id = 'theme-script';
        s.src = src;
        s.defer = true;
        document.body.appendChild(s);
        currentScript = s;
      } else {
        // no per-theme JS — nothing to load
      }
    }).catch(()=>{/* ignore */});

    // persist
    localStorage.setItem('projlib_theme', name);
    // update theme button label if present
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = 'Theme: ' + name.charAt(0).toUpperCase() + name.slice(1);
  }

  TM.toggleTheme = function () {
    index = (index + 1) % THEMES.length;
    setTheme(THEMES[index]);
  };

  TM.setInitialTheme = function () {
    const saved = localStorage.getItem('projlib_theme') || 'dark';
    index = Math.max(0, THEMES.indexOf(saved));
    if (index === -1) index = 0;
    setTheme(THEMES[index]);
  };

  // expose
  window.ThemeManager = TM;

  // initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    TM.setInitialTheme();
    // wire theme button
    const btn = document.getElementById('themeBtn');
    if (btn) btn.addEventListener('click', TM.toggleTheme);
  });

})(window.ThemeManager = window.ThemeManager || {});
