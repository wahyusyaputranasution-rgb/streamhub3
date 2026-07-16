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
      currentAdminUsername = res.data.username;
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
    iklan: document.getElementById("tab-iklan"),
    sponsor: document.getElementById("tab-sponsor"),
    pengaturan: document.getElementById("tab-pengaturan"),
  };
  const topbarTitle = document.getElementById("topbarTitle");
  const titles = { dashboard: "Dashboard", video: "Kelola Video", kategori: "Kelola Kategori", iklan: "Kelola Iklan", sponsor: "Iklan Sponsor", pengaturan: "Pengaturan" };

  function activateTab(tab) {
    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].style.display = key === tab ? "" : "none";
    });
    topbarTitle.textContent = titles[tab] || "Dashboard";
    document.querySelectorAll(".admin-nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    document.querySelectorAll("#mobileTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "dashboard") {
      loadStats();
      startDeviceStatsPolling();
    } else {
      stopDeviceStatsPolling();
    }
    if (tab === "video") loadVideosTable();
    if (tab === "kategori") loadCategoriesTable();
    if (tab === "iklan") loadAdsTable();
    if (tab === "sponsor") loadSponsorsTable();
    if (tab === "pengaturan") {
      loadAdminsTable();
      loadSiteSettings();
    }
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

  // ---------- Pengaturan Website (Customer Service, dll) ----------
  const siteSettingsForm = document.getElementById("siteSettingsForm");
  const siteSettingsError = document.getElementById("siteSettingsError");

  async function loadSiteSettings() {
    try {
      const res = await Utils.api("/api/settings");
      const s = res.data;
      document.getElementById("csEnabledInput").checked = s.cs_enabled === "1";
      document.getElementById("csLinkInput").value = s.cs_link || "";
      document.getElementById("csLabelInput").value = s.cs_label || "";
      document.getElementById("telegramEnabledInput").checked = s.telegram_enabled === "1";
      document.getElementById("telegramBotTokenInput").value = s.telegram_bot_token || "";
      document.getElementById("telegramChatIdInput").value = s.telegram_chat_id || "";
    } catch {
      // Diamkan, form tetap kosong kalau gagal
    }
  }

  siteSettingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    siteSettingsError.style.display = "none";
    const settings = {
      cs_enabled: document.getElementById("csEnabledInput").checked ? "1" : "0",
      cs_link: document.getElementById("csLinkInput").value.trim(),
      cs_label: document.getElementById("csLabelInput").value.trim(),
    };
    try {
      await Utils.api("/api/settings", { method: "PUT", body: { settings }, needsCsrf: true });
      showToast("Pengaturan disimpan");
    } catch (err) {
      siteSettingsError.textContent = err.message || "Gagal menyimpan pengaturan";
      siteSettingsError.style.display = "block";
    }
  });

  // ---------- Integrasi Telegram ----------
  const telegramSettingsForm = document.getElementById("telegramSettingsForm");
  const telegramFormError = document.getElementById("telegramFormError");

  telegramSettingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    telegramFormError.style.display = "none";
    const settings = {
      telegram_enabled: document.getElementById("telegramEnabledInput").checked ? "1" : "0",
      telegram_bot_token: document.getElementById("telegramBotTokenInput").value.trim(),
      telegram_chat_id: document.getElementById("telegramChatIdInput").value.trim(),
    };
    try {
      await Utils.api("/api/settings", { method: "PUT", body: { settings }, needsCsrf: true });
      showToast("Pengaturan Telegram disimpan");
    } catch (err) {
      telegramFormError.textContent = err.message || "Gagal menyimpan pengaturan";
      telegramFormError.style.display = "block";
    }
  });

  // ---------- Auto-Publish manual trigger ----------
  const autoPublishResult = document.getElementById("autoPublishResult");
  document.getElementById("runAutoPublishBtn").addEventListener("click", async () => {
    autoPublishResult.textContent = "Memeriksa video draft...";
    try {
      const res = await Utils.api("/api/automation/run-now", { method: "POST", needsCsrf: true });
      autoPublishResult.textContent = `${res.data.published} video berhasil dipublish otomatis.`;
      if (res.data.published > 0) loadVideosTable();
    } catch (err) {
      autoPublishResult.textContent = err.message || "Gagal menjalankan auto-publish";
    }
  });

  // ---------- Kirim Push Notification ----------
  const pushForm = document.getElementById("pushForm");
  const pushFormError = document.getElementById("pushFormError");
  const pushResult = document.getElementById("pushResult");

  pushForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    pushFormError.style.display = "none";
    pushResult.textContent = "Mengirim...";

    const title = document.getElementById("pushTitleInput").value.trim();
    const body = document.getElementById("pushBodyInput").value.trim();
    const url = document.getElementById("pushUrlInput").value.trim() || "/";

    try {
      const res = await Utils.api("/api/push/send", { method: "POST", body: { title, body, url }, needsCsrf: true });
      pushResult.textContent = `Terkirim ke ${res.data.sent} dari ${res.data.total} pengunjung (${res.data.failed} gagal).`;
      showToast("Notifikasi terkirim");
      pushForm.reset();
    } catch (err) {
      pushResult.textContent = "";
      pushFormError.textContent = err.message || "Gagal mengirim notifikasi";
      pushFormError.style.display = "block";
    }
  });

  // ---------- Ganti Password ----------
  const changePasswordForm = document.getElementById("changePasswordForm");
  const passwordFormError = document.getElementById("passwordFormError");

  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    passwordFormError.style.display = "none";
    const currentPassword = document.getElementById("currentPasswordInput").value;
    const newPassword = document.getElementById("newPasswordInput").value;

    try {
      await Utils.api("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword }, needsCsrf: true });
      showToast("Password berhasil diubah");
      changePasswordForm.reset();
    } catch (err) {
      passwordFormError.textContent = err.message || "Gagal mengubah password";
      passwordFormError.style.display = "block";
    }
  });

  // ---------- Kelola Admin ----------
  let currentAdminUsername = "";

  async function loadAdminsTable() {
    const tbody = document.getElementById("adminsBody");
    tbody.innerHTML = `<tr><td colspan="3">Memuat...</td></tr>`;
    try {
      const res = await Utils.api("/api/admins");
      const items = res.data;
      tbody.innerHTML = items
        .map(
          (a) => `<tr>
        <td>${Utils.escapeHtml(a.username)}${a.username === currentAdminUsername ? ' <span class="badge published">Anda</span>' : ""}</td>
        <td>${Utils.formatDate(a.created_at)}</td>
        <td>${
          a.username === currentAdminUsername
            ? '<span style="color:var(--text-dim);font-size:0.8rem;">-</span>'
            : `<button class="icon-btn danger" data-delete-admin="${a.id}" data-username="${Utils.escapeHtml(a.username)}">Hapus</button>`
        }</td>
      </tr>`
        )
        .join("");

      tbody.querySelectorAll("[data-delete-admin]").forEach((btn) =>
        btn.addEventListener("click", () => confirmAction(`Hapus admin "${btn.dataset.username}"?`, () => deleteAdmin(btn.dataset.deleteAdmin)))
      );
    } catch {
      tbody.innerHTML = `<tr><td colspan="3">Gagal memuat data admin.</td></tr>`;
    }
  }

  async function deleteAdmin(id) {
    try {
      await Utils.api(`/api/admins/${id}`, { method: "DELETE", needsCsrf: true });
      showToast("Admin dihapus");
      loadAdminsTable();
    } catch (err) {
      showToast(err.message || "Gagal menghapus admin");
    }
  }

  const addAdminModal = document.getElementById("addAdminModal");
  const addAdminForm = document.getElementById("addAdminForm");
  const addAdminFormError = document.getElementById("addAdminFormError");

  document.getElementById("addAdminBtn").addEventListener("click", () => {
    addAdminFormError.style.display = "none";
    addAdminForm.reset();
    addAdminModal.classList.add("show");
  });
  document.getElementById("addAdminCancelBtn").addEventListener("click", () => addAdminModal.classList.remove("show"));

  addAdminForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addAdminFormError.style.display = "none";
    const username = document.getElementById("newAdminUsername").value.trim();
    const password = document.getElementById("newAdminPassword").value;
    try {
      await Utils.api("/api/admins", { method: "POST", body: { username, password }, needsCsrf: true });
      showToast("Admin baru ditambahkan");
      addAdminModal.classList.remove("show");
      loadAdminsTable();
    } catch (err) {
      addAdminFormError.textContent = err.message || "Gagal menambah admin";
      addAdminFormError.style.display = "block";
    }
  });

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
    loadDeviceStats();
  }

  let deviceStatsInterval = null;

  async function loadDeviceStats() {
    try {
      const res = await Utils.api("/api/track/stats");
      const s = res.data;
      document.getElementById("statTotalDevices").textContent = s.totalDevices;
      document.getElementById("statInstalled").textContent = s.totalInstalled;
      document.getElementById("statOnline").textContent = s.onlineCount;
      document.getElementById("statOffline").textContent = s.offlineCount;
    } catch {
      // Diamkan saja bila gagal, tidak mengganggu statistik utama
    }
  }

  function startDeviceStatsPolling() {
    stopDeviceStatsPolling();
    deviceStatsInterval = setInterval(loadDeviceStats, 10000);
  }
  function stopDeviceStatsPolling() {
    if (deviceStatsInterval) clearInterval(deviceStatsInterval);
    deviceStatsInterval = null;
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

  // ---------- Upload thumbnail (kompresi otomatis di HP sebelum dikirim) ----------
  const thumbFileInput = document.getElementById("thumbFileInput");
  const thumbUploadStatus = document.getElementById("thumbUploadStatus");
  const thumbPreview = document.getElementById("thumbPreview");

  function compressImage(file, maxWidth = 640, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  thumbFileInput.addEventListener("change", async () => {
    const file = thumbFileInput.files[0];
    if (!file) return;

    thumbUploadStatus.textContent = "Mengompres & mengupload...";
    try {
      const dataUrl = await compressImage(file);
      const [meta, base64Data] = dataUrl.split(",");
      const contentType = meta.match(/data:(.*);base64/)[1];

      const res = await Utils.api("/api/uploads", {
        method: "POST",
        needsCsrf: true,
        body: { contentType, data: base64Data },
      });

      document.getElementById("videoThumbInput").value = res.data.url;
      thumbPreview.src = res.data.url;
      thumbPreview.style.display = "block";
      thumbUploadStatus.textContent = "Berhasil diupload ✓";
    } catch (err) {
      thumbUploadStatus.textContent = err.message || "Gagal upload gambar";
    }
  });

  async function openVideoModal(id) {
    videoFormError.style.display = "none";
    videoForm.reset();
    document.getElementById("videoId").value = id || "";
    document.getElementById("videoModalTitle").textContent = id ? "Edit Video" : "Tambah Video";
    thumbUploadStatus.textContent = "";
    thumbPreview.style.display = "none";
    thumbFileInput.value = "";

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
        if (v.thumbnail_url) {
          thumbPreview.src = v.thumbnail_url;
          thumbPreview.style.display = "block";
        }
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

  // ---------- Import CSV ----------
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char === "\r") {
        // lewati
      } else {
        field += char;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  }

  const csvModal = document.getElementById("csvModal");
  const csvFormError = document.getElementById("csvFormError");
  const csvProgress = document.getElementById("csvProgress");

  document.getElementById("importCsvBtn").addEventListener("click", () => {
    csvFormError.style.display = "none";
    csvProgress.textContent = "";
    document.getElementById("csvFileInput").value = "";
    document.getElementById("csvTextInput").value = "";
    csvModal.classList.add("show");
  });
  document.getElementById("csvCancelBtn").addEventListener("click", () => csvModal.classList.remove("show"));

  document.getElementById("csvImportBtn").addEventListener("click", async () => {
    csvFormError.style.display = "none";
    csvProgress.textContent = "";

    const fileInput = document.getElementById("csvFileInput");
    let text = document.getElementById("csvTextInput").value.trim();

    if (fileInput.files && fileInput.files[0]) {
      text = (await fileInput.files[0].text()).trim();
    }
    if (!text) {
      csvFormError.textContent = "Pilih file CSV atau paste isinya dulu.";
      csvFormError.style.display = "block";
      return;
    }

    const rows = parseCsv(text);
    if (rows.length < 2) {
      csvFormError.textContent = "CSV kosong atau tidak ada baris data (butuh minimal 1 baris header + 1 baris data).";
      csvFormError.style.display = "block";
      return;
    }

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const dataRows = rows.slice(1);

    await refreshCategoriesCache();
    const categoryMap = {};
    categoriesCache.forEach((c) => (categoryMap[c.name.toLowerCase()] = c.id));

    let success = 0;
    let failed = 0;

    for (let i = 0; i < dataRows.length; i++) {
      csvProgress.textContent = `Memproses ${i + 1} dari ${dataRows.length}... (${success} berhasil, ${failed} gagal)`;
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = (dataRows[i][idx] || "").trim()));

      if (!obj.title || !obj.embed_url) {
        failed++;
        continue;
      }

      let categoryId = null;
      if (obj.category_name) {
        const key = obj.category_name.toLowerCase();
        if (categoryMap[key]) {
          categoryId = categoryMap[key];
        } else {
          try {
            const catRes = await Utils.api("/api/categories", { method: "POST", body: { name: obj.category_name }, needsCsrf: true });
            categoryId = catRes.data.id;
            categoryMap[key] = categoryId;
          } catch {
            categoryId = null;
          }
        }
      }

      try {
        await Utils.api("/api/videos", {
          method: "POST",
          needsCsrf: true,
          body: {
            title: obj.title,
            description: obj.description || "",
            categoryId,
            embedUrl: obj.embed_url,
            thumbnailUrl: obj.thumbnail_url || "",
            status: obj.status === "published" ? "published" : "draft",
            publishDate: obj.publish_date || null,
          },
        });
        success++;
      } catch {
        failed++;
      }
    }

    csvProgress.textContent = `Selesai: ${success} berhasil, ${failed} gagal.`;
    if (success > 0) loadVideosTable();
  });

  // ---------- Sponsor Ads ----------
  function formatDateOnly(iso) {
    if (!iso) return "-";
    return iso.slice(0, 10);
  }

  function sponsorStatusBadge(ad) {
    const today = new Date().toISOString().slice(0, 10);
    if (today < ad.start_date) return '<span class="badge draft">Terjadwal</span>';
    if (today > ad.end_date) return '<span class="badge draft">Kedaluwarsa</span>';
    return '<span class="badge published">Aktif</span>';
  }

  async function loadSponsorsTable() {
    const tbody = document.getElementById("sponsorsBody");
    tbody.innerHTML = `<tr><td colspan="5">Memuat...</td></tr>`;
    try {
      const res = await Utils.api("/api/sponsor-ads");
      const items = res.data;
      tbody.innerHTML = items.length
        ? items
            .map(
              (s) => `<tr>
          <td class="title-cell">${Utils.escapeHtml(s.name)}</td>
          <td class="title-cell">${Utils.escapeHtml(s.title)}</td>
          <td>${formatDateOnly(s.start_date)} s/d ${formatDateOnly(s.end_date)}</td>
          <td>${sponsorStatusBadge(s)}</td>
          <td>
            <button class="icon-btn" data-edit-sponsor="${s.id}">Edit</button>
            <button class="icon-btn danger" data-delete-sponsor="${s.id}" data-name="${Utils.escapeHtml(s.name)}">Hapus</button>
          </td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="5">Belum ada sponsor. Klik "+ Tambah Sponsor" untuk mulai.</td></tr>`;

      tbody.querySelectorAll("[data-edit-sponsor]").forEach((btn) => btn.addEventListener("click", () => openSponsorModal(btn.dataset.editSponsor)));
      tbody.querySelectorAll("[data-delete-sponsor]").forEach((btn) =>
        btn.addEventListener("click", () => confirmAction(`Hapus sponsor "${btn.dataset.name}"?`, () => deleteSponsor(btn.dataset.deleteSponsor)))
      );
    } catch {
      tbody.innerHTML = `<tr><td colspan="5">Gagal memuat data sponsor.</td></tr>`;
    }
  }

  async function deleteSponsor(id) {
    try {
      await Utils.api(`/api/sponsor-ads/${id}`, { method: "DELETE", needsCsrf: true });
      showToast("Sponsor dihapus");
      loadSponsorsTable();
    } catch (err) {
      showToast(err.message || "Gagal menghapus sponsor");
    }
  }

  const sponsorModal = document.getElementById("sponsorModal");
  const sponsorForm = document.getElementById("sponsorForm");
  const sponsorFormError = document.getElementById("sponsorFormError");
  const sponsorFileInput = document.getElementById("sponsorFileInput");
  const sponsorUploadStatus = document.getElementById("sponsorUploadStatus");
  const sponsorPreview = document.getElementById("sponsorPreview");

  document.getElementById("addSponsorBtn").addEventListener("click", () => openSponsorModal(null));
  document.getElementById("sponsorCancelBtn").addEventListener("click", () => sponsorModal.classList.remove("show"));

  sponsorFileInput.addEventListener("change", async () => {
    const file = sponsorFileInput.files[0];
    if (!file) return;
    sponsorUploadStatus.textContent = "Mengompres & mengupload...";
    try {
      const dataUrl = await compressImage(file);
      const [meta, base64Data] = dataUrl.split(",");
      const contentType = meta.match(/data:(.*);base64/)[1];
      const res = await Utils.api("/api/uploads", { method: "POST", needsCsrf: true, body: { contentType, data: base64Data } });
      document.getElementById("sponsorImageInput").value = res.data.url;
      sponsorPreview.src = res.data.url;
      sponsorPreview.style.display = "block";
      sponsorUploadStatus.textContent = "Berhasil diupload ✓";
    } catch (err) {
      sponsorUploadStatus.textContent = err.message || "Gagal upload gambar";
    }
  });

  async function openSponsorModal(id) {
    sponsorFormError.style.display = "none";
    sponsorForm.reset();
    document.getElementById("sponsorId").value = id || "";
    document.getElementById("sponsorModalTitle").textContent = id ? "Edit Sponsor" : "Tambah Sponsor";
    sponsorUploadStatus.textContent = "";
    sponsorPreview.style.display = "none";
    sponsorFileInput.value = "";

    if (id) {
      try {
        const res = await Utils.api("/api/sponsor-ads");
        const s = (res.data || []).find((item) => String(item.id) === String(id));
        if (!s) throw new Error("Sponsor tidak ditemukan");
        document.getElementById("sponsorNameInput").value = s.name;
        document.getElementById("sponsorTitleInput").value = s.title;
        document.getElementById("sponsorImageInput").value = s.image_url;
        document.getElementById("sponsorLinkInput").value = s.link_url;
        document.getElementById("sponsorStartInput").value = formatDateOnly(s.start_date);
        document.getElementById("sponsorEndInput").value = formatDateOnly(s.end_date);
        sponsorPreview.src = s.image_url;
        sponsorPreview.style.display = "block";
      } catch (err) {
        showToast("Gagal memuat data sponsor");
        return;
      }
    }
    sponsorModal.classList.add("show");
  }

  sponsorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    sponsorFormError.style.display = "none";
    const id = document.getElementById("sponsorId").value;
    const payload = {
      name: document.getElementById("sponsorNameInput").value.trim(),
      title: document.getElementById("sponsorTitleInput").value.trim(),
      imageUrl: document.getElementById("sponsorImageInput").value.trim(),
      linkUrl: document.getElementById("sponsorLinkInput").value.trim(),
      startDate: document.getElementById("sponsorStartInput").value,
      endDate: document.getElementById("sponsorEndInput").value,
    };

    try {
      if (id) {
        await Utils.api(`/api/sponsor-ads/${id}`, { method: "PUT", body: payload, needsCsrf: true });
        showToast("Sponsor diperbarui");
      } else {
        await Utils.api("/api/sponsor-ads", { method: "POST", body: payload, needsCsrf: true });
        showToast("Sponsor ditambahkan");
      }
      sponsorModal.classList.remove("show");
      loadSponsorsTable();
    } catch (err) {
      sponsorFormError.textContent = err.message || "Gagal menyimpan sponsor";
      sponsorFormError.style.display = "block";
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

  // ---------- Ads table ----------
  const PLACEMENT_LABELS = {
    global: "Global (semua halaman)",
    home_top: "Home - atas",
    home_grid: "Home - tengah",
    watch_below_player: "Watch - bawah player",
    watch_sidebar: "Watch - sidebar",
    category_top: "Kategori - atas (banner)",
    category_click: "Kategori - Smartlink saat diklik",
    search_top: "Search - atas",
  };

  async function loadAdsTable() {
    const tbody = document.getElementById("adsBody");
    tbody.innerHTML = `<tr><td colspan="5">Memuat...</td></tr>`;
    try {
      const res = await Utils.api("/api/ads?admin=1");
      const items = res.data;
      tbody.innerHTML = items.length
        ? items
            .map(
              (a) => `<tr>
          <td class="title-cell">${Utils.escapeHtml(a.name)}</td>
          <td>${Utils.escapeHtml(PLACEMENT_LABELS[a.placement] || a.placement)}</td>
          <td>${(a.impressions || 0).toLocaleString("id-ID")}</td>
          <td>${a.enabled ? '<span class="badge published">Aktif</span>' : '<span class="badge draft">Nonaktif</span>'}</td>
          <td>
            <button class="icon-btn" data-edit-ad="${a.id}">Edit</button>
            <button class="icon-btn danger" data-delete-ad="${a.id}" data-name="${Utils.escapeHtml(a.name)}">Hapus</button>
          </td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="5">Belum ada zona iklan. Klik "+ Tambah Zona Iklan" untuk mulai.</td></tr>`;

      tbody.querySelectorAll("[data-edit-ad]").forEach((btn) => btn.addEventListener("click", () => openAdModal(btn.dataset.editAd)));
      tbody.querySelectorAll("[data-delete-ad]").forEach((btn) =>
        btn.addEventListener("click", () => confirmAction(`Hapus zona iklan "${btn.dataset.name}"?`, () => deleteAd(btn.dataset.deleteAd)))
      );
    } catch {
      tbody.innerHTML = `<tr><td colspan="5">Gagal memuat data iklan.</td></tr>`;
    }
  }

  async function deleteAd(id) {
    try {
      await Utils.api(`/api/ads/${id}`, { method: "DELETE", needsCsrf: true });
      showToast("Zona iklan dihapus");
      loadAdsTable();
    } catch (err) {
      showToast(err.message || "Gagal menghapus zona iklan");
    }
  }

  // ---------- Ad modal ----------
  const adModal = document.getElementById("adModal");
  const adForm = document.getElementById("adForm");
  const adFormError = document.getElementById("adFormError");

  document.getElementById("addAdBtn").addEventListener("click", () => openAdModal(null));
  document.getElementById("adCancelBtn").addEventListener("click", () => adModal.classList.remove("show"));

  async function openAdModal(id) {
    adFormError.style.display = "none";
    adForm.reset();
    document.getElementById("adId").value = id || "";
    document.getElementById("adModalTitle").textContent = id ? "Edit Zona Iklan" : "Tambah Zona Iklan";
    document.getElementById("adEnabledInput").checked = true;

    if (id) {
      try {
        const res = await Utils.api("/api/ads?admin=1");
        const ad = (res.data || []).find((a) => String(a.id) === String(id));
        if (!ad) throw new Error("Zona iklan tidak ditemukan");
        document.getElementById("adNameInput").value = ad.name;
        document.getElementById("adPlacementSelect").value = ad.placement;
        document.getElementById("adCodeInput").value = ad.code;
        document.getElementById("adEnabledInput").checked = !!ad.enabled;
      } catch (err) {
        showToast("Gagal memuat data iklan");
        return;
      }
    }
    adModal.classList.add("show");
  }

  adForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    adFormError.style.display = "none";
    const id = document.getElementById("adId").value;
    const payload = {
      name: document.getElementById("adNameInput").value.trim(),
      placement: document.getElementById("adPlacementSelect").value,
      code: document.getElementById("adCodeInput").value.trim(),
      enabled: document.getElementById("adEnabledInput").checked,
    };

    try {
      if (id) {
        await Utils.api(`/api/ads/${id}`, { method: "PUT", body: payload, needsCsrf: true });
        showToast("Zona iklan diperbarui");
      } else {
        await Utils.api("/api/ads", { method: "POST", body: payload, needsCsrf: true });
        showToast("Zona iklan ditambahkan");
      }
      adModal.classList.remove("show");
      loadAdsTable();
    } catch (err) {
      adFormError.textContent = err.message || "Gagal menyimpan zona iklan";
      adFormError.style.display = "block";
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
