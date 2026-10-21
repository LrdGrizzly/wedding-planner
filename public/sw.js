/* Wedding Planner service worker.
   Network-first for the app (cache = offline fallback), never touches
   Google APIs. Cache name is per build so a deploy replaces stale files. */
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = `wedding-planner-${VERSION}`;
const PASSTHROUGH = ['googleapis.com', 'accounts.google.com', 'apis.google.com', 'gstatic.com', 'docs.google.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('wedding-planner-') && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET' || PASSTHROUGH.some((d) => url.includes(d))) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.status === 200 && url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./')).then((r) => r || Response.error())),
  );
});
