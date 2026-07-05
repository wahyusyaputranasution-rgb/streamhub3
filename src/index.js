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
} from "../lib/db.js";
import { normalizeEmbedUrl } from "../lib/embed.js";

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

    return ok({ id: result.meta.last_row_id, slug }, { message: "Video berhasil dibuat" });
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
  const staticUrls = ["/", "/search/", "/category/"];
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
      } else if (path === "/api/auth/setup") {
        response = await handleAuthSetup(request, env);
      } else if (path === "/api/auth/login") {
        response = await handleAuthLogin(request, env);
      } else if (path === "/api/auth/logout") {
        response = await handleAuthLogout(request, env);
      } else if (path === "/api/auth/check") {
        response = await handleAuthCheck(request, env);
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
      } else if (path === "/api/search") {
        response = await handleSearch(request, env, url);
      } else if (path === "/api/stats") {
        response = await handleStats(request, env);
      } else if (path.startsWith("/api/")) {
        response = notFound("Endpoint tidak ditemukan");
      } else {
        // Bukan route API -> serahkan ke static assets (fallback normal Workers)
        response = await env.ASSETS.fetch(request);
      }

      return withSecurityHeaders(response);
    } catch (err) {
      return withSecurityHeaders(serverError(err));
    }
  },
};
