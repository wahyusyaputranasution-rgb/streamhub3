// public/js/main.js - logika halaman Home

(() => {
  const latestGrid = document.getElementById("latestGrid");
  const popularGrid = document.getElementById("popularGrid");
  const allGrid = document.getElementById("allGrid");
  const loaderRow = document.getElementById("loaderRow");
  const categoryChips = document.getElementById("categoryChips");
  const quickSearch = document.getElementById("quickSearch");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");

  document.getElementById("year").textContent = new Date().getFullYear();

  let currentPage = 1;
  let totalPages = 1;
  let loading = false;

  function skeletonCard() {
    const div = document.createElement("div");
    div.className = "skeleton-card";
    div.innerHTML = `
      <div class="skeleton skeleton-thumb"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    `;
    return div;
  }

  function renderSkeletons(container, count) {
    container.innerHTML = "";
    for (let i = 0; i < count; i++) container.appendChild(skeletonCard());
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
      </div>
    `;
    return a;
  }

  function renderGrid(container, items) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Belum ada video.</div>`;
      return;
    }
    items.forEach((v) => container.appendChild(videoCard(v)));
  }

  async function loadCategories() {
    try {
      const res = await Utils.api("/api/categories");
      (res.data || []).forEach((cat) => {
        const a = document.createElement("a");
        a.href = `/category/?slug=${encodeURIComponent(cat.slug)}`;
        a.className = "chip";
        a.textContent = `${cat.name} (${cat.video_count})`;
        categoryChips.appendChild(a);
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function loadLatest() {
    renderSkeletons(latestGrid, 5);
    try {
      const res = await Utils.api("/api/videos?page=1&perPage=5&orderBy=publish_date");
      renderGrid(latestGrid, res.data.items);
    } catch (err) {
      latestGrid.innerHTML = `<div class="empty-state">Gagal memuat video terbaru.</div>`;
    }
  }

  async function loadPopular() {
    renderSkeletons(popularGrid, 5);
    try {
      const res = await Utils.api("/api/videos?page=1&perPage=5&orderBy=views");
      renderGrid(popularGrid, res.data.items);
    } catch (err) {
      popularGrid.innerHTML = `<div class="empty-state">Gagal memuat video populer.</div>`;
    }
  }

  async function loadAllVideos(page) {
    if (loading) return;
    loading = true;
    loaderRow.style.display = "flex";
    if (page === 1) renderSkeletons(allGrid, 10);
    try {
      const res = await Utils.api(`/api/videos?page=${page}&perPage=10&orderBy=publish_date`);
      totalPages = res.data.totalPages;
      currentPage = res.data.page;
      if (page === 1) allGrid.innerHTML = "";
      if (!res.data.items.length && page === 1) {
        allGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Belum ada video.</div>`;
      } else {
        res.data.items.forEach((v) => allGrid.appendChild(videoCard(v)));
        if (page === 1) Utils.insertSponsorRandomly(allGrid);
      }
    } catch (err) {
      if (page === 1) allGrid.innerHTML = `<div class="empty-state">Gagal memuat video.</div>`;
    } finally {
      loading = false;
      loaderRow.style.display = "none";
    }
  }

  function setupInfiniteScroll() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !loading && currentPage < totalPages) {
            loadAllVideos(currentPage + 1);
          }
        });
      },
      { rootMargin: "300px" }
    );
    observer.observe(loaderRow);
  }

  quickSearch.addEventListener(
    "input",
    Utils.debounce((e) => {
      const q = e.target.value.trim();
      if (q.length >= 2) window.location.href = `/search/?q=${encodeURIComponent(q)}`;
    }, 500)
  );

  mobileMenuBtn.addEventListener("click", () => {
    window.location.href = "/search/";
  });

  loadCategories();
  loadLatest();
  loadPopular();
  loadAllVideos(1).then(setupInfiniteScroll);
})();
