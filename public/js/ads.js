// public/js/ads.js
// Mengambil kode iklan aktif dari /api/ads sesuai penempatan (placement),
// lalu menyisipkannya ke halaman. Script di dalam kode iklan (mis. dari
// Adsterra) dieksekusi ulang secara manual, karena browser tidak menjalankan
// tag <script> yang disisipkan lewat innerHTML begitu saja.

const Ads = (() => {
  function injectCode(container, codeStr) {
    const temp = document.createElement("div");
    temp.innerHTML = codeStr;
    Array.from(temp.childNodes).forEach((node) => {
      if (node.nodeType === 1 && node.tagName === "SCRIPT") {
        const script = document.createElement("script");
        Array.from(node.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
        script.textContent = node.textContent;
        container.appendChild(script);
      } else {
        container.appendChild(node.cloneNode(true));
      }
    });
  }

  async function renderPlacement(placement, container) {
    try {
      const res = await fetch(`/api/ads?placement=${encodeURIComponent(placement)}`);
      const payload = await res.json();
      const ads = (payload && payload.data) || [];
      if (!ads.length) return;
      ads.forEach((ad) => injectCode(container, ad.code));
    } catch {
      // Diamkan saja bila gagal memuat iklan — tidak boleh mengganggu konten utama
    }
  }

  function extractUrl(codeStr) {
    const trimmed = (codeStr || "").trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const match = trimmed.match(/href=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }

  let categoryClickAds = [];

  async function loadCategoryClickAds() {
    try {
      const res = await fetch("/api/ads?placement=category_click");
      const payload = await res.json();
      categoryClickAds = (payload && payload.data) || [];
    } catch {
      categoryClickAds = [];
    }
  }

  function setupCategoryClickRedirect() {
    document.addEventListener("click", (event) => {
      if (!categoryClickAds.length) return;
      const link = event.target.closest('a[href^="/category/"], a[href^="/category"]');
      if (!link) return;

      const ad = categoryClickAds[Math.floor(Math.random() * categoryClickAds.length)];
      const url = extractUrl(ad.code);
      if (!url) return;

      // Buka smartlink di tab baru, biarkan navigasi ke halaman kategori tetap berjalan normal
      window.open(url, "_blank", "noopener");
    });
  }

  function init() {
    // Slot iklan biasa: elemen dengan atribut data-ad-placement="xxx" di halaman
    document.querySelectorAll("[data-ad-placement]").forEach((el) => {
      renderPlacement(el.dataset.adPlacement, el);
    });

    // Placement "global" (popunder/social bar dsb): dimuat sekali per halaman
    // lewat container tersembunyi yang ditambahkan ke <body>.
    const globalContainer = document.createElement("div");
    globalContainer.id = "ad-global-container";
    globalContainer.style.display = "none";
    document.body.appendChild(globalContainer);
    renderPlacement("global", globalContainer);

    // Smartlink saat link kategori diklik (dimuat sekali, lalu dipasangi listener klik)
    loadCategoryClickAds().then(setupCategoryClickRedirect);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { renderPlacement };
})();
