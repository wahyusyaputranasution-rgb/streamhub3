// public/sw.js
// Service worker minimal — cukup untuk membuat situs "installable" sebagai PWA,
// plus cache ringan untuk aset statis (CSS/JS/ikon) supaya loading lebih cepat.
// Halaman & data API TIDAK di-cache, supaya konten video selalu up-to-date.

const CACHE_NAME = "streamhub-static-v1";
const STATIC_ASSETS = [
  "/css/style.css",
  "/css/admin.css",
  "/js/utils.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Jangan sentuh request API atau non-GET — selalu ambil langsung dari network
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Cache-first hanya untuk aset statis yang sudah didaftarkan di atas
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
        );
      })
    );
  }
  // Selain itu (HTML halaman, dll) biarkan lewat network seperti biasa
});
