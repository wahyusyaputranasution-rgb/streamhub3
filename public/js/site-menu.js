// public/js/site-menu.js
// Toggle dropdown menu (ikon titik-3) yang berisi link ke halaman lain
// seperti Kebijakan Privasi dan Syarat & Ketentuan.

(() => {
  const btn = document.getElementById("siteMenuBtn");
  const dropdown = document.getElementById("siteMenuDropdown");
  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove("show");
    }
  });
})();
