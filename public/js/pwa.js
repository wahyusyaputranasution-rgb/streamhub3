// public/js/pwa.js
// Mendaftarkan service worker supaya situs bisa di-install sebagai PWA.
// Dimuat di semua halaman publik (bukan halaman admin, supaya tidak ada
// cache yang mengganggu proses login/dashboard).

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Diamkan saja bila gagal (mis. browser lama) — situs tetap jalan normal tanpa PWA
    });
  });
}
