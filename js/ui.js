// js/ui.js
// UI-only module: DOM rendering + theme loader
// Full-file: drop-in replacement.

(function () {
  if (!window.ProjLib) window.ProjLib = {};
  const ProjLib = window.ProjLib;
  const utils = ProjLib.utils || {};
  const dataStore = ProjLib.data || {};

  const UI = {
    rootEl: null,
    contentEl: null,
    headerSubtitleEl: null,
    activeTheme: { cssEl: null, jsEl: null, name: null }
  };

  // find or create core container elements — tolerant to existing markup
  UI.init = function (opts = {}) {
    const rootId = opts.rootId || 'projlib-container';
    const contentId = opts.contentId || 'projlib-content';
    const subtitleId = opts.subtitleId || 'projlib-subtitle';

    let root = document.getElementById(rootId);
    if (!root) {
      root = utils.el('div', { id: rootId, class: 'projlib-container' });
      document.body.insertBefore(root, document.body.firstChild);
    }
    UI.rootEl = root;

    let content = document.getElementById(contentId);
    if (!content) {
      content = utils.el('div', { id: contentId, class: 'projlib-content' });
      UI.rootEl.appendChild(content);
    }
    UI.contentEl = content;

    UI.headerSubtitleEl = document.getElementById(subtitleId) || null;
    return UI;
  };

  // render hub categories -> cards
  UI.renderHub = function (hub) {
    if (!hub) hub = dataStore.hub;
    if (!hub) { utils.log('UI.renderHub: no hub'); return; }

    utils.clearNode(UI.contentEl);

    // hub.categories expected: [{id, label, links:[{name,url}]}]
    const categories = hub.categories || [];
    if (!categories.length) {
      UI.contentEl.appendChild(utils.el('div', { class: 'projlib-empty' }, 'No categories available.'));
      return;
    }

    categories.forEach(cat => {
      const section = utils.el('section', { class: 'projlib-section' });
      const title = utils.el('h2', { class: 'projlib-section-title' }, utils.safeText ? utils.safeText(cat.label) : (cat.label || ''));
      section.appendChild(title);

      const ul = utils.el('ul', { class: 'projlib-links' });
      (cat.links || []).forEach(link => {
        const a = utils.el('a', { href: link.url || '#', target: '_blank', rel: 'noopener noreferrer' }, utils.safeText ? utils.safeText(link.name) : (link.name || ''));
        const li = utils.el('li', { class: 'projlib-link-item' }, a);
        ul.appendChild(li);
      });

      section.appendChild(ul);
      UI.contentEl.appendChild(section);
    });

    // subtitle if available
    if (UI.headerSubtitleEl && hub.dynamic) {
      UI.headerSubtitleEl.textContent = hub.dynamic;
    }
  };

  // apply theme object: {name, css, js}
  UI.applyTheme = function (theme) {
    if (!theme) return;

    // cleanup previous theme
    try {
      if (window.__themeCleanup && typeof window.__themeCleanup === 'function') {
        try { window.__themeCleanup(); } catch (e) { utils.log('theme cleanup err', e); }
      }
    } catch (e) {}

    if (UI.activeTheme.cssEl) UI.activeTheme.cssEl.remove();
    if (UI.activeTheme.jsEl) UI.activeTheme.jsEl.remove();

    // CSS
    if (theme.css) {
      const cssLink = utils.el('link', { rel: 'stylesheet', href: theme.css, id: 'projlib-theme-css' });
      document.head.appendChild(cssLink);
      UI.activeTheme.cssEl = cssLink;
    }

    // JS
    if (theme.js) {
      const jsS = utils.el('script', { src: theme.js, id: 'projlib-theme-js', defer: true });
      document.body.appendChild(jsS);
      UI.activeTheme.jsEl = jsS;
    }

    // body class
    try {
      document.body.classList.remove(...Array.from(document.body.classList || []).filter(c => c.startsWith('theme-')));
      if (theme.name) document.body.classList.add('theme-' + theme.name);
    } catch (e) { /* ignore */ }

    UI.activeTheme.name = theme.name || null;
    utils.log('Applied theme', theme.name || theme.css || '(unnamed)');
  };

  // small helper to find theme by name from hub or fallback
  UI.findTheme = function (name) {
    const hub = dataStore.hub || {};
    const themes = hub.themes || [];
    return themes.find(t => t.name === name) || themes[0] || null;
  };

  ProjLib.UI = UI;
})();
