// public/js/admin-dashboard.js

(() => {
  const toast = document.getElementById("toast");
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2400);
  }

  // ---------- Auth guard ----------
  let categoriesCache = [];

  async function guardAuth() {
    try {
      const res = await Utils.api("/api/auth/check");
      Utils.setCsrfToken(res.data.csrfToken);
      document.getElementById("adminUsername").textContent = res.data.username;
      document.getElementById("settingsUsername").textContent = res.data.username;
    } catch {
      window.location.href = "/admin/login/";
    }
  }

  // ---------- Tabs ----------
  const tabPanels = {
    dashboard: document.getElementById("tab-dashboard"),
    video: document.getElementById("tab-video"),
    kategori: document.getElementById("tab-kategori"),
    pengaturan: document.getElementById("tab-pengaturan"),
  };
  const topbarTitle = document.getElementById("topbarTitle");
  const titles = { dashboard: "Dashboard", video: "Kelola Video", kategori: "Kelola Kategori", pengaturan: "Pengaturan" };

  function activateTab(tab) {
    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].style.display = key === tab ? "" : "none";
    });
    topbarTitle.textContent = titles[tab] || "Dashboard";
    document.querySelectorAll(".admin-nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    document.querySelectorAll("#mobileTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "dashboard") loadStats();
    if (tab === "video") loadVideosTable();
    if (tab === "kategori") loadCategoriesTable();
  }

  document.querySelectorAll(".admin-nav a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      activateTab(a.dataset.tab);
    });
  });
  document.querySelectorAll("#mobileTabs button").forEach((b) => {
    b.addEventListener("click", () => activateTab(b.dataset.tab));
  });

  async function doLogout() {
    try {
      await Utils.api("/api/auth/logout", { method: "POST", needsCsrf: true });
    } catch {}
    window.location.href = "/admin/login/";
  }
  document.getElementById("logoutBtn").addEventListener("click", doLogout);
  document.getElementById("logoutBtn2").addEventListener("click", doLogout);

  // ---------- Dashboard stats ----------
  function statusBadge(status) {
    return `<span class="badge ${status}">${status === "published" ? "Publish" : "Draft"}</span>`;
  }

  async function loadStats() {
    try {
      const res = await Utils.api("/api/stats");
      const s = res.data;
      document.getElementById("statTotalVideos").textContent = s.totalVideos;
      document.getElementById("statTotalViews").textContent = Utils.formatViews(s.totalViews);
      document.getElementById("statTotalCategories").textContent = s.totalCategories;
      document.getElementById("statPublished").textContent = s.totalPublished;
      document.getElementById("statDraft").textContent = s.totalDraft;

      document.getElementById("latestVideosBody").innerHTML = s.latestVideos
        .map((v) => `<tr><td class="title-cell">${Utils.escapeHtml(v.title)}</td><td>${statusBadge(v.status)}</td><td>${v.views}</td><td>${Utils.formatDate(v.created_at)}</td></tr>`)
        .join("") || `<tr><td colspan="4">Belum ada data.</td></tr>`;

      document.getElementById("popularVideosBody").innerHTML = s.popularVideos
        .map((v) => `<tr><td class="title-cell">${Utils.escapeHtml(v.title)}</td><td>${statusBadge(v.status)}</td><td>${v.views}</td></tr>`)
        .join("") || `<tr><td colspan="3">Belum ada data.</td></tr>`;
    } catch (err) {
      showToast("Gagal memuat statistik");
    }
  }

  // ---------- Category select options ----------
  async function refreshCategoriesCache() {
    const res = await Utils.api("/api/categories");
    categoriesCache = res.data || [];
    const select = document.getElementById("videoCategorySelect");
    select.innerHTML = '<option value="">Tanpa Kategori</option>' + categoriesCache.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join("");
  }

  // ---------- Videos table ----------
  async function loadVideosTable() {
    const tbody = document.getElementById("videosBody");
    tbody.innerHTML = `<tr><td colspan="6">Memuat...</td></tr>`;
    try {
      await refreshCategoriesCache();
      const res = await Utils.api("/api/videos?admin=1&perPage=50&page=1");
      const items = res.data.items;
      tbody.innerHTML = items.length
        ? items
            .map(
              (v) => `<tr>
          <td class="title-cell">${Utils.escapeHtml(v.title)}</td>
          <td>${Utils.escapeHtml(v.category_name || "-")}</td>
          <td>${statusBadge(v.status)}</td>
          <td>${v.views}</td>
          <td>${Utils.formatDate(v.publish_date)}</td>
          <td>
            <button class="icon-btn" data-edit="${v.id}">Edit</button>
            <button class="icon-btn danger" data-delete="${v.id}" data-title="${Utils.escapeHtml(v.title)}">Hapus</button>
          </td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="6">Belum ada video.</td></tr>`;

      tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openVideoModal(btn.dataset.edit)));
      tbody.querySelectorAll("[data-delete]").forEach((btn) =>
        btn.addEventListener("click", () => confirmAction(`Hapus video "${btn.dataset.title}"?`, () => deleteVideo(btn.dataset.delete)))
      );
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">Gagal memuat data video.</td></tr>`;
    }
  }

  async function deleteVideo(id) {
    try {
      await Utils.api(`/api/videos/${id}`, { method: "DELETE", needsCsrf: true });
      showToast("Video dihapus");
      loadVideosTable();
    } catch (err) {
      showToast(err.message || "Gagal menghapus video");
    }
  }

  // ---------- Video modal ----------
  const videoModal = document.getElementById("videoModal");
  const videoForm = document.getElementById("videoForm");
  const videoFormError = document.getElementById("videoFormError");

  document.getElementById("addVideoBtn").addEventListener("click", () => openVideoModal(null));
  document.getElementById("videoCancelBtn").addEventListener("click", () => videoModal.classList.remove("show"));

  async function openVideoModal(id) {
    videoFormError.style.display = "none";
    videoForm.reset();
    document.getElementById("videoId").value = id || "";
    document.getElementById("videoModalTitle").textContent = id ? "Edit Video" : "Tambah Video";

    if (id) {
      try {
        const res = await Utils.api(`/api/videos/${id}`);
        const v = res.data;
        document.getElementById("videoTitleInput").value = v.title;
        document.getElementById("videoDescInput").value = v.description || "";
        document.getElementById("videoCategorySelect").value = v.category_id || "";
        document.getElementById("videoStatusSelect").value = v.status;
        document.getElementById("videoEmbedInput").value = v.embed_url;
        document.getElementById("videoThumbInput").value = v.thumbnail_url || "";
        if (v.publish_date) {
          document.getElementById("videoPublishInput").value = v.publish_date.slice(0, 16);
        }
      } catch (err) {
        showToast("Gagal memuat data video");
        return;
      }
    }
    videoModal.classList.add("show");
  }

  videoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    videoFormError.style.display = "none";
    const id = document.getElementById("videoId").value;
    const payload = {
      title: document.getElementById("videoTitleInput").value.trim(),
      description: document.getElementById("videoDescInput").value.trim(),
      categoryId: document.getElementById("videoCategorySelect").value || null,
      status: document.getElementById("videoStatusSelect").value,
      embedUrl: document.getElementById("videoEmbedInput").value.trim(),
      thumbnailUrl: document.getElementById("videoThumbInput").value.trim(),
      publishDate: document.getElementById("videoPublishInput").value || null,
    };

    try {
      if (id) {
        await Utils.api(`/api/videos/${id}`, { method: "PUT", body: payload, needsCsrf: true });
        showToast("Video diperbarui");
      } else {
        await Utils.api("/api/videos", { method: "POST", body: payload, needsCsrf: true });
        showToast("Video ditambahkan");
      }
      videoModal.classList.remove("show");
      loadVideosTable();
    } catch (err) {
      videoFormError.textContent = err.message || "Gagal menyimpan video";
      videoFormError.style.display = "block";
    }
  });

  // ---------- Categories table ----------
  async function loadCategoriesTable() {
    const tbody = document.getElementById("categoriesBody");
    tbody.innerHTML = `<tr><td colspan="4">Memuat...</td></tr>`;
    try {
      const res = await Utils.api("/api/categories");
      const items = res.data;
      tbody.innerHTML = items.length
        ? items
            .map(
              (c) => `<tr>
          <td>${Utils.escapeHtml(c.name)}</td>
          <td>${Utils.escapeHtml(c.slug)}</td>
          <td>${c.video_count}</td>
          <td>
            <button class="icon-btn" data-edit-cat="${c.id}" data-name="${Utils.escapeHtml(c.name)}">Edit</button>
            <button class="icon-btn danger" data-delete-cat="${c.id}" data-name="${Utils.escapeHtml(c.name)}">Hapus</button>
          </td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="4">Belum ada kategori.</td></tr>`;

      tbody.querySelectorAll("[data-edit-cat]").forEach((btn) => btn.addEventListener("click", () => openCategoryModal(btn.dataset.editCat, btn.dataset.name)));
      tbody.querySelectorAll("[data-delete-cat]").forEach((btn) =>
        btn.addEventListener("click", () => confirmAction(`Hapus kategori "${btn.dataset.name}"? Video di kategori ini akan menjadi tanpa kategori.`, () => deleteCategory(btn.dataset.deleteCat)))
      );
    } catch {
      tbody.innerHTML = `<tr><td colspan="4">Gagal memuat kategori.</td></tr>`;
    }
  }

  async function deleteCategory(id) {
    try {
      await Utils.api(`/api/categories/${id}`, { method: "DELETE", needsCsrf: true });
      showToast("Kategori dihapus");
      loadCategoriesTable();
    } catch (err) {
      showToast(err.message || "Gagal menghapus kategori");
    }
  }

  // ---------- Category modal ----------
  const categoryModal = document.getElementById("categoryModal");
  const categoryForm = document.getElementById("categoryForm");
  const categoryFormError = document.getElementById("categoryFormError");

  document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryModal(null, ""));
  document.getElementById("categoryCancelBtn").addEventListener("click", () => categoryModal.classList.remove("show"));

  function openCategoryModal(id, name) {
    categoryFormError.style.display = "none";
    categoryForm.reset();
    document.getElementById("categoryId").value = id || "";
    document.getElementById("categoryModalTitle").textContent = id ? "Edit Kategori" : "Tambah Kategori";
    document.getElementById("categoryNameInput").value = name || "";
    categoryModal.classList.add("show");
  }

  categoryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    categoryFormError.style.display = "none";
    const id = document.getElementById("categoryId").value;
    const name = document.getElementById("categoryNameInput").value.trim();
    try {
      if (id) {
        await Utils.api(`/api/categories/${id}`, { method: "PUT", body: { name }, needsCsrf: true });
        showToast("Kategori diperbarui");
      } else {
        await Utils.api("/api/categories", { method: "POST", body: { name }, needsCsrf: true });
        showToast("Kategori ditambahkan");
      }
      categoryModal.classList.remove("show");
      loadCategoriesTable();
    } catch (err) {
      categoryFormError.textContent = err.message || "Gagal menyimpan kategori";
      categoryFormError.style.display = "block";
    }
  });

  // ---------- Generic confirm modal ----------
  const confirmModal = document.getElementById("confirmModal");
  const confirmMessage = document.getElementById("confirmMessage");
  let confirmCallback = null;

  function confirmAction(message, callback) {
    confirmMessage.textContent = message;
    confirmCallback = callback;
    confirmModal.classList.add("show");
  }
  document.getElementById("confirmCancelBtn").addEventListener("click", () => confirmModal.classList.remove("show"));
  document.getElementById("confirmOkBtn").addEventListener("click", () => {
    confirmModal.classList.remove("show");
    if (confirmCallback) confirmCallback();
  });

  // ---------- Init ----------
  guardAuth().then(() => activateTab("dashboard"));
})();
