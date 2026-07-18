// public/js/site-config.js
// Menerapkan identitas situs (nama & logo) yang diatur admin lewat dashboard,
// menggantikan teks/branding statis "StreamHub" di halaman publik.

(() => {
  async function init() {
    try {
      const res = await fetch("/api/settings/public");
      const payload = await res.json();
      const settings = (payload && payload.data) || {};

      const siteName = settings.site_name && settings.site_name.trim();
      const siteDescription = settings.site_description && settings.site_description.trim();
      const logoUrl = settings.site_logo_url && settings.site_logo_url.trim();

      if (siteDescription) {
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", siteDescription);
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute("content", siteDescription);
        const heroSubtitle = document.getElementById("heroSubtitle");
        if (heroSubtitle) heroSubtitle.textContent = siteDescription;
      }

      if (siteName) {
        // Ganti teks di semua elemen logo (header/sidebar)
        document.querySelectorAll(".logo").forEach((el) => {
          if (!logoUrl) el.textContent = siteName;
        });
        // Ganti kemunculan "StreamHub" di judul tab browser
        if (document.title.includes("StreamHub")) {
          document.title = document.title.replace(/StreamHub/g, siteName);
        }
      }

      if (logoUrl) {
        document.querySelectorAll(".logo").forEach((el) => {
          el.innerHTML = "";
          const img = document.createElement("img");
          img.src = logoUrl;
          img.alt = siteName || "Logo";
          img.style.cssText = "height:28px;width:auto;display:block;";
          el.appendChild(img);
        });
      }
    } catch {
      // Diamkan saja bila gagal — branding default tetap tampil
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
