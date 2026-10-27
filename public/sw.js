// Service worker: keeps School Timetable working offline once installed or visited.
// Pages: network first, falling back to the cached page. Hashed assets: cache first.
const CACHE = 'timetable-v1';
const CORE = ['./', './index.html', './site.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png'];

// Also caches the scripts and styles the page links to, so the first visit is enough to work offline.
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(CORE);
  const html = await (await c.match('./index.html')).text();
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await c.addAll([...new Set(assets)]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // The big single-file download is not needed by the app itself.
  if (url.pathname.endsWith('/timetable-offline.html')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
