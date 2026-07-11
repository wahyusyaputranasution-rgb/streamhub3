// public/js/cs-widget.js
// Tombol Customer Service mengambang di pojok bawah. Link & label-nya
// diatur lewat dashboard admin (tab Pengaturan), bukan hardcode di kode.

(() => {
  async function init() {
    try {
      const res = await fetch("/api/settings/public");
      const payload = await res.json();
      if (!payload.success) return;

      const { cs_enabled, cs_link, cs_label } = payload.data;
      if (cs_enabled !== "1" || !cs_link) return;

      const wrap = document.createElement("div");
      wrap.id = "cs-widget";
      wrap.style.cssText =
        "position:fixed;right:16px;bottom:90px;z-index:9998;display:flex;align-items:center;gap:8px;font-family:Segoe UI,Roboto,sans-serif;";

      if (cs_label) {
        const label = document.createElement("span");
        label.textContent = cs_label;
        label.style.cssText =
          "background:#181a23;color:#e9e9ef;border:1px solid #262836;padding:8px 12px;border-radius:8px;font-size:0.8rem;box-shadow:0 4px 14px rgba(0,0,0,0.3);white-space:nowrap;";
        wrap.appendChild(label);
      }

      const btn = document.createElement("a");
      btn.href = cs_link;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.setAttribute("aria-label", "Customer Service");
      btn.style.cssText =
        "width:52px;height:52px;border-radius:50%;background:#ff3860;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,56,96,0.4);flex-shrink:0;";
      btn.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      wrap.appendChild(btn);

      document.body.appendChild(wrap);
    } catch {
      // Diamkan saja bila gagal memuat pengaturan CS
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
