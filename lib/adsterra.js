// lib/adsterra.js
// Integrasi Adsterra Publisher API (https://api3.adsterratools.com/publisher/).
// Semua request ke Adsterra HANYA dilakukan di sini (server-side/Worker),
// API key tidak pernah dikirim ke browser.
//
// CATATAN PENTING soal nama field response Adsterra:
// Dokumentasi publik Adsterra tidak mempublikasikan contoh body JSON secara
// lengkap. Kode di bawah menebak beberapa kemungkinan nama field (mis. "revenue"
// vs "cost", "impression" vs "impressions") secara defensif. Response ASLI dari
// API selalu disimpan mentah di kolom `json_response` tabel adsterra_stats —
// kalau angka yang tampil di dashboard terlihat aneh/nol, buka isi
// `json_response` lewat D1 Console untuk lihat nama field sebenarnya, lalu
// sesuaikan fungsi `parseStatRow` di bawah ini.

const ADSTERRA_BASE = "https://api3.adsterratools.com/publisher";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Parsing defensif satu baris data dari response Adsterra (lihat catatan di atas). */
function parseStatRow(row) {
  const impressions = toNumber(row.impression ?? row.impressions ?? row.views ?? 0);
  const clicks = toNumber(row.click ?? row.clicks ?? 0);
  const revenue = toNumber(row.revenue ?? row.cost ?? row.income ?? row.earning ?? 0);
  const requests = toNumber(row.request ?? row.requests ?? impressions);
  const ctr = row.ctr !== undefined ? toNumber(row.ctr) : impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = row.cpm !== undefined ? toNumber(row.cpm) : impressions > 0 ? (revenue / impressions) * 1000 : 0;
  const fillRate = row.fill_rate !== undefined ? toNumber(row.fill_rate) : requests > 0 ? (impressions / requests) * 100 : 0;

  return {
    date: row.date || row.day || todayStr(),
    country: row.country || row.country_name || null,
    placement: row.placement || row.placement_name || row.ad_type || null,
    revenue,
    impressions,
    clicks,
    ctr,
    cpm,
    requests,
    fillRate,
  };
}

async function callAdsterraApi(env, params) {
  if (!env.ADSTERRA_API_KEY) {
    throw new Error("ADSTERRA_API_KEY belum diatur di Cloudflare Secret");
  }
  const query = new URLSearchParams(params);
  if (env.ADSTERRA_DOMAIN_ID) query.set("domain", env.ADSTERRA_DOMAIN_ID);

  const url = `${ADSTERRA_BASE}/stats.json?${query.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "X-API-Key": env.ADSTERRA_API_KEY },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Response Adsterra bukan JSON valid (status ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`Adsterra API error (status ${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

/** Ambil array baris data dari berbagai kemungkinan bentuk response Adsterra. */
function extractItems(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.result)) return json.result;
  return [];
}

async function logSync(env, { responseTimeMs, status, errorMessage }) {
  try {
    await env.DB
      .prepare("INSERT INTO adsterra_sync_log (response_time_ms, status, error_message) VALUES (?, ?, ?)")
      .bind(responseTimeMs || null, status, errorMessage || null)
      .run();
  } catch {
    // Jangan sampai kegagalan logging mengganggu proses utama
  }
}

/** Cek apakah cache hari ini masih berlaku (snapshot terakhir < 5 menit lalu). */
export async function isCacheValid(env) {
  const row = await env.DB
    .prepare("SELECT updated_at FROM adsterra_stats WHERE date = ? ORDER BY id DESC LIMIT 1")
    .bind(todayStr())
    .first();
  if (!row) return false;
  const age = Date.now() - new Date(row.updated_at.replace(" ", "T") + "Z").getTime();
  return age < CACHE_TTL_MS;
}

/**
 * Sinkronisasi penuh ke Adsterra API: ambil 30 hari overall (untuk grafik),
 * ambil breakdown negara & placement untuk hari ini (untuk Top Countries/Placement),
 * simpan semua ke D1, dan catat log sync.
 */
export async function syncAdsterraData(env) {
  const startedAt = Date.now();
  try {
    const today = todayStr();
    const start30 = daysAgoStr(29);

    const [overallJson, countryJson, placementJson] = await Promise.all([
      callAdsterraApi(env, { start_date: start30, finish_date: today, group_by: "date" }),
      callAdsterraApi(env, { start_date: today, finish_date: today, group_by: "country" }),
      callAdsterraApi(env, { start_date: today, finish_date: today, group_by: "placement" }),
    ]);

    const overallRows = extractItems(overallJson).map(parseStatRow);
    const countryRows = extractItems(countryJson).map(parseStatRow);
    const placementRows = extractItems(placementJson).map(parseStatRow);

    // Simpan histori (semua hari KECUALI hari ini) - upsert 1 baris final per tanggal
    for (const row of overallRows) {
      if (row.date === today) continue;
      const existing = await env.DB.prepare("SELECT id FROM adsterra_stats WHERE date = ? AND date != ?").bind(row.date, today).first();
      if (existing) {
        await env.DB
          .prepare("UPDATE adsterra_stats SET revenue=?, impressions=?, clicks=?, ctr=?, cpm=?, requests=?, fill_rate=?, json_response=?, updated_at=datetime('now') WHERE id=?")
          .bind(row.revenue, row.impressions, row.clicks, row.ctr, row.cpm, row.requests, row.fillRate, JSON.stringify(row), existing.id)
          .run();
      } else {
        await env.DB
          .prepare("INSERT INTO adsterra_stats (date, revenue, impressions, clicks, ctr, cpm, requests, fill_rate, json_response) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(row.date, row.revenue, row.impressions, row.clicks, row.ctr, row.cpm, row.requests, row.fillRate, JSON.stringify(row))
          .run();
      }
    }

    // Hari ini: SELALU insert baris baru (snapshot), untuk grafik intraday 24 jam
    const todayRow = overallRows.find((r) => r.date === today) || parseStatRow({ date: today });
    const combinedJson = JSON.stringify({ overall: todayRow, by_country: countryRows, by_placement: placementRows });

    await env.DB
      .prepare("INSERT INTO adsterra_stats (date, revenue, impressions, clicks, ctr, cpm, requests, fill_rate, json_response) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(today, todayRow.revenue, todayRow.impressions, todayRow.clicks, todayRow.ctr, todayRow.cpm, todayRow.requests, todayRow.fillRate, combinedJson)
      .run();

    await logSync(env, { responseTimeMs: Date.now() - startedAt, status: "success" });
    return { ok: true };
  } catch (err) {
    await logSync(env, { responseTimeMs: Date.now() - startedAt, status: "error", errorMessage: err.message || String(err) });
    return { ok: false, error: err.message || String(err) };
  }
}

/** Ambil data lengkap untuk dashboard dari D1 (tanpa memanggil Adsterra sama sekali). */
export async function getDashboardDataFromCache(env) {
  const today = todayStr();
  const start30 = daysAgoStr(29);

  const latestToday = await env.DB
    .prepare("SELECT * FROM adsterra_stats WHERE date = ? ORDER BY id DESC LIMIT 1")
    .bind(today)
    .first();

  const todaySnapshots = await env.DB
    .prepare("SELECT * FROM adsterra_stats WHERE date = ? ORDER BY id ASC")
    .bind(today)
    .all();

  const history = await env.DB
    .prepare(
      `SELECT date, revenue, impressions, clicks, ctr, cpm, requests, fill_rate, MAX(id) as max_id
       FROM adsterra_stats WHERE date >= ? GROUP BY date ORDER BY date ASC`
    )
    .bind(start30)
    .all();

  const lastSync = await env.DB.prepare("SELECT * FROM adsterra_sync_log ORDER BY id DESC LIMIT 1").first();

  let byCountry = [];
  let byPlacement = [];
  if (latestToday && latestToday.json_response) {
    try {
      const parsed = JSON.parse(latestToday.json_response);
      byCountry = parsed.by_country || [];
      byPlacement = parsed.by_placement || [];
    } catch {
      // Diamkan bila json_response tidak valid
    }
  }

  return {
    today: latestToday || null,
    todaySnapshots: todaySnapshots.results || [],
    history: history.results || [],
    byCountry,
    byPlacement,
    lastSync: lastSync || null,
  };
}
