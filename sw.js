// My Writing: service worker.
// App shell: cache-first (versioned cache). Supabase REST GET: network-first, cached copy as
// fallback. Auth calls and anything that is not a GET are never touched or cached.
// Bump VERSION together with APP_VERSION in app.ts on every deploy.

const VERSION = 'writing-library-v1.3';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './dist/app.js',
  './dist/lib/data.js',
  './dist/lib/format.js',
  './dist/lib/route.js',
  './dist/lib/search.js',
  './dist/lib/types.js',
  './dist/lib/views.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL_ASSETS.concat([SUPABASE_JS]).map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] could not cache', url, err);
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.includes('/auth/v1/')) return;
  if (url.pathname.includes('/rest/v1/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || request.url.startsWith(SUPABASE_JS)) {
    event.respondWith(cacheFirst(request));
  }
});
