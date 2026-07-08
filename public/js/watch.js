// public/js/watch.js - logika halaman Watch

(() => {
  document.getElementById("year").textContent = new Date().getFullYear();

  const playerWrap = document.getElementById("playerWrap");
  const videoTitle = document.getElementById("videoTitle");
  const videoMeta = document.getElementById("videoMeta");
  const videoDesc = document.getElementById("videoDesc");
  const relatedList = document.getElementById("relatedList");
  const shareBtn = document.getElementById("shareBtn");
  const copyLinkBtn = document.getElementById("copyLinkBtn");
  const quickSearch = document.getElementById("quickSearch");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const toast = document.getElementById("toast");

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function relatedCard(video) {
    const thumb = video.thumbnail_url || Utils.placeholderThumb(video.title);
    const a = document.createElement("a");
    a.href = `/watch/?slug=${encodeURIComponent(video.slug)}`;
    a.className = "related-card";
    a.innerHTML = `
      <div class="related-thumb"><img loading="lazy" src="${Utils.escapeHtml(thumb)}" alt="${Utils.escapeHtml(video.title)}" onerror="this.src='${Utils.placeholderThumb(video.title)}'"></div>
      <div class="related-info">
        <h4>${Utils.escapeHtml(video.title)}</h4>
        <span>${Utils.formatViews(video.views)}x ditonton</span>
      </div>
    `;
    return a;
  }

  function setMeta(video) {
    const title = `${video.title} - StreamHub`;
    document.title = title;
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("pageDesc").setAttribute("content", (video.description || "").slice(0, 160));
    document.getElementById("ogTitle").setAttribute("content", video.title);
    document.getElementById("ogDesc").setAttribute("content", (video.description || "").slice(0, 160));
    document.getElementById("ogImage").setAttribute("content", video.thumbnail_url || "");
    document.getElementById("canonicalLink").setAttribute("href", `/watch/?slug=${encodeURIComponent(video.slug)}`);

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: video.title,
      description: video.description || video.title,
      thumbnailUrl: video.thumbnail_url ? [video.thumbnail_url] : [],
      uploadDate: video.publish_date || video.created_at,
      interactionStatistic: {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/WatchAction",
        userInteractionCount: video.views,
      },
    };
    document.getElementById("jsonLd").textContent = JSON.stringify(jsonLd);
  }

  async function load() {
    const slug = Utils.qs("slug");
    if (!slug) {
      window.location.href = "/404.html";
      return;
    }
    try {
      const res = await Utils.api(`/api/video/${encodeURIComponent(slug)}`);
      const { video, related } = res.data;
      setMeta(video);

      playerWrap.classList.remove("skeleton");
      playerWrap.innerHTML = `<iframe src="${Utils.escapeHtml(video.embed_url)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;

      videoTitle.classList.remove("skeleton", "skeleton-line");
      videoTitle.style.height = "";
      videoTitle.textContent = video.title;

      videoMeta.innerHTML = `
        ${video.category_name ? `<span class="cat-tag">${Utils.escapeHtml(video.category_name)}</span>` : ""}
        <span>${Utils.formatViews(video.views)}x ditonton</span>
        <span>${Utils.formatDate(video.publish_date)}</span>
      `;

      videoDesc.textContent = video.description || "Tidak ada deskripsi.";

      relatedList.innerHTML = "";
      if (!related.length) {
        relatedList.innerHTML = `<div class="empty-state">Belum ada video terkait.</div>`;
      } else {
        related.forEach((v) => relatedList.appendChild(relatedCard(v)));
      }

      // Hitung view (server melindungi dari spam refresh)
      fetch(`/api/view/${video.id}`, { method: "POST" }).catch(() => {});

      const shareData = { title: video.title, url: window.location.href };
      shareBtn.addEventListener("click", async () => {
        if (navigator.share) {
          try { await navigator.share(shareData); } catch {}
        } else {
          await navigator.clipboard.writeText(window.location.href);
          showToast("Link disalin ke clipboard");
        }
      });

      copyLinkBtn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(window.location.href);
        showToast("Link disalin ke clipboard");
      });
    } catch (err) {
      videoTitle.textContent = "Video tidak ditemukan";
      videoTitle.classList.remove("skeleton", "skeleton-line");
      videoDesc.textContent = "Video yang Anda cari tidak tersedia atau sudah dihapus.";
      playerWrap.classList.remove("skeleton");
      playerWrap.innerHTML = `<div class="empty-state" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">Video tidak tersedia</div>`;
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

  load();
})();
