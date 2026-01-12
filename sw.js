/* Caixa Preta - Service Worker (PWA) */
const CACHE_NAME = "caixa-preta-v2";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/assets/logo-mask.svg",
  "/assets/logo/logo.png",
  "/assets/logo/icon-192.png",
  "/assets/logo/icon-512.png",
  "/assets/logo/apple-touch-icon.png",
  "/gif/video_2026-01-12_06-19-34.mp4"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // cache only same-origin successful responses
        const url = new URL(req.url);
        if (url.origin === self.location.origin && res && res.ok) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // offline fallback: try index for navigations
        if (req.mode === "navigate") {
          return (await cache.match("/index.html")) || (await cache.match("/"));
        }
        throw e;
      }
    })()
  );
});

