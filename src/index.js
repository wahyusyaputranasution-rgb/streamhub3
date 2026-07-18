// src/index.js
// Entry point tunggal untuk Cloudflare Workers (model "Workers + Static Assets").
// Static file di folder public/ otomatis disajikan langsung oleh Cloudflare;
// Worker ini HANYA dipanggil untuk request yang tidak cocok dengan file statis,
// yaitu semua route /api/* dan /sitemap.xml.

import { ok, fail, notFound, unauthorized, forbidden, serverError, json } from "../lib/response.js";
import { requireAuth, verifyCsrf, verifyPassword, generateSalt, hashPassword, createSession, destroySession, getSession } from "../lib/auth.js";
import {
  sanitizeText,
  isSafeUrl,
  hashValue,
  getClientIp,
  checkRateLimit,
  recordAttempt,
  parseCookies,
  buildCookie,
  clearCookie,
} from "../lib/security.js";
import {
  listVideos,
  getVideoBySlug,
  getVideoById,
  getRelatedVideos,
  listCategories,
  getStats,
  generateUniqueSlug,
  generateUniqueCategorySlug,
  listAdZones,
  getAdZoneById,
  getActiveAdsByPlacement,
  incrementAdImpression,
  listAdmins,
  countAdmins,
  saveUpload,
  getUpload,
  upsertDevice,
  getDeviceStats,
  getAllSettings,
  getPublicSettings,
  setSetting,
  listSponsorAds,
  getSponsorAdById,
  getActiveSponsorAd,
  createSponsorAd,
  updateSponsorAd,
  deleteSponsorAd,
} from "../lib/db.js";
import { normalizeEmbedUrl } from "../lib/embed.js";
import { sendPushNotification } from "../lib/webpush.js";
import { sendTelegramNotification } from "../lib/telegram.js";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isPageLikePath(path) {
  if (path.startsWith("/admin")) return false;
  const lastSegment = path.split("/").pop();
  return !lastSegment.includes("."); // punya ekstensi (.css/.js/.png/dll) -> bukan halaman, biarkan lewat
}

function renderMaintenancePage(siteName, message) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Sedang Perbaikan - ${siteName}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0b0c10; color:#e9e9ef; font-family:"Segoe UI",Roboto,-apple-system,sans-serif; text-align:center; padding:24px; }
  .box { max-width:420px; }
  .icon { font-size:3rem; margin-bottom:12px; }
  h1 { font-size:1.3rem; margin:0 0 10px; }
  p { color:#9a9db0; font-size:0.9rem; line-height:1.6; margin:0; }
</style>
</head>
<body>
  <div class="box">
    <div class="icon">🛠️</div>
    <h1>${siteName} Sedang Dalam Perbaikan</h1>
    <p>${message || "Kami sedang melakukan sedikit perbaikan. Silakan kembali beberapa saat lagi."}</p>
  </div>
</body>
</html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "1800" } });
}

async function serveStaticOrNotFound(request, env) {
  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status === 404) {
    const notFoundUrl = new URL("/404.html", request.url);
    const custom404 = await env.ASSETS.fetch(new Request(notFoundUrl, request));
    return new Response(custom404.body, { status: 404, headers: custom404.headers });
  }
  return assetResponse;
}

// ================= AUTH =================

async function handleAuthSetup(request, env) {
  if (request.method === "GET") {
    const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM admins").first();
    return ok({ setupCompleted: existing && existing.c > 0 });
  }
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);

  const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM admins").first();
  if (existing && existing.c > 0) return fail("Setup sudah pernah dilakukan. Endpoint ini terkunci demi keamanan.", 403);

  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (username.length < 3) return fail("Username minimal 3 karakter");
  if (password.length < 8) return fail("Password minimal 8 karakter");

  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  await env.DB.prepare("INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)").bind(username, hash, salt).run();

  return ok({ username }, { message: "Admin berhasil dibuat. Silakan login." });
}

async function handleAuthLogin(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);

  const ip = getClientIp(request);
  const ipHash = await hashValue(ip, env.SITE_NAME || "streamhub-pepper");

  const { allowed } = await checkRateLimit(env.DB, {
    table: "login_attempts",
    timeColumn: "attempted_at",
    keyColumn: "ip_hash",
    keyValue: ipHash,
    windowMinutes: 15,
    maxAttempts: 5,
  });
  if (!allowed) return fail("Terlalu banyak percobaan login. Coba lagi dalam 15 menit.", 429);

  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!username || !password) {
    await recordAttempt(env.DB, { table: "login_attempts", keyColumn: "ip_hash", keyValue: ipHash });
    return fail("Username dan password wajib diisi", 400);
  }

  const admin = await env.DB.prepare("SELECT id, username, password_hash, salt FROM admins WHERE username = ?").bind(username).first();
  if (!admin) {
    await recordAttempt(env.DB, { table: "login_attempts", keyColumn: "ip_hash", keyValue: ipHash });
    return fail("Username atau password salah", 401);
  }

  const valid = await verifyPassword(password, admin.salt, admin.password_hash);
  if (!valid) {
    await recordAttempt(env.DB, { table: "login_attempts", keyColumn: "ip_hash", keyValue: ipHash });
    return fail("Username atau password salah", 401);
  }

  const { sessionId, csrfToken, maxAge } = await createSession(env.DB, admin.id);
  return json(
    { success: true, data: { username: admin.username, csrfToken } },
    { status: 200, headers: { "Set-Cookie": buildCookie("session", sessionId, { maxAge }) } }
  );
}

async function handleAuthLogout(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const cookies = parseCookies(request);
  if (cookies.session) await destroySession(env.DB, cookies.session);
  return json({ success: true, data: null }, { status: 200, headers: { "Set-Cookie": clearCookie("session") } });
}

async function handleAuthCheck(request, env) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const session = await getSession(request, env.DB);
  if (!session) return unauthorized();
  return ok({ username: session.username, csrfToken: session.csrf_token });
}

async function handleChangePassword(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();
  if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

  const body = await request.json().catch(() => ({}));
  const currentPassword = body.currentPassword || "";
  const newPassword = body.newPassword || "";
  if (newPassword.length < 8) return fail("Password baru minimal 8 karakter");

  const admin = await env.DB.prepare("SELECT id, salt, password_hash FROM admins WHERE id = ?").bind(session.admin_id).first();
  if (!admin) return notFound("Akun admin tidak ditemukan");

  const valid = await verifyPassword(currentPassword, admin.salt, admin.password_hash);
  if (!valid) return fail("Password saat ini salah", 401);

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);
  await env.DB.prepare("UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?").bind(newHash, newSalt, admin.id).run();

  return ok(null, { message: "Password berhasil diubah" });
}

// ================= ADMIN MANAGEMENT (multi-admin) =================

async function handleAdminsCollection(request, env) {
  if (request.method === "GET") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    const admins = await listAdmins(env.DB);
    return ok(admins);
  }

  if (request.method === "POST") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const body = await request.json().catch(() => ({}));
    const username = (body.username || "").trim();
    const password = body.password || "";
    if (username.length < 3) return fail("Username minimal 3 karakter");
    if (password.length < 8) return fail("Password minimal 8 karakter");

    const existing = await env.DB.prepare("SELECT id FROM admins WHERE username = ?").bind(username).first();
    if (existing) return fail("Username sudah dipakai");

    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const result = await env.DB.prepare("INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)").bind(username, hash, salt).run();

    return ok({ id: result.meta.last_row_id, username }, { message: "Admin baru berhasil dibuat" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleAdminById(request, env, id) {
  if (request.method !== "DELETE") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();
  if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

  if (String(session.admin_id) === String(id)) return fail("Tidak bisa menghapus akun yang sedang login");

  const total = await countAdmins(env.DB);
  if (total <= 1) return fail("Tidak bisa menghapus admin terakhir");

  const existing = await env.DB.prepare("SELECT id FROM admins WHERE id = ?").bind(id).first();
  if (!existing) return notFound("Admin tidak ditemukan");

  await env.DB.prepare("DELETE FROM admins WHERE id = ?").bind(id).run();
  return ok(null, { message: "Admin berhasil dihapus" });
}

// ================= VIDEOS =================

async function handleVideosCollection(request, env, url) {
  if (request.method === "GET") {
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("perPage") || "12", 10) || 12));
    const category = url.searchParams.get("category") || null;
    const search = url.searchParams.get("q") || null;
    const orderBy = url.searchParams.get("orderBy") === "views" ? "views" : "publish_date";
    const wantsAdminView = url.searchParams.get("admin") === "1";

    let includeAll = false;
    if (wantsAdminView) {
      const session = await requireAuth(request, env.DB);
      if (!session) return unauthorized();
      includeAll = true;
    }
    const result = await listVideos(env.DB, { page, perPage, categorySlug: category, search, orderBy, includeAll });
    return ok(result);
  }

  if (request.method === "POST") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const body = await request.json().catch(() => ({}));
    const title = sanitizeText((body.title || "").trim());
    const description = sanitizeText((body.description || "").trim());
    const categoryId = body.categoryId ? parseInt(body.categoryId, 10) : null;
    const rawEmbed = (body.embedUrl || "").trim();
    const thumbnailUrl = (body.thumbnailUrl || "").trim();
    const status = body.status === "published" ? "published" : "draft";
    const publishDate = body.publishDate || null;

    if (!title) return fail("Judul wajib diisi");
    if (!rawEmbed) return fail("Link embed wajib diisi");
    const embedUrl = normalizeEmbedUrl(rawEmbed);
    if (!embedUrl || !isSafeUrl(embedUrl)) return fail("Link embed tidak valid");
    if (thumbnailUrl && !isSafeUrl(thumbnailUrl)) return fail("Link thumbnail tidak valid");

    const slug = await generateUniqueSlug(env.DB, title);
    const finalPublishDate = status === "published" ? (publishDate || new Date().toISOString()) : publishDate;

    const result = await env.DB
      .prepare(`INSERT INTO videos (title, slug, description, category_id, embed_url, thumbnail_url, status, publish_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(title, slug, description, categoryId, embedUrl, thumbnailUrl, status, finalPublishDate)
      .run();

    const newId = result.meta.last_row_id;
    if (status === "published") {
      await maybeNotifyTelegram(env, { id: newId, slug, title, description, thumbnail_url: thumbnailUrl });
    }

    return ok({ id: newId, slug }, { message: "Video berhasil dibuat" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleVideoById(request, env, id) {
  if (request.method === "GET") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    const video = await getVideoById(env.DB, id);
    if (!video) return notFound("Video tidak ditemukan");
    return ok(video);
  }

  if (request.method === "PUT") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await getVideoById(env.DB, id);
    if (!existing) return notFound("Video tidak ditemukan");

    const body = await request.json().catch(() => ({}));
    const title = sanitizeText((body.title || "").trim());
    const description = sanitizeText((body.description || "").trim());
    const categoryId = body.categoryId ? parseInt(body.categoryId, 10) : null;
    const rawEmbed = (body.embedUrl || "").trim();
    const thumbnailUrl = (body.thumbnailUrl || "").trim();
    const status = body.status === "published" ? "published" : "draft";
    const publishDate = body.publishDate || existing.publish_date;

    if (!title) return fail("Judul wajib diisi");
    if (!rawEmbed) return fail("Link embed wajib diisi");
    const embedUrl = normalizeEmbedUrl(rawEmbed);
    if (!embedUrl || !isSafeUrl(embedUrl)) return fail("Link embed tidak valid");
    if (thumbnailUrl && !isSafeUrl(thumbnailUrl)) return fail("Link thumbnail tidak valid");

    let slug = existing.slug;
    if (title !== existing.title) slug = await generateUniqueSlug(env.DB, title, id);
    const finalPublishDate = status === "published" ? (publishDate || new Date().toISOString()) : publishDate;

    await env.DB
      .prepare(`UPDATE videos SET title = ?, slug = ?, description = ?, category_id = ?, embed_url = ?, thumbnail_url = ?, status = ?, publish_date = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(title, slug, description, categoryId, embedUrl, thumbnailUrl, status, finalPublishDate, id)
      .run();

    if (status === "published" && !existing.telegram_posted) {
      await maybeNotifyTelegram(env, { id, slug, title, description, thumbnail_url: thumbnailUrl });
    }

    return ok({ id, slug }, { message: "Video berhasil diperbarui" });
  }

  if (request.method === "DELETE") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await getVideoById(env.DB, id);
    if (!existing) return notFound("Video tidak ditemukan");

    await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
    return ok(null, { message: "Video berhasil dihapus" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleVideoBySlug(request, env, slug) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const video = await getVideoBySlug(env.DB, slug, { publishedOnly: true });
  if (!video) return notFound("Video tidak ditemukan");
  const related = await getRelatedVideos(env.DB, video.category_id, video.id, 8);
  return ok({ video, related });
}

async function handleViewCounter(request, env, id) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const WINDOW_MINUTES = 30;

  const video = await env.DB.prepare("SELECT id, views FROM videos WHERE id = ? AND status = 'published'").bind(id).first();
  if (!video) return notFound("Video tidak ditemukan");

  const ip = getClientIp(request);
  const ipHash = await hashValue(ip, env.SITE_NAME || "streamhub-pepper");

  const dup = await env.DB
    .prepare(`SELECT id FROM view_logs WHERE video_id = ? AND ip_hash = ? AND viewed_at >= datetime('now', '-${WINDOW_MINUTES} minutes') LIMIT 1`)
    .bind(id, ipHash)
    .first();

  if (dup) return ok({ counted: false, views: video.views });

  await env.DB.prepare("INSERT INTO view_logs (video_id, ip_hash) VALUES (?, ?)").bind(id, ipHash).run();
  await env.DB.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").bind(id).run();
  return ok({ counted: true, views: video.views + 1 });
}

// ================= AUTOMATION (auto-publish + Telegram) =================

async function maybeNotifyTelegram(env, video) {
  try {
    const settings = await getAllSettings(env.DB);
    if (settings.telegram_enabled !== "1") return;
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) return;

    const siteUrl = (env.SITE_URL || "").replace(/\/$/, "");
    const watchUrl = `${siteUrl}/watch/?slug=${encodeURIComponent(video.slug)}`;

    const result = await sendTelegramNotification({
      botToken: settings.telegram_bot_token,
      chatId: settings.telegram_chat_id,
      title: video.title,
      description: video.description,
      url: watchUrl,
      thumbnailUrl: video.thumbnail_url,
    });

    if (result.ok) {
      await env.DB.prepare("UPDATE videos SET telegram_posted = 1 WHERE id = ?").bind(video.id).run();
    }
  } catch {
    // Jangan biarkan kegagalan Telegram mengganggu proses utama (simpan/publish video)
  }
}

async function runAutoPublish(env) {
  const dueRows = await env.DB
    .prepare(
      `SELECT id, slug, title, description, thumbnail_url, telegram_posted FROM videos
       WHERE status = 'draft' AND publish_date IS NOT NULL AND publish_date <= datetime('now')`
    )
    .all();
  const due = dueRows.results || [];

  for (const v of due) {
    await env.DB.prepare("UPDATE videos SET status = 'published', updated_at = datetime('now') WHERE id = ?").bind(v.id).run();
    if (!v.telegram_posted) {
      await maybeNotifyTelegram(env, v);
    }
  }
  return due.length;
}

async function handleRunAutoPublishNow(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();
  if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

  const publishedCount = await runAutoPublish(env);
  return ok({ published: publishedCount }, { message: `${publishedCount} video draft dipublish otomatis` });
}

// ================= CATEGORIES =================

async function handleCategoriesCollection(request, env) {
  if (request.method === "GET") {
    const categories = await listCategories(env.DB);
    return ok(categories);
  }

  if (request.method === "POST") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const body = await request.json().catch(() => ({}));
    const name = sanitizeText((body.name || "").trim());
    if (!name) return fail("Nama kategori wajib diisi");

    const slug = await generateUniqueCategorySlug(env.DB, name);
    const result = await env.DB.prepare("INSERT INTO categories (name, slug) VALUES (?, ?)").bind(name, slug).run();
    return ok({ id: result.meta.last_row_id, name, slug }, { message: "Kategori berhasil dibuat" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleCategoryById(request, env, id) {
  if (request.method === "PUT") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await env.DB.prepare("SELECT id, name, slug FROM categories WHERE id = ?").bind(id).first();
    if (!existing) return notFound("Kategori tidak ditemukan");

    const body = await request.json().catch(() => ({}));
    const name = sanitizeText((body.name || "").trim());
    if (!name) return fail("Nama kategori wajib diisi");

    let slug = existing.slug;
    if (name !== existing.name) slug = await generateUniqueCategorySlug(env.DB, name, id);

    await env.DB.prepare("UPDATE categories SET name = ?, slug = ? WHERE id = ?").bind(name, slug, id).run();
    return ok({ id, name, slug }, { message: "Kategori berhasil diperbarui" });
  }

  if (request.method === "DELETE") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first();
    if (!existing) return notFound("Kategori tidak ditemukan");

    await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return ok(null, { message: "Kategori berhasil dihapus" });
  }

  return fail("Method tidak diizinkan", 405);
}

// ================= PUSH NOTIFICATIONS =================

async function handlePushVapidKey(request, env) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  if (!env.VAPID_PUBLIC_KEY) return fail("Push notification belum dikonfigurasi di server", 503);
  return ok({ publicKey: env.VAPID_PUBLIC_KEY });
}

async function handlePushSubscribe(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const body = await request.json().catch(() => ({}));
  const endpoint = (body.endpoint || "").trim();
  const p256dh = (body.keys && body.keys.p256dh) || "";
  const auth = (body.keys && body.keys.auth) || "";

  if (!endpoint || !isSafeUrl(endpoint)) return fail("Data langganan tidak valid");
  if (!p256dh || !auth) return fail("Data kunci langganan tidak lengkap");

  await env.DB
    .prepare("INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth")
    .bind(endpoint, p256dh, auth)
    .run();

  return ok(null, { message: "Berhasil berlangganan notifikasi" });
}

async function handlePushUnsubscribe(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const body = await request.json().catch(() => ({}));
  const endpoint = (body.endpoint || "").trim();
  if (!endpoint) return fail("Endpoint wajib diisi");

  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
  return ok(null, { message: "Berhenti berlangganan notifikasi" });
}

async function handlePushSend(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();
  if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK) {
    return fail("Push notification belum dikonfigurasi di server (VAPID keys belum diisi)", 503);
  }

  const body = await request.json().catch(() => ({}));
  const title = sanitizeText((body.title || "").trim());
  const message = sanitizeText((body.body || "").trim());
  const url = (body.url || "/").trim();

  if (!title || !message) return fail("Judul dan isi notifikasi wajib diisi");

  let privateKeyJwk;
  try {
    privateKeyJwk = JSON.parse(env.VAPID_PRIVATE_KEY_JWK);
  } catch {
    return serverError(new Error("VAPID_PRIVATE_KEY_JWK tidak valid (bukan JSON)"));
  }

  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKeyJwk,
    subject: env.VAPID_SUBJECT || "mailto:admin@example.com",
  };

  const subsResult = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all();
  const subscriptions = subsResult.results || [];

  let sent = 0;
  let failed = 0;
  const expiredEndpoints = [];

  for (const sub of subscriptions) {
    try {
      const result = await sendPushNotification(sub, { title, body: message, url }, vapid);
      if (result.ok) {
        sent++;
      } else {
        failed++;
        if (result.expired) expiredEndpoints.push(sub.endpoint);
      }
    } catch {
      failed++;
    }
  }

  for (const endpoint of expiredEndpoints) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
  }

  return ok({ sent, failed, total: subscriptions.length }, { message: `Notifikasi terkirim ke ${sent} dari ${subscriptions.length} pengunjung` });
}

async function handleUploadCreate(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();
  if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

  const body = await request.json().catch(() => ({}));
  const contentType = (body.contentType || "").trim();
  const base64Data = (body.data || "").trim();

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(contentType)) return fail("Tipe file tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.");
  if (!base64Data) return fail("Data gambar kosong");

  let byteLength;
  try {
    byteLength = atob(base64Data).length;
  } catch {
    return fail("Data gambar tidak valid");
  }
  const MAX_BYTES = 800 * 1024; // 800KB, cukup untuk thumbnail yang sudah dikompres di sisi client
  if (byteLength > MAX_BYTES) return fail("Ukuran gambar terlalu besar (maks 800KB setelah kompresi otomatis)");

  const id = crypto.randomUUID();
  await saveUpload(env.DB, id, contentType, base64Data);

  const absoluteUrl = new URL(`/uploads/${id}`, request.url).toString();
  return ok({ url: absoluteUrl }, { message: "Gambar berhasil diupload" });
}

async function handleUploadServe(env, id) {
  const upload = await getUpload(env.DB, id);
  if (!upload) return new Response("Not found", { status: 404 });

  const binary = atob(upload.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": upload.content_type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

async function handleTrackHeartbeat(request, env) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const body = await request.json().catch(() => ({}));
  const deviceId = (body.deviceId || "").trim();
  const installed = !!body.installed;

  if (!deviceId || deviceId.length > 100) return fail("Device ID tidak valid");

  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 200);
  await upsertDevice(env.DB, deviceId, installed, userAgent);
  return ok(null);
}

async function handleTrackStats(request, env) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();

  const stats = await getDeviceStats(env.DB, 60);
  return ok(stats);
}

async function handleSettingsCollection(request, env) {
  if (request.method === "GET") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    const settings = await getAllSettings(env.DB);
    return ok(settings);
  }

  if (request.method === "PUT") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const body = await request.json().catch(() => ({}));
    const settings = body.settings || {};
    const keys = Object.keys(settings);
    if (!keys.length) return fail("Tidak ada pengaturan yang dikirim");

    for (const key of keys) {
      const cleanKey = String(key).trim().slice(0, 100);
      const cleanValue = String(settings[key] || "").trim().slice(0, 2000);
      if (cleanKey === "cs_link" && cleanValue && !isSafeUrl(cleanValue)) {
        return fail("Link Customer Service tidak valid (harus URL http/https, mis. https://wa.me/62812xxxx)");
      }
      await setSetting(env.DB, cleanKey, cleanValue);
    }

    return ok(null, { message: "Pengaturan berhasil disimpan" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handlePublicSettings(request, env) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const settings = await getPublicSettings(env.DB);
  return ok(settings);
}

// ================= SPONSOR ADS (kartu endorse di grid) =================

async function handleSponsorAdActive(request, env) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const ad = await getActiveSponsorAd(env.DB);
  return ok(ad);
}

async function handleSponsorAdsCollection(request, env) {
  if (request.method === "GET") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    const ads = await listSponsorAds(env.DB);
    return ok(ads);
  }

  if (request.method === "POST") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const body = await request.json().catch(() => ({}));
    const name = sanitizeText((body.name || "").trim());
    const title = sanitizeText((body.title || "").trim());
    const imageUrl = (body.imageUrl || "").trim();
    const linkUrl = (body.linkUrl || "").trim();
    const startDate = (body.startDate || "").trim();
    const endDate = (body.endDate || "").trim();
    const enabled = body.enabled === false ? 0 : 1;

    if (!name || !title) return fail("Nama dan judul wajib diisi");
    if (!imageUrl || !isSafeUrl(imageUrl)) return fail("Gambar wajib diisi (upload atau URL valid)");
    if (!linkUrl || !isSafeUrl(linkUrl)) return fail("Link tujuan tidak valid");
    if (!startDate || !endDate) return fail("Tanggal mulai dan berakhir wajib diisi");
    if (startDate > endDate) return fail("Tanggal mulai tidak boleh setelah tanggal berakhir");

    const id = await createSponsorAd(env.DB, { name, title, imageUrl, linkUrl, startDate, endDate, enabled });
    return ok({ id }, { message: "Iklan sponsor berhasil dibuat" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleSponsorAdById(request, env, id) {
  if (request.method === "PUT") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await getSponsorAdById(env.DB, id);
    if (!existing) return notFound("Iklan sponsor tidak ditemukan");

    const body = await request.json().catch(() => ({}));
    const name = sanitizeText((body.name || "").trim());
    const title = sanitizeText((body.title || "").trim());
    const imageUrl = (body.imageUrl || "").trim();
    const linkUrl = (body.linkUrl || "").trim();
    const startDate = (body.startDate || "").trim();
    const endDate = (body.endDate || "").trim();
    const enabled = body.enabled === false ? 0 : 1;

    if (!name || !title) return fail("Nama dan judul wajib diisi");
    if (!imageUrl || !isSafeUrl(imageUrl)) return fail("Gambar wajib diisi (upload atau URL valid)");
    if (!linkUrl || !isSafeUrl(linkUrl)) return fail("Link tujuan tidak valid");
    if (!startDate || !endDate) return fail("Tanggal mulai dan berakhir wajib diisi");
    if (startDate > endDate) return fail("Tanggal mulai tidak boleh setelah tanggal berakhir");

    await updateSponsorAd(env.DB, id, { name, title, imageUrl, linkUrl, startDate, endDate, enabled });
    return ok({ id }, { message: "Iklan sponsor berhasil diperbarui" });
  }

  if (request.method === "DELETE") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await getSponsorAdById(env.DB, id);
    if (!existing) return notFound("Iklan sponsor tidak ditemukan");

    await deleteSponsorAd(env.DB, id);
    return ok(null, { message: "Iklan sponsor berhasil dihapus" });
  }

  return fail("Method tidak diizinkan", 405);
}

// ================= ADS =================

const ALLOWED_PLACEMENTS = [
  "global", // dimuat di semua halaman publik (cocok untuk popunder/social bar)
  "home_top", // Home, di bawah hero sebelum daftar video
  "home_grid", // Home, di antara section "Video Terbaru" dan "Video Populer"
  "watch_below_player", // Watch, tepat di bawah player
  "watch_sidebar", // Watch, di atas daftar video terkait
  "category_top", // Kategori, di atas grid video (banner biasa)
  "category_click", // Smartlink: dibuka di tab baru saat link kategori diklik
  "search_top", // Search, di atas hasil pencarian
];

async function handleAdsCollection(request, env, url) {
  if (request.method === "GET") {
    const wantsAdminView = url.searchParams.get("admin") === "1";
    if (wantsAdminView) {
      const session = await requireAuth(request, env.DB);
      if (!session) return unauthorized();
      const zones = await listAdZones(env.DB);
      return ok(zones);
    }

    const placement = url.searchParams.get("placement") || "";
    if (!ALLOWED_PLACEMENTS.includes(placement)) return ok([]);
    const ads = await getActiveAdsByPlacement(env.DB, placement);
    return ok(ads);
  }

  if (request.method === "POST") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const body = await request.json().catch(() => ({}));
    const name = sanitizeText((body.name || "").trim());
    const placement = (body.placement || "").trim();
    const code = (body.code || "").trim();
    const enabled = body.enabled === false ? 0 : 1;

    if (!name) return fail("Nama zona iklan wajib diisi");
    if (!ALLOWED_PLACEMENTS.includes(placement)) return fail("Penempatan (placement) tidak valid");
    if (!code) return fail("Kode iklan wajib diisi");

    const result = await env.DB
      .prepare("INSERT INTO ad_zones (name, placement, code, enabled) VALUES (?, ?, ?, ?)")
      .bind(name, placement, code, enabled)
      .run();

    return ok({ id: result.meta.last_row_id }, { message: "Zona iklan berhasil dibuat" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleAdZoneById(request, env, id) {
  if (request.method === "PUT") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await getAdZoneById(env.DB, id);
    if (!existing) return notFound("Zona iklan tidak ditemukan");

    const body = await request.json().catch(() => ({}));
    const name = sanitizeText((body.name || "").trim());
    const placement = (body.placement || "").trim();
    const code = (body.code || "").trim();
    const enabled = body.enabled === false ? 0 : 1;

    if (!name) return fail("Nama zona iklan wajib diisi");
    if (!ALLOWED_PLACEMENTS.includes(placement)) return fail("Penempatan (placement) tidak valid");
    if (!code) return fail("Kode iklan wajib diisi");

    await env.DB
      .prepare("UPDATE ad_zones SET name = ?, placement = ?, code = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(name, placement, code, enabled, id)
      .run();

    return ok({ id }, { message: "Zona iklan berhasil diperbarui" });
  }

  if (request.method === "DELETE") {
    const session = await requireAuth(request, env.DB);
    if (!session) return unauthorized();
    if (!verifyCsrf(request, session)) return forbidden("Token CSRF tidak valid");

    const existing = await getAdZoneById(env.DB, id);
    if (!existing) return notFound("Zona iklan tidak ditemukan");

    await env.DB.prepare("DELETE FROM ad_zones WHERE id = ?").bind(id).run();
    return ok(null, { message: "Zona iklan berhasil dihapus" });
  }

  return fail("Method tidak diizinkan", 405);
}

async function handleAdImpressionTrack(request, env, id) {
  if (request.method !== "POST") return fail("Method tidak diizinkan", 405);
  const existing = await getAdZoneById(env.DB, id);
  if (!existing) return notFound("Zona iklan tidak ditemukan");
  await incrementAdImpression(env.DB, id);
  return ok(null);
}

// ================= SEARCH / STATS / SITEMAP =================

async function handleSearch(request, env, url) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("perPage") || "16", 10) || 16));
  if (!q) return ok({ items: [], total: 0, page: 1, perPage, totalPages: 1 });
  const result = await listVideos(env.DB, { page, perPage, search: q, orderBy: "views" });
  return ok(result);
}

async function handleStats(request, env) {
  if (request.method !== "GET") return fail("Method tidak diizinkan", 405);
  const session = await requireAuth(request, env.DB);
  if (!session) return unauthorized();
  const stats = await getStats(env.DB);
  return ok(stats);
}

async function handleSitemap(env) {
  const siteUrl = (env.SITE_URL || "https://your-project.workers.dev").replace(/\/$/, "");
  const staticUrls = ["/", "/search/", "/category/", "/privacy/", "/terms/"];
  let categories = [];
  let videos = [];
  try {
    const catRows = await env.DB.prepare("SELECT slug FROM categories").all();
    categories = catRows.results || [];
    const vidRows = await env.DB
      .prepare("SELECT slug, updated_at FROM videos WHERE status = 'published' ORDER BY publish_date DESC LIMIT 5000")
      .all();
    videos = vidRows.results || [];
  } catch {
    // DB belum siap - tetap kembalikan sitemap statis
  }

  const urlEntries = [
    ...staticUrls.map((path) => `  <url><loc>${siteUrl}${path}</loc><changefreq>daily</changefreq></url>`),
    ...categories.map((c) => `  <url><loc>${siteUrl}/category/?slug=${encodeURIComponent(c.slug)}</loc><changefreq>daily</changefreq></url>`),
    ...videos.map(
      (v) => `  <url><loc>${siteUrl}/watch/?slug=${encodeURIComponent(v.slug)}</loc><lastmod>${(v.updated_at || "").slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url>`
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join("\n")}\n</urlset>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

// ================= ROUTER =================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const allowedMethods = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"];
    if (!allowedMethods.includes(request.method)) {
      return json({ success: false, error: "Method tidak diizinkan" }, { status: 405 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token" },
      });
    }

    try {
      let response;

      if (path === "/sitemap.xml") {
        response = await handleSitemap(env);
      } else if (/^\/uploads\/[a-zA-Z0-9-]+$/.test(path)) {
        const id = path.replace("/uploads/", "");
        response = await handleUploadServe(env, id);
      } else if (path === "/api/auth/setup") {
        response = await handleAuthSetup(request, env);
      } else if (path === "/api/auth/login") {
        response = await handleAuthLogin(request, env);
      } else if (path === "/api/auth/logout") {
        response = await handleAuthLogout(request, env);
      } else if (path === "/api/auth/check") {
        response = await handleAuthCheck(request, env);
      } else if (path === "/api/auth/change-password") {
        response = await handleChangePassword(request, env);
      } else if (path === "/api/admins") {
        response = await handleAdminsCollection(request, env);
      } else if (/^\/api\/admins\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleAdminById(request, env, id);
      } else if (path === "/api/push/vapid-public-key") {
        response = await handlePushVapidKey(request, env);
      } else if (path === "/api/push/subscribe") {
        response = await handlePushSubscribe(request, env);
      } else if (path === "/api/push/unsubscribe") {
        response = await handlePushUnsubscribe(request, env);
      } else if (path === "/api/push/send") {
        response = await handlePushSend(request, env);
      } else if (path === "/api/uploads") {
        response = await handleUploadCreate(request, env);
      } else if (path === "/api/track/heartbeat") {
        response = await handleTrackHeartbeat(request, env);
      } else if (path === "/api/track/stats") {
        response = await handleTrackStats(request, env);
      } else if (path === "/api/settings") {
        response = await handleSettingsCollection(request, env);
      } else if (path === "/api/settings/public") {
        response = await handlePublicSettings(request, env);
      } else if (path === "/api/automation/run-now") {
        response = await handleRunAutoPublishNow(request, env);
      } else if (path === "/api/sponsor-ads/active") {
        response = await handleSponsorAdActive(request, env);
      } else if (path === "/api/sponsor-ads") {
        response = await handleSponsorAdsCollection(request, env);
      } else if (/^\/api\/sponsor-ads\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleSponsorAdById(request, env, id);
      } else if (path === "/api/videos") {
        response = await handleVideosCollection(request, env, url);
      } else if (/^\/api\/videos\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleVideoById(request, env, id);
      } else if (path.startsWith("/api/video/")) {
        const slug = decodeURIComponent(path.replace("/api/video/", ""));
        response = await handleVideoBySlug(request, env, slug);
      } else if (path === "/api/categories") {
        response = await handleCategoriesCollection(request, env);
      } else if (/^\/api\/categories\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleCategoryById(request, env, id);
      } else if (/^\/api\/view\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleViewCounter(request, env, id);
      } else if (path === "/api/ads") {
        response = await handleAdsCollection(request, env, url);
      } else if (/^\/api\/ads\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleAdZoneById(request, env, id);
      } else if (/^\/api\/ads\/track\/\d+$/.test(path)) {
        const id = parseInt(path.split("/").pop(), 10);
        response = await handleAdImpressionTrack(request, env, id);
      } else if (path === "/api/search") {
        response = await handleSearch(request, env, url);
      } else if (path === "/api/stats") {
        response = await handleStats(request, env);
      } else if (path.startsWith("/api/")) {
        response = notFound("Endpoint tidak ditemukan");
      } else if (isPageLikePath(path)) {
        const settings = await getAllSettings(env.DB);
        if (settings.maintenance_enabled === "1") {
          response = renderMaintenancePage(settings.site_name || "StreamHub", settings.maintenance_message);
        } else {
          response = await serveStaticOrNotFound(request, env);
        }
      } else {
        response = await serveStaticOrNotFound(request, env);
      }

      return withSecurityHeaders(response);
    } catch (err) {
      return withSecurityHeaders(serverError(err));
    }
  },

  // Dipanggil otomatis oleh Cloudflare Cron Trigger (lihat [triggers] di wrangler.toml).
  // Publish otomatis video draft yang tanggal publish-nya sudah lewat, lalu kirim
  // notifikasi Telegram untuk video yang baru dipublish (kalau diaktifkan).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutoPublish(env));
  },
};
