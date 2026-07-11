// public/js/admin-pwa.js
// Mendaftarkan service worker khusus admin, supaya panel admin bisa
// di-install sebagai app terpisah (ikon sendiri, judul "StreamHub Admin").

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/admin/sw-admin.js", { scope: "/admin/" }).catch(() => {});
  });
}
