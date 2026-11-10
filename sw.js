const CACHE_NAME = "tooltime-cache-v4";
const APP_SHELL = [
  "index.html",
  "app.bundle.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Network-first for navigation AND for the app's own static files (app shell).
// Cross-origin requests (the live API at staff.tooltime.ae) are never cached
// and always go straight to the network -- caching API responses is what
// caused a single early empty/error result to get "stuck" and served for the
// rest of the day, even after the backend was fixed.
//
// The app shell used to be cache-first: once a device had loaded app.bundle.js
// once, it kept serving that same cached copy forever, even after a fresh
// deploy, until the cache name below changed. Network-first fixes that: every
// load tries the network first (so a redeployed app.bundle.js/index.html is
// picked up immediately) and only falls back to the cache when the device is
// actually offline, which is what the cache is for.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("index.html"))
    );
    return;
  }

  // Cross-origin (the API) -- always network, never cache.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  // Same-origin static files -- network-first, cache as an offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
