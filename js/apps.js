// js/apps.js
// Orchestrator: ties core + ui + data together
// Full-file: drop-in replacement.

(function () {
  if (!window.ProjLib) window.ProjLib = {};
  const ProjLib = window.ProjLib;
  const utils = ProjLib.utils;
  const data = ProjLib.data;
  const UI = ProjLib.UI;

  // fallback theme if none in hub
  const FALLBACK_THEMES = [
    { name: 'main', css: 'css/themes/main.css', js: 'js/themes/main.js' }
  ];

  // Determine authorized emails set (from hub or global). Returned as Set.
  function getAuthorizedEmails(hub) {
    if (!hub) return new Set();
    const fromHub = hub.authorizedEmails || hub.whitelistEmails || hub.authorized || [];
    if (Array.isArray(fromHub)) return new Set(fromHub.map(s => String(s).toLowerCase()));
    return new Set();
  }

  async function checkAuthorization(hub) {
    const set = getAuthorizedEmails(hub);
    if (!set.size) return { authorized: true, email: null }; // no list -> treat as open

    // try async get email
    let email = null;
    try { email = await utils.getCurrentUserEmailAsync(); } catch (e) { email = null; }
    if (!email) {
      // try sync fallback
      email = utils.getCurrentUserEmail ? utils.getCurrentUserEmail() : null;
    }
    if (!email) return { authorized: false, email: null };

    const allowed = set.has(email.toLowerCase());
    return { authorized: allowed, email };
  }

  // Mask hub for limited users (simple approach: remove URLs)
  function maskHubForLimited(hub) {
    try {
      const copy = JSON.parse(JSON.stringify(hub));
      if (Array.isArray(copy.categories)) {
        copy.categories.forEach(cat => {
          if (Array.isArray(cat.links)) {
            cat.links.forEach(l => {
              // remove link target
              l.url = '#';
            });
          }
        });
      }
      copy.dynamic = copy.dynamic || 'Limited access — login required for full links.';
      return copy;
    } catch (e) {
      return hub;
    }
  }

  async function init(opts = {}) {
    try {
      UI.init(opts.ui || {});
      const hub = await data.loadHubData(opts.hubPath || 'hubData.json');

      // Authorization gating (if hub lists authorized emails)
      const auth = await checkAuthorization(hub);
      if (!auth.authorized) {
        utils.log('User not authorized — applying limited view', auth.email);
        const limited = maskHubForLimited(hub);
        // do not overwrite original hub on disk; keep working copy
        ProjLib.data.hub = limited;
      } else {
        ProjLib.data.hub = hub;
      }

      // Render
      UI.renderHub(ProjLib.data.hub);

      // Apply initial theme: prefer saved name -> hub.themes[0] -> fallback
      const savedThemeName = localStorage.getItem('projlib_theme_name');
      let theme = null;
      if (savedThemeName) theme = UI.findTheme(savedThemeName);
      if (!theme) theme = (hub && hub.themes && hub.themes.length) ? hub.themes[0] : null;
      if (!theme) theme = FALLBACK_THEMES[0];

      UI.applyTheme(theme);

      // Wire up theme button if present
      const themeBtn = document.getElementById('themeBtn');
      if (themeBtn && hub && hub.themes && hub.themes.length) {
        let idx = (hub.themes.findIndex(t => t.name === (theme && theme.name)) || 0);
        themeBtn.addEventListener('click', () => {
          idx = (idx + 1) % hub.themes.length;
          const next = hub.themes[idx];
          if (next) {
            UI.applyTheme(next);
            localStorage.setItem('projlib_theme_name', next.name || '');
          }
        });
      }

      utils.log('ProjLib initialized');
    } catch (err) {
      console.error('[ProjLib] init error', err);
    }
  }

  // auto-init when DOM ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', () => init());
  }

  ProjLib.App = { init };

})();
