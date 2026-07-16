// public/js/category.js - daftar kategori & video per kategori dengan pagination

(() => {
  document.getElementById("year").textContent = new Date().getFullYear();

  const categoryChips = document.getElementById("categoryChips");
  const videoGrid = document.getElementById("videoGrid");
  const pagination = document.getElementById("pagination");
  const categoryHeading = document.getElementById("categoryHeading");
  const categorySub = document.getElementById("categorySub");
  const quickSearch = document.getElementById("quickSearch");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");

  const activeSlug = Utils.qs("slug", "");
  let currentPage = parseInt(Utils.qs("page", "1"), 10) || 1;

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

  async function loadChips() {
    try {
      const res = await Utils.api("/api/categories");
      (res.data || []).forEach((cat) => {
        const a = document.createElement("a");
        a.href = `/category/?slug=${encodeURIComponent(cat.slug)}`;
        a.className = "chip" + (cat.slug === activeSlug ? " active" : "");
        a.textContent = `${cat.name} (${cat.video_count})`;
        categoryChips.appendChild(a);
        if (cat.slug === activeSlug) {
          categoryHeading.textContent = cat.name;
          categorySub.textContent = `${cat.video_count} video dalam kategori ini.`;
          document.title = `${cat.name} - StreamHub`;
          document.getElementById("pageDesc").setAttribute("content", `Video kategori ${cat.name} di StreamHub.`);
        }
      });
      if (!activeSlug) categoryChips.firstElementChild.classList.add("active");
    } catch (err) {
      console.error(err);
    }
  }

  function renderPagination(totalPages) {
    pagination.innerHTML = "";
    if (totalPages <= 1) return;
    const makeBtn = (label, page, disabled, active) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.disabled = disabled;
      if (active) btn.classList.add("active");
      btn.addEventListener("click", () => goToPage(page));
      return btn;
    };
    pagination.appendChild(makeBtn("‹", currentPage - 1, currentPage <= 1, false));
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
        pagination.appendChild(makeBtn(String(p), p, false, p === currentPage));
      } else if (p === 2 || p === totalPages - 1) {
        const span = document.createElement("span");
        span.textContent = "…";
        span.style.padding = "8px 4px";
        pagination.appendChild(span);
      }
    }
    pagination.appendChild(makeBtn("›", currentPage + 1, currentPage >= totalPages, false));
  }

  function goToPage(page) {
    const url = new URL(window.location.href);
    url.searchParams.set("page", page);
    window.location.href = url.toString();
  }

  async function loadVideos() {
    videoGrid.innerHTML = "";
    for (let i = 0; i < 10; i++) videoGrid.appendChild(skeletonCard());
    try {
      const qs = new URLSearchParams({ page: String(currentPage), perPage: "12", orderBy: "publish_date" });
      if (activeSlug) qs.set("category", activeSlug);
      const res = await Utils.api(`/api/videos?${qs.toString()}`);
      videoGrid.innerHTML = "";
      if (!res.data.items.length) {
        videoGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Belum ada video di kategori ini.</div>`;
      } else {
        res.data.items.forEach((v) => videoGrid.appendChild(videoCard(v)));
        Utils.insertSponsorRandomly(videoGrid);
      }
      renderPagination(res.data.totalPages);
    } catch {
      videoGrid.innerHTML = `<div class="empty-state">Gagal memuat video.</div>`;
    }
  }

  quickSearch.addEventListener(
    "input",
    Utils.debounce((e) => {
      const q = e.target.value.trim();
      if (q.length >= 2) window.location.href = `/search/?q=${encodeURIComponent(q)}`;
    }, 500)
  );
  mobileMenuBtn.addEventListener("click", () => (window.location.href = "/search/"));

  loadChips();
  loadVideos();
})();
