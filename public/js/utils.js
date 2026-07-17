// public/js/utils.js
// Util bersama untuk semua halaman: pemanggilan API, format angka/tanggal,
// escape HTML, debounce, dan penyimpanan CSRF token di memori (bukan localStorage
// demi keamanan token sesi admin).

const Utils = (() => {
  let csrfToken = null;

  function setCsrfToken(token) {
    csrfToken = token;
  }

  function getCsrfToken() {
    return csrfToken;
  }

  async function api(path, { method = "GET", body = null, needsCsrf = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (needsCsrf && csrfToken) headers["X-CSRF-Token"] = csrfToken;

    const res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const message = (payload && payload.error) || `Permintaan gagal (${res.status})`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return payload;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatViews(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "jt";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "rb";
    return String(n);
  }

  function formatDate(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return iso;
    }
  }

  function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function qs(name, fallback = null) {
    const params = new URLSearchParams(window.location.search);
    return params.has(name) ? params.get(name) : fallback;
  }

  function placeholderThumb(title) {
    const initials = encodeURIComponent((title || "?").slice(0, 2).toUpperCase());
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='225'><rect width='100%' height='100%' fill='%23181a23'/><text x='50%' y='50%' font-family='sans-serif' font-size='42' fill='%233a3f52' text-anchor='middle' dominant-baseline='middle'>${initials}</text></svg>`;
  }

  function buildSponsorCard(ad) {
    const a = document.createElement("a");
    a.href = ad.link_url;
    a.target = "_blank";
    a.rel = "noopener sponsored";
    a.className = "video-card sponsor-card";
    a.innerHTML = `
      <div class="video-thumb">
        <img loading="lazy" src="${escapeHtml(ad.image_url)}" alt="${escapeHtml(ad.title)}">
        <span class="sponsor-badge">Sponsor</span>
      </div>
      <div class="video-info">
        <h3>${escapeHtml(ad.title)}</h3>
      </div>
    `;
    return a;
  }

  async function insertSponsorRandomly(container) {
    try {
      const settingsRes = await fetch("/api/settings/public");
      const settingsPayload = await settingsRes.json();
      const settings = (settingsPayload && settingsPayload.data) || {};
      if (settings.feature_sponsor_enabled === "0") return;

      const res = await api("/api/sponsor-ads/active");
      const ad = res.data;
      if (!ad) return;
      const card = buildSponsorCard(ad);
      const children = container.children;
      if (!children.length) {
        container.appendChild(card);
        return;
      }
      const randomIndex = Math.floor(Math.random() * (children.length + 1));
      if (randomIndex >= children.length) container.appendChild(card);
      else container.insertBefore(card, children[randomIndex]);
    } catch {
      // Diamkan saja bila gagal memuat iklan sponsor
    }
  }

  return {
    api,
    escapeHtml,
    formatViews,
    formatDate,
    debounce,
    qs,
    setCsrfToken,
    getCsrfToken,
    placeholderThumb,
    insertSponsorRandomly,
  };
})();
