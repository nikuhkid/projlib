// Render the existing console controls and manage theme effects.
(function () {
  'use strict';
  const ProjLib = window.ProjLib;
  let cleanup = null;
  let effects;

  ProjLib.UI = {
    effectLayer() {
      if (!effects) {
        effects = document.createElement('div');
        effects.className = 'theme-effects';
        effects.setAttribute('aria-hidden', 'true');
        document.body.appendChild(effects);
      }
      return effects;
    },
    renderHub(hub) {
      hub.categories.forEach(category => {
        const select = document.getElementById(category.id);
        if (!select) return;
        select.replaceChildren(new Option(`— ${category.label} —`, ''));
        select.setAttribute('aria-label', category.label);
        category.links.forEach(link => select.add(new Option(link.name, link.url)));
        select.disabled = false;
      });
    },

    async applyTheme(theme) {
      if (cleanup) cleanup();
      cleanup = null;
      window.__themeCleanup = null;
      document.querySelectorAll('.theme-effect, .comic-sprite, .kuromi-sprite').forEach(node => node.remove());
      document.body.classList.forEach(name => {
        if (name.startsWith('theme-')) document.body.classList.remove(name);
      });
      document.body.classList.add(`theme-${theme.name}`);
      let sheet = document.getElementById('projlib-theme-css');
      if (!sheet) {
        sheet = document.createElement('link');
        sheet.id = 'projlib-theme-css';
        sheet.rel = 'stylesheet';
        document.head.appendChild(sheet);
      }
      sheet.href = `${theme.css}?v=4`;
      document.getElementById('themeBtn').textContent = `Theme: ${theme.name.charAt(0).toUpperCase()}${theme.name.slice(1)}`;

      // Serialize in apps.js so a previous script cannot overwrite the cleanup hook.
      if (theme.js && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${theme.js}?v=4`;
          script.onload = () => { script.remove(); resolve(); };
          script.onerror = () => { script.remove(); reject(new Error(`Could not load the ${theme.name} theme.`)); };
          document.body.appendChild(script);
        });
        cleanup = window.__themeCleanup;
      }
      ProjLib.utils.storage.set('projlib_theme_name', theme.name);
    },

    status(message, error = false) {
      const status = document.getElementById('statusMessage');
      status.textContent = message;
      status.dataset.error = String(error);
    }
  };
})();
