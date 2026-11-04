importScripts('/rewrite/vendor/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
scramjet.addEventListener('handleResponse', event => {
  if (['document', 'iframe'].includes(event.destination)) {
    event.responseHeaders['content-security-policy'] = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'self' 'unsafe-inline' blob: data:; form-action 'self'; base-uri 'self'";
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
    await scramjet.loadConfig();
    if (scramjet.config && scramjet.route(event)) {
      const response = await scramjet.fetch(event);
      await saveCookies();
      return response;
    }
    return fetch(event.request);
  })());
});
