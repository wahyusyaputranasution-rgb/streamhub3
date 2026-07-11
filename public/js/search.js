// public/js/search.js - pencarian realtime

(() => {
  document.getElementById("year").textContent = new Date().getFullYear();

  const resultGrid = document.getElementById("resultGrid");
  const searchInfo = document.getElementById("searchInfo");
  const mainSearchInput = document.getElementById("mainSearchInput");
  const quickSearch = document.getElementById("quickSearch");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");

  function skeletonCard() {
    const div = document.createElement("div");
    div.className = "skeleton-card";
    div.innerHTML = `<div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div>`;
    return div;
  }

  function videoCard(video) {
    const thumb = video.thumbnail_url || Utils.placeholderThumb(video.title);
    const cat = video.category_name ? `<span>${Utils.escapeHtml(video.category_name)}</span>` : "<span></span>";
    const a = document.createElement("a");
    a.href = `/watch/?slug=${encodeURIComponent(video.slug)}`;
    a.className = "video-card";
    a.innerHTML = `
      <div class="video-thumb">
        <img loading="lazy" src="${Utils.escapeHtml(thumb)}" alt="${Utils.escapeHtml(video.title)}" onerror="this.src='${Utils.placeholderThumb(video.title)}'">
        <span class="video-badge">${Utils.formatViews(video.views)}x ditonton</span>
      </div>
      <div class="video-info">
        <h3>${Utils.escapeHtml(video.title)}</h3>
        <div class="video-meta">${cat}<span>${Utils.formatDate(video.publish_date)}</span></div>
      </div>`;
    return a;
  }

  async function runSearch(q) {
    if (!q) {
      resultGrid.innerHTML = "";
      searchInfo.textContent = "Ketik kata kunci untuk mulai mencari.";
      return;
    }
    resultGrid.innerHTML = "";
    for (let i = 0; i < 8; i++) resultGrid.appendChild(skeletonCard());
    searchInfo.textContent = `Mencari "${q}"...`;

    try {
      const res = await Utils.api(`/api/search?q=${encodeURIComponent(q)}`);
      const items = res.data.items;
      resultGrid.innerHTML = "";
      searchInfo.textContent = items.length
        ? `Ditemukan ${res.data.total} hasil untuk "${q}"`
        : `Tidak ada hasil untuk "${q}"`;
      items.forEach((v) => resultGrid.appendChild(videoCard(v)));
    } catch {
      resultGrid.innerHTML = `<div class="empty-state">Gagal memuat hasil pencarian.</div>`;
    }
  }

  const debouncedSearch = Utils.debounce((q) => {
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());
    runSearch(q);
  }, 350);

  mainSearchInput.addEventListener("input", (e) => debouncedSearch(e.target.value.trim()));
  quickSearch.addEventListener("input", (e) => {
    mainSearchInput.value = e.target.value;
    debouncedSearch(e.target.value.trim());
  });
  mobileMenuBtn.addEventListener("click", () => mainSearchInput.focus());

  const initialQ = Utils.qs("q", "");
  if (initialQ) {
    mainSearchInput.value = initialQ;
    runSearch(initialQ);
  }
})();
