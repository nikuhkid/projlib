'use strict';
(async () => {
  const notice = document.getElementById('notice');
  const element = document.getElementById('site');
  if (parent !== window && new URLSearchParams(location.hash.slice(1)).get('sourceFooter') === 'outside') document.getElementById('viewerFooter').hidden = true;
  let frontend;
  let frame;
  function send(type, extra = {}) {
    if (frontend && parent !== window) parent.postMessage({ type, ...extra }, frontend);
  }
  function fail(error) {
    notice.textContent = `${error.message} If browser policy blocks embedded storage or service workers, open the viewer in its own tab.`;
    send('projlib:rewrite-error', { message: notice.textContent });
  }
  function target(value = new URLSearchParams(location.hash.slice(1)).get('url')) {
    if (!value) return;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS website address.');
    return url.href;
  }
  try {
    ({ frontend } = await (await fetch('/rewrite/config')).json());
    if (!('serviceWorker' in navigator) || !('SharedWorker' in window)) throw new Error('This browser does not provide the required service worker and shared worker support.');
    const { ScramjetController } = $scramjetLoadController();
    const controller = new ScramjetController({
      // Preserve directory separators so native relative module imports retain their base path.
      codec: { encode: value => encodeURIComponent(value).replace(/%2F/gi, '/'), decode: value => decodeURIComponent(value) },
      prefix: '/rewrite/site/', files: {
        wasm: '/rewrite/vendor/scramjet/scramjet.wasm.wasm',
        all: '/rewrite/vendor/scramjet/scramjet.all.js', sync: '/rewrite/vendor/scramjet/scramjet.sync.js'
      }, flags: { rewriterLogs: false, captureErrors: false }
    });
    await controller.init();
    await navigator.serviceWorker.register('/rewrite/sw.js', { scope: '/rewrite/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The website viewer service worker did not take control.')), 15000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
        if (navigator.serviceWorker.controller) { clearTimeout(timer); resolve(); }
      });
    }
    const connection = new BareMux.BareMuxConnection('/rewrite/vendor/baremux/worker.js');
    await connection.setTransport('/rewrite/transport.mjs?v=3', [location.origin + '/rewrite']);
    frame = controller.createFrame(element);
    let blockerPoll;
    async function blockerControl(action = 'status', mode) {
      try {
        let url;
        try { url = target(frame.url.href); } catch { url = target(); }
        if (!url) return;
        const result = await new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Brave ad blocking did not respond.')); }, 30000);
          channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
          navigator.serviceWorker.controller.postMessage({ type: 'projlib:blocker-' + action, url, mode }, [channel.port2]);
        });
        if (result.error) throw new Error(result.error);
        const state = result.state;
        if (parent === window) {
          document.getElementById('blockerMode').disabled = !state.available;
          document.getElementById('blockerMode').value = state.mode;
          document.getElementById('blockerStatus').textContent = state.mode === 'off' ? 'Ad blocking is off for this site.'
            : `Brave engine · ${state.blocked} requests blocked for this site this session.`;
        }
        send('projlib:blocker-state', { state });
        if (action === 'mode') frame.reload();
      } catch (error) {
        document.getElementById('blockerStatus').textContent = error.message;
        send('projlib:blocker-error', { message: error.message });
      } finally {
        clearTimeout(blockerPoll);
        blockerPoll = setTimeout(() => blockerControl(), 3000);
      }
    }
    document.getElementById('blockerMode').onchange = event => blockerControl('mode', event.target.value);
    const navigate = value => {
      try {
        const url = target(value);
        if (!url) return;
        notice.textContent = 'Opening the website…';
        element.hidden = false;
        frame.go(url);
      } catch (error) { fail(error); }
    };
    let homeExpiry;
    let homePoll;
    let homeState = { configured: false, authorized: false, route: 'cloudflare', expiresAt: 0 };
    const standaloneHome = document.getElementById('homeControls');
    function renderHome(state, message) {
      if (parent !== window) return;
      standaloneHome.hidden = false;
      const authorized = state.authorized && state.expiresAt > Date.now();
      const selection = document.getElementById('homeRoute');
      selection.querySelector('[value="home"]').disabled = !authorized;
      selection.value = authorized && state.route === 'home' ? 'home' : 'cloudflare';
      document.getElementById('homeVerify').disabled = !state.configured;
      document.getElementById('homeForget').hidden = !authorized;
      document.getElementById('homeStatus').textContent = message || (!state.configured ? 'The home host is not connected yet. Cloudflare is available.' : authorized
        ? `Wolfie verified until ${new Date(state.expiresAt).toLocaleString()}.`
        : state.unavailable ? 'Wolfie is unavailable. Cloudflare is available.' : 'Verify the host password to use Wolfie for 12 hours.');
    }
    async function homeControl(action, data = {}) {
      try {
        const method = action === 'status' ? 'GET' : 'POST';
        const response = await fetch('/rewrite/home/' + action, { method, credentials: 'include',
          headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
          body: method === 'POST' ? JSON.stringify(data) : undefined });
        let state = await response.json();
        if (!response.ok) throw new Error(state.error || 'The host could not be verified.');
        if (action === 'login') {
          const check = await fetch('/rewrite/home/status', { credentials: 'include' });
          state = await check.json();
          if (!check.ok || !state.authorized) throw new Error('This browser did not retain the host verification. Check its cookie policy or open the proxy in its own tab.');
        }
        homeState = { ...homeState, ...state };
        state = homeState;
        renderHome(state);
        send('projlib:home-state', { state });
        clearTimeout(homeExpiry); clearTimeout(homePoll);
        if (state.authorized && state.expiresAt > Date.now()) {
          homeExpiry = setTimeout(() => homeControl('status'), Math.max(1, state.expiresAt - Date.now()));
          homePoll = setTimeout(() => homeControl('status'), 60000);
        }
        if (state.unavailable) homePoll = setTimeout(() => homeControl('status'), 60000);
      } catch (error) { renderHome(homeState, error.message); send('projlib:home-error', { message: error.message }); }
    }
    if (parent === window) {
      document.getElementById('homeForm').onsubmit = event => {
        event.preventDefault();
        const field = document.getElementById('homePassword');
        homeControl('login', { password: field.value }); field.value = '';
      };
      document.getElementById('homeRoute').onchange = event => homeControl('route', { route: event.target.value });
      document.getElementById('homeForget').onclick = () => homeControl('logout');
      homeControl('status');
    }
    element.addEventListener('load', () => {
      if (element.hidden) return;
      try {
        if (element.contentWindow.location.href === 'about:blank') return;
        if (element.contentDocument.getElementById('errorTrace')) {
          fail(new Error('The proxy could not load this website.'));
          return;
        }
      } catch {
        fail(new Error('The website tried to navigate outside the proxy.'));
        return;
      }
      notice.textContent = '';
      try { send('projlib:rewrite-loaded', { url: frame.url.href }); }
      catch { send('projlib:rewrite-loaded'); }
      blockerControl();
    });
    frame.addEventListener('urlchange', event => send('projlib:navigation', { url: event.url }));
    document.getElementById('back').onclick = () => frame.back();
    document.getElementById('forward').onclick = () => frame.forward();
    document.getElementById('reload').onclick = () => frame.reload();
    window.addEventListener('message', event => {
      if (event.source !== parent || event.origin !== frontend || event.data?.type !== 'projlib:rewrite-command') return;
      if (event.data.action === 'reload') frame.reload();
      if (event.data.action === 'navigate') navigate(event.data.url);
      if (event.data.action === 'home-status') homeControl('status');
      if (event.data.action === 'home-login') homeControl('login', { password: event.data.password });
      if (event.data.action === 'home-route') homeControl('route', { route: event.data.route });
      if (event.data.action === 'home-logout') homeControl('logout');
      if (event.data.action === 'blocker-status') blockerControl();
      if (event.data.action === 'blocker-mode') blockerControl('mode', event.data.mode);
    });
    // Clearing the entire proxy origin also clears its service worker's in-memory cookie jar.
    document.getElementById('clear').onclick = () => {
      element.src = 'about:blank';
      element.hidden = true;
      send('projlib:rewrite-ended');
      location.replace('/rewrite/clear');
    };
    window.addEventListener('hashchange', () => navigate());
    send('projlib:rewrite-ready');
    navigate();
  } catch (error) { fail(error); }
})();
