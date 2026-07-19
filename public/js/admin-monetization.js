// public/js/admin-monetization.js
// Logic lengkap untuk tab "Monetization" (Adsterra Revenue Dashboard).
// Grafik dibuat murni pakai Canvas API bawaan browser (tanpa library chart).

(() => {
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit
  let refreshTimer = null;
  let lastData = null;

  function fmtMoney(n) {
    return "$" + (Number(n) || 0).toFixed(2);
  }
  function fmtNum(n) {
    return Math.round(Number(n) || 0).toLocaleString("id-ID");
  }
  function fmtPct(n) {
    return (Number(n) || 0).toFixed(2) + "%";
  }
  function fmtTime(isoOrSql) {
    if (!isoOrSql) return "-";
    try {
      const d = new Date(isoOrSql.replace(" ", "T") + (isoOrSql.includes("Z") ? "" : "Z"));
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "-";
    }
  }

  // ================= FETCH & ORCHESTRATION =================

  async function loadMonetizationData(showSkeleton) {
    const warningEl = document.getElementById("adsterraWarning");
    const lastUpdatedEl = document.getElementById("adsterraLastUpdated");
    if (!warningEl || !lastUpdatedEl) return; // elemen belum ada di halaman ini

    if (showSkeleton) {
      document.getElementById("adsterraCards").innerHTML = Array(4).fill('<div class="skeleton" style="height:90px;border-radius:12px;"></div>').join("");
    }

    try {
      const res = await Utils.api("/api/adsterra");
      lastData = res.data;

      if (res.warning) {
        warningEl.textContent = "⚠️ " + res.warning;
        warningEl.style.display = "block";
      } else {
        warningEl.style.display = "none";
      }

      const lastSyncTime = lastData.lastSync ? fmtTime(lastData.lastSync.synced_at) : "-";
      lastUpdatedEl.textContent = `Terakhir diperbarui: ${lastSyncTime}`;

      renderCards(lastData);
      renderCharts(lastData);
      renderTopCountries(lastData.byCountry);
      renderTopPlacement(lastData.byPlacement);
      renderRevenueFeed(lastData);
      renderComparison(lastData);
      renderPerformanceScore(lastData);
      renderPrediction(lastData);
      renderDashboardWidgets(lastData);
    } catch (err) {
      warningEl.textContent = `⚠️ Gagal memuat data: ${err.message || err}. ${lastData ? "Menampilkan data terakhir yang tersimpan." : ""}`;
      warningEl.style.display = "block";
      if (lastUpdatedEl) lastUpdatedEl.textContent = "Terakhir diperbarui: gagal sync";
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(() => loadMonetizationData(false), REFRESH_INTERVAL_MS);
  }
  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  // ================= CARDS =================

  function pctChange(today, yesterday) {
    if (!yesterday) return null;
    return ((today - yesterday) / yesterday) * 100;
  }

  function changeHtml(change) {
    if (change === null || !isFinite(change)) return '<span class="change" style="color:var(--text-dim);">-</span>';
    const up = change >= 0;
    return `<span class="change ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}%</span>`;
  }

  function getYesterdayRow(history) {
    if (!history || history.length < 2) return null;
    return history[history.length - 2];
  }

  function renderCards(data) {
    const container = document.getElementById("adsterraCards");
    const todayRow = data.today || {};
    const yesterday = getYesterdayRow(data.history);

    const cards = [
      { icon: "💰", label: "Revenue", value: fmtMoney(todayRow.revenue), change: yesterday ? pctChange(todayRow.revenue, yesterday.revenue) : null },
      { icon: "👁️", label: "Impressions", value: fmtNum(todayRow.impressions), change: yesterday ? pctChange(todayRow.impressions, yesterday.impressions) : null },
      { icon: "🖱️", label: "Clicks", value: fmtNum(todayRow.clicks), change: yesterday ? pctChange(todayRow.clicks, yesterday.clicks) : null },
      { icon: "📊", label: "CTR", value: fmtPct(todayRow.ctr), change: yesterday ? pctChange(todayRow.ctr, yesterday.ctr) : null },
      { icon: "💵", label: "CPM", value: fmtMoney(todayRow.cpm), change: yesterday ? pctChange(todayRow.cpm, yesterday.cpm) : null },
      { icon: "✅", label: "Fill Rate", value: fmtPct(todayRow.fill_rate), change: yesterday ? pctChange(todayRow.fill_rate, yesterday.fill_rate) : null },
      { icon: "📨", label: "Requests", value: fmtNum(todayRow.requests), change: yesterday ? pctChange(todayRow.requests, yesterday.requests) : null },
    ];

    container.innerHTML = cards
      .map(
        (c) => `<div class="adsterra-card">
      <div class="icon">${c.icon}</div>
      <div class="value">${c.value}</div>
      <div class="label">${c.label}</div>
      ${changeHtml(c.change)}
    </div>`
      )
      .join("");
  }

  // ================= CANVAS CHARTS (tanpa library) =================

  function drawLineChart(canvas, points, { color = "#ff3860", valueFormatter = (v) => v, labelFormatter = (i) => i } = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement.clientWidth || 300;
    const height = canvas.height || 180;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.scale(dpr, dpr);

    const padding = { top: 14, right: 12, bottom: 22, left: 12 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    function xAt(i) {
      return padding.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * chartW);
    }

    function render(hoverIndex) {
      ctx.clearRect(0, 0, width, height);

      if (!points.length) {
        ctx.fillStyle = "#9a9db0";
        ctx.font = "12px sans-serif";
        ctx.fillText("Belum ada data", padding.left, height / 2);
        return;
      }

      const values = points.map((p) => p.value);
      const maxV = Math.max(...values, 0.0001);
      const minV = Math.min(...values, 0);

      function yAt(v) {
        return padding.top + chartH - ((v - minV) / (maxV - minV || 1)) * chartH;
      }

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 3; g++) {
        const gy = padding.top + (chartH / 3) * g;
        ctx.beginPath();
        ctx.moveTo(padding.left, gy);
        ctx.lineTo(width - padding.right, gy);
        ctx.stroke();
      }

      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, color + "55");
      gradient.addColorStop(1, color + "00");
      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(values[0]));
      for (let i = 1; i < values.length; i++) ctx.lineTo(xAt(i), yAt(values[i]));
      ctx.lineTo(xAt(values.length - 1), padding.top + chartH);
      ctx.lineTo(xAt(0), padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(values[0]));
      for (let i = 1; i < values.length; i++) ctx.lineTo(xAt(i), yAt(values[i]));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();

      values.forEach((v, i) => {
        const isHover = i === hoverIndex;
        ctx.beginPath();
        ctx.arc(xAt(i), yAt(v), isHover ? 4 : 2, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? "#fff" : color;
        ctx.fill();
      });

      if (hoverIndex !== undefined && hoverIndex !== null && points[hoverIndex]) {
        const p = points[hoverIndex];
        const hx = xAt(hoverIndex);
        const hy = yAt(p.value);

        ctx.beginPath();
        ctx.moveTo(hx, padding.top);
        ctx.lineTo(hx, padding.top + chartH);
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.stroke();

        const label = `${labelFormatter(hoverIndex, p)}: ${valueFormatter(p.value)}`;
        ctx.font = "11px sans-serif";
        const textW = ctx.measureText(label).width + 14;
        let boxX = hx - textW / 2;
        boxX = Math.max(padding.left, Math.min(width - padding.right - textW, boxX));

        ctx.fillStyle = "#181a23";
        ctx.strokeStyle = "#262836";
        ctx.beginPath();
        ctx.roundRect(boxX, Math.max(2, hy - 28), textW, 20, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e9e9ef";
        ctx.fillText(label, boxX + 7, Math.max(16, hy - 14));
      }
    }

    render();

    canvas.onmousemove = (e) => {
      const rect2 = canvas.getBoundingClientRect();
      const mx = e.clientX - rect2.left;
      let closest = 0;
      let closestDist = Infinity;
      points.forEach((_, i) => {
        const dist = Math.abs(xAt(i) - mx);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      render(closest);
    };
    canvas.onmouseleave = () => render();
    canvas.ontouchstart = (e) => {
      const touch = e.touches[0];
      canvas.onmousemove({ clientX: touch.clientX });
    };
  }

  function renderCharts(data) {
    const todaySnapshots = data.todaySnapshots || [];
    const history = data.history || [];

    drawLineChart(
      document.getElementById("chartRevenue24h"),
      todaySnapshots.map((s) => ({ value: s.revenue, time: s.updated_at })),
      { color: "#ff3860", valueFormatter: fmtMoney, labelFormatter: (i, p) => fmtTime(p.time) }
    );

    const last7 = history.slice(-7);
    drawLineChart(
      document.getElementById("chartRevenue7d"),
      last7.map((h) => ({ value: h.revenue, date: h.date })),
      { color: "#ff3860", valueFormatter: fmtMoney, labelFormatter: (i, p) => p.date.slice(5) }
    );

    drawLineChart(
      document.getElementById("chartRevenue30d"),
      history.map((h) => ({ value: h.revenue, date: h.date })),
      { color: "#ff3860", valueFormatter: fmtMoney, labelFormatter: (i, p) => p.date.slice(5) }
    );

    drawLineChart(
      document.getElementById("chartImpression"),
      history.map((h) => ({ value: h.impressions, date: h.date })),
      { color: "#3b82f6", valueFormatter: fmtNum, labelFormatter: (i, p) => p.date.slice(5) }
    );

    drawLineChart(
      document.getElementById("chartCtr"),
      history.map((h) => ({ value: h.ctr, date: h.date })),
      { color: "#2ecc71", valueFormatter: fmtPct, labelFormatter: (i, p) => p.date.slice(5) }
    );

    drawLineChart(
      document.getElementById("chartCpm"),
      history.map((h) => ({ value: h.cpm, date: h.date })),
      { color: "#f1c40f", valueFormatter: fmtMoney, labelFormatter: (i, p) => p.date.slice(5) }
    );
  }

  // ================= TOP COUNTRIES / PLACEMENT =================

  function renderTopCountries(rows) {
    const tbody = document.getElementById("topCountriesBody");
    if (!tbody) return;
    const sorted = [...(rows || [])].sort((a, b) => b.revenue - a.revenue);
    tbody.innerHTML = sorted.length
      ? sorted.map((r) => `<tr><td>${Utils.escapeHtml(r.country || "-")}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtPct(r.ctr)}</td></tr>`).join("")
      : `<tr><td colspan="4">Belum ada data.</td></tr>`;
  }

  function renderTopPlacement(rows) {
    const tbody = document.getElementById("topPlacementBody");
    if (!tbody) return;
    const sorted = [...(rows || [])].sort((a, b) => b.revenue - a.revenue);
    tbody.innerHTML = sorted.length
      ? sorted.map((r) => `<tr><td>${Utils.escapeHtml(r.placement || "-")}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtPct(r.ctr)}</td><td>${fmtMoney(r.cpm)}</td></tr>`).join("")
      : `<tr><td colspan="4">Belum ada data.</td></tr>`;
  }

  // ================= REVENUE FEED =================

  function renderRevenueFeed(data) {
    const container = document.getElementById("revenueFeed");
    if (!container) return;
    const snapshots = data.todaySnapshots || [];

    if (snapshots.length < 2) {
      container.innerHTML = `<div style="color:var(--text-dim);font-size:0.82rem;">Belum cukup data untuk feed. Data akan muncul seiring berjalannya waktu.</div>`;
      return;
    }

    const items = [];
    for (let i = snapshots.length - 1; i > 0; i--) {
      const delta = snapshots[i].revenue - snapshots[i - 1].revenue;
      if (delta > 0) {
        items.push({ time: snapshots[i].updated_at, amount: delta });
      }
      if (items.length >= 15) break;
    }

    container.innerHTML = items.length
      ? items
          .map(
            (it) => `<div class="feed-item">
        <span class="feed-time">${fmtTime(it.time)}</span>
        <span class="feed-amount">+${fmtMoney(it.amount)}</span>
        <span class="feed-country">Update pendapatan</span>
      </div>`
          )
          .join("")
      : `<div style="color:var(--text-dim);font-size:0.82rem;">Belum ada perubahan revenue tercatat hari ini.</div>`;
  }

  // ================= COMPARISON =================

  function sumRange(history, start, end) {
    return history.slice(start, end).reduce((sum, h) => sum + h.revenue, 0);
  }

  function renderComparison(data) {
    const container = document.getElementById("comparisonGrid");
    if (!container) return;
    const history = data.history || [];
    const today = data.today ? data.today.revenue : 0;
    const yesterday = getYesterdayRow(history);
    const yesterdayRevenue = yesterday ? yesterday.revenue : 0;

    const last7 = sumRange(history, Math.max(0, history.length - 7), history.length);
    const prior7 = sumRange(history, Math.max(0, history.length - 14), Math.max(0, history.length - 7));

    const last30 = sumRange(history, 0, history.length);
    const prior30 = 0; // Data histori baru mulai terkumpul sejak fitur ini aktif, belum ada data bulan sebelumnya

    const rows = [
      { label: "Hari ini vs Kemarin", a: today, b: yesterdayRevenue },
      { label: "7 Hari vs Minggu Lalu", a: last7, b: prior7 },
      { label: "30 Hari vs Bulan Lalu", a: last30, b: prior30 },
    ];

    container.innerHTML = rows
      .map((r) => {
        const change = pctChange(r.a, r.b);
        return `<div class="stat-card">
        <div class="num">${fmtMoney(r.a)}</div>
        <div class="label">${r.label}</div>
        ${changeHtml(change)}
      </div>`;
      })
      .join("");
  }

  // ================= PERFORMANCE SCORE =================
  // Catatan: skor ini adalah heuristik ilustratif (bukan skor resmi dari Adsterra),
  // dihitung dari perbandingan sederhana terhadap ambang batas yang wajar.

  function scoreFor(value, target) {
    return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
  }

  function renderPerformanceScore(data) {
    const container = document.getElementById("performanceScoreList");
    if (!container) return;
    const today = data.today || {};
    const history = data.history || [];
    const avgRevenue = history.length ? history.reduce((s, h) => s + h.revenue, 0) / history.length : 1;

    const metrics = [
      { label: "Revenue", score: scoreFor(today.revenue, Math.max(avgRevenue, 0.01) * 1.2) },
      { label: "CTR", score: scoreFor(today.ctr, 2) },
      { label: "CPM", score: scoreFor(today.cpm, 3) },
      { label: "Fill Rate", score: scoreFor(today.fill_rate, 95) },
    ];

    container.innerHTML = metrics
      .map(
        (m) => `<div class="perf-score-row">
      <div class="perf-label"><span>${m.label}</span><span>${m.score}%</span></div>
      <div class="perf-score-bar-bg"><div class="perf-score-bar-fill" style="width:${m.score}%;"></div></div>
    </div>`
      )
      .join("");
  }

  // ================= REVENUE PREDICTION =================

  function renderPrediction(data) {
    const container = document.getElementById("predictionGrid");
    if (!container) return;
    const history = data.history || [];
    const today = data.today ? data.today.revenue : 0;

    const avgDaily = history.length ? history.reduce((s, h) => s + h.revenue, 0) / history.length : 0;

    const now = new Date();
    const hourFraction = Math.max(now.getUTCHours() / 24, 0.05);
    const estToday = today / hourFraction;
    const estWeek = avgDaily * 7;
    const estMonth = avgDaily * 30;

    const items = [
      { label: "Estimasi Hari Ini", value: estToday },
      { label: "Estimasi Minggu Ini", value: estWeek },
      { label: "Estimasi Bulan Ini", value: estMonth },
    ];

    container.innerHTML = items.map((it) => `<div class="stat-card"><div class="num">${fmtMoney(it.value)}</div><div class="label">${it.label}</div></div>`).join("");
  }

  // ================= WIDGET DI DASHBOARD UTAMA =================

  function renderDashboardWidgets(data) {
    const revenueTodayEl = document.getElementById("widgetRevenueToday");
    if (!revenueTodayEl) return;

    const today = data.today || {};
    const history = data.history || [];
    const avgDaily = history.length ? history.reduce((s, h) => s + h.revenue, 0) / history.length : 0;

    document.getElementById("widgetRevenueToday").textContent = fmtMoney(today.revenue);
    document.getElementById("widgetEstMonth").textContent = fmtMoney(avgDaily * 30);
    document.getElementById("widgetCtr").textContent = fmtPct(today.ctr);
    document.getElementById("widgetCpm").textContent = fmtMoney(today.cpm);
    document.getElementById("widgetImpressions").textContent = fmtNum(today.impressions);
  }

  // ================= PUBLIC API (dipanggil dari admin-dashboard.js) =================

  window.AdminMonetization = {
    load: (showSkeleton) => loadMonetizationData(showSkeleton),
    startAutoRefresh,
    stopAutoRefresh,
    loadWidgetsOnly: () => {
      if (lastData) renderDashboardWidgets(lastData);
      else loadMonetizationData(false);
    },
  };

  document.getElementById("adsterraRefreshBtn")?.addEventListener("click", () => loadMonetizationData(true));
})();
