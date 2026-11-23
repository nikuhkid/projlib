importScripts('/rewrite/vendor/scramjet/scramjet.all.js');
importScripts('/rewrite/adblock-worker.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const blockerReady = ProjLibAdblock.BraveBlocker.load().then(blocker => {
  self.ProjLibBlocker = blocker;
  scramjet.addEventListener('request', event => blocker.request(event));
  return blocker;
});
// Keep the rejection observable when a page asks for status or a rewritten resource.
blockerReady.catch(error => console.error('Brave ad blocking failed to initialize:', error.message));
self.addEventListener('message', event => {
  if (!event.data?.type?.startsWith('projlib:blocker-')) return;
  event.waitUntil(blockerReady.then(blocker => blocker.message(event)).catch(error => {
    event.ports?.[0]?.postMessage({ error: error.message });
  }));
});
scramjet.addEventListener('handleResponse', event => {
  if (['document', 'iframe'].includes(event.destination)) {
    event.responseHeaders['content-security-policy'] = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'self' 'unsafe-inline' blob: data:; form-action 'self'; base-uri 'self'";
    self.ProjLibBlocker?.afterRewrite(event);
  }
});
let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('$scramjet', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function saveCookies() {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('cookies', 'readwrite');
    transaction.objectStore('cookies').put(JSON.parse(scramjet.cookieStore.dump()), 'cookies');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    // Failed rewrites must not silently fetch an ordinary external resource from the client.
    if (new URL(event.request.url).origin !== self.location.origin) return Response.error();
    if (new URL(event.request.url).pathname === '/rewrite/adblock/socket') {
      if (event.request.method !== 'POST') return new Response(null, { status: 405 });
      const body = await event.request.text();
      if (body.length > 8192) return new Response(null, { status: 413 });
      const data = JSON.parse(body);
      const url = new URL(data.url);
      const source = new URL(data.source);
      if (!['ws:', 'wss:'].includes(url.protocol) || !['http:', 'https:'].includes(source.protocol)) return new Response(null, { status: 400 });
      const blocker = await blockerReady;
      const mode = blocker.mode(source.href);
      const blocked = mode !== 'off' && blocker.engine.check(url.href, source.href, 'websocket', 'GET', mode).blocked;
      if (blocked) blocker.counts.set(source.hostname, (blocker.counts.get(source.hostname) || 0) + 1);
      return Response.json({ blocked });
    }
    await scramjet.loadConfig();
    if (scramjet.config && scramjet.route(event)) {
      const blocker = await blockerReady;
      blocker.registerContext(event);
      const response = await scramjet.fetch(event);
      await saveCookies();
      return response;
    }
    return fetch(event.request);
  })());
});
