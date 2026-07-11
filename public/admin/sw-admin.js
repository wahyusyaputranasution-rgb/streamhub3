// public/admin/sw-admin.js
// Service worker KHUSUS untuk halaman admin (scope terbatas ke /admin/).
// Sengaja TIDAK melakukan caching apa pun — dashboard admin selalu butuh
// data terbaru (video, statistik, dll), jadi biarkan semua request lewat
// jaringan seperti biasa. Listener 'fetch' ini hanya wajib ada supaya
// browser menganggap halaman admin bisa di-install sebagai app terpisah.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Tidak melakukan apa-apa -> request tetap berjalan normal ke jaringan
});
