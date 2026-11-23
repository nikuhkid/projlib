(function () {
  'use strict';
  window.ProjLib.HomeRouting = function ({ frame, origin }) {
    const panel = document.getElementById('homeRouting');
    const route = document.getElementById('proxyRoute');
    const form = document.getElementById('homeUnlockForm');
    const password = document.getElementById('hostPassword');
    const verify = document.getElementById('verifyHost');
    const forget = document.getElementById('forgetHost');
    const status = document.getElementById('homeRoutingStatus');
    const adblockMode = document.getElementById('adblockMode');
    const adblockStatus = document.getElementById('adblockStatus');
    let state = { configured: false, authorized: false, route: 'cloudflare', expiresAt: 0 };
    let expiry;
    function command(action, values = {}) {
      frame.contentWindow.postMessage({ type: 'projlib:rewrite-command', action, ...values }, origin);
    }
    function render(next) {
      state = next;
      clearTimeout(expiry);
      const authorized = state.authorized && state.expiresAt > Date.now();
      route.querySelector('[value="home"]').disabled = !authorized;
      route.value = authorized && state.route === 'home' ? 'home' : 'cloudflare';
      verify.disabled = !state.configured;
      forget.hidden = !authorized;
      status.textContent = !state.configured ? 'The home host is not connected yet. Cloudflare is available.' : state.unavailable
        ? 'Wolfie is unavailable. Cloudflare is available; verification will be checked when Wolfie reconnects.' : authorized
        ? `Wolfie verified until ${new Date(state.expiresAt).toLocaleString()}.`
        : 'Verify the host password to unlock Wolfie for 12 hours. Cloudflare is available.';
      if (authorized) expiry = setTimeout(() => {
        render({ ...state, authorized: false, route: 'cloudflare', expiresAt: 0 });
        command('home-status');
      }, Math.max(1, state.expiresAt - Date.now()));
    }
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow || event.origin !== origin) return;
      if (event.data?.type === 'projlib:home-state') render(event.data.state);
      if (event.data?.type === 'projlib:home-error') {
        verify.disabled = !state.configured;
        status.textContent = event.data.message;
        route.value = state.route;
      }
      if (event.data?.type === 'projlib:blocker-state') {
        const blocker = event.data.state;
        adblockMode.disabled = !blocker.available;
        adblockStatus.textContent = blocker.mode === 'off' ? 'Ad blocking is off for this site.'
          : `Brave engine · ${blocker.blocked} requests blocked for this site this session.`;
        for (const button of adblockMode.querySelectorAll('[data-blocker-mode]')) {
          const selected = button.dataset.blockerMode === blocker.mode;
          button.setAttribute('aria-pressed', String(selected));
          button.title = button.getAttribute('aria-label') + (selected ? '. Active. ' + adblockStatus.textContent : '');
        }
      }
      if (event.data?.type === 'projlib:blocker-error') {
        adblockMode.disabled = true;
        adblockStatus.textContent = event.data.message;
        for (const button of adblockMode.querySelectorAll('[data-blocker-mode]')) button.title = event.data.message;
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      verify.disabled = true;
      command('home-login', { password: password.value });
      password.value = '';
      status.textContent = 'Verifying the host password…';
    });
    route.addEventListener('change', () => command('home-route', { route: route.value }));
    forget.addEventListener('click', () => command('home-logout'));
    adblockMode.addEventListener('click', event => {
      const button = event.target.closest('[data-blocker-mode]');
      if (!button || adblockMode.disabled || button.getAttribute('aria-pressed') === 'true') return;
      adblockMode.disabled = true;
      command('blocker-mode', { mode: button.dataset.blockerMode });
    });
    render(state);
    return { show(enabled) { panel.hidden = !enabled; }, ready() { command('home-status'); command('blocker-status'); } };
  };
})();
