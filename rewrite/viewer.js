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
    await connection.setTransport('/rewrite/transport.mjs', [location.origin + '/rewrite']);
    frame = controller.createFrame(element);
    const navigate = value => {
      try {
        const url = target(value);
        if (!url) return;
        notice.textContent = 'Opening the website…';
        element.hidden = false;
        frame.go(url);
      } catch (error) { fail(error); }
    };
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
    });
    frame.addEventListener('urlchange', event => send('projlib:navigation', { url: event.url }));
    document.getElementById('back').onclick = () => frame.back();
    document.getElementById('forward').onclick = () => frame.forward();
    document.getElementById('reload').onclick = () => frame.reload();
    window.addEventListener('message', event => {
      if (event.source !== parent || event.origin !== frontend || event.data?.type !== 'projlib:rewrite-command') return;
      if (event.data.action === 'reload') frame.reload();
      if (event.data.action === 'navigate') navigate(event.data.url);
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
