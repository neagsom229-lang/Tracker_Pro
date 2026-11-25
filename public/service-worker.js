/* Obsidian service worker — app-shell caching.
 *
 * STRATEGY, AND ONE THING IT DELIBERATELY DOES NOT DO
 * ---------------------------------------------------
 * Stale-while-revalidate for the app shell: serve the cached build
 * instantly, fetch a fresh copy in the background, use it next launch.
 * That's what makes the app open like a native app on a cold start.
 *
 * API responses are NOT cached. It is tempting to cache Supabase reads
 * for offline viewing, and it is the wrong call for a finance app: a
 * cached balance is a WRONG balance the moment anything changes, and a
 * user who acts on a stale number has been actively misled. Requests to
 * Supabase always go to the network and fail honestly when offline.
 *
 * Offline support here therefore means "the app opens and tells you it's
 * offline", not "the app pretends it has your data".
 */

const VERSION = 'v2';
const SHELL_CACHE = `obsidian-shell-${VERSION}`;

// Only the entry point is precached. Vite fingerprints every asset
// (index-a1b2c3.js), so hashed files are picked up at runtime by the
// fetch handler below and a new deploy never serves a half-old bundle.
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // Activate immediately rather than waiting for every tab to close.
      // Combined with clients.claim() below, a user who reloads gets the
      // new worker instead of being served by a worker from two deploys
      // ago until they quit the browser.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/functions/v1/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch API traffic, auth callbacks, or anything cross-origin we
  // don't control. Let the browser handle it normally.
  if (isSupabaseRequest(url) || url.origin !== self.location.origin) return;

  // Navigations: network first, cached shell as the offline fallback.
  // SWR would be wrong here — serving a stale index.html that references
  // a deleted hashed bundle produces a white screen, which is the exact
  // failure the error boundary can't catch because the app never boots.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Hashed build assets: cache-first (immutable filenames). Only cache real
  // static assets; Vercel SPA rewrites can return index.html (200, text/html)
  // for missing files, which must never be cached as an asset.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        const isStaticAsset = /javascript|css|font|woff|ttf|otf|wasm|image\//.test(ct);
        if (response.ok && response.type === 'basic' && !ct.includes('text/html') && isStaticAsset) {
          cache.put(request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  // Other same-origin static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Push handlers removed: notifications/push are deferred (Step 1 scope).