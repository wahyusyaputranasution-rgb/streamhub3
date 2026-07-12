// lib/db.js
// Helper query D1 untuk video & kategori. Semua query memakai
// prepared statement (bind) untuk mencegah SQL injection.

import { slugify } from "./security.js";

const PUBLIC_VIDEO_FIELDS = `
  v.id, v.title, v.slug, v.description, v.category_id, v.embed_url,
  v.thumbnail_url, v.status, v.views, v.publish_date, v.telegram_posted,
  v.created_at, v.updated_at,
  c.name AS category_name, c.slug AS category_slug
`;

export async function generateUniqueSlug(db, title, excludeId = null) {
  const base = slugify(title) || "video";
  let slug = base;
  let counter = 2;
  // Coba slug dasar dulu, lalu tambahkan angka bila sudah dipakai
  while (true) {
    const query = excludeId
      ? "SELECT id FROM videos WHERE slug = ? AND id != ?"
      : "SELECT id FROM videos WHERE slug = ?";
    const binds = excludeId ? [slug, excludeId] : [slug];
    const row = await db.prepare(query).bind(...binds).first();
    if (!row) return slug;
    slug = `${base}-${counter}`;
    counter++;
  }
}

export async function generateUniqueCategorySlug(db, name, excludeId = null) {
  const base = slugify(name) || "kategori";
  let slug = base;
  let counter = 2;
  while (true) {
    const query = excludeId
      ? "SELECT id FROM categories WHERE slug = ? AND id != ?"
      : "SELECT id FROM categories WHERE slug = ?";
    const binds = excludeId ? [slug, excludeId] : [slug];
    const row = await db.prepare(query).bind(...binds).first();
    if (!row) return slug;
    slug = `${base}-${counter}`;
    counter++;
  }
}

export async function listVideos(db, { page = 1, perPage = 12, status = "published", categorySlug = null, orderBy = "publish_date", search = null, includeAll = false } = {}) {
  const offset = (page - 1) * perPage;
  const conditions = [];
  const binds = [];

  if (!includeAll) {
    conditions.push("v.status = ?");
    binds.push(status);
  }
  if (categorySlug) {
    conditions.push("c.slug = ?");
    binds.push(categorySlug);
  }
  if (search) {
    conditions.push("(v.title LIKE ? OR v.description LIKE ?)");
    binds.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderColumn = orderBy === "views" ? "v.views" : orderBy === "created_at" ? "v.created_at" : "v.publish_date";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM videos v LEFT JOIN categories c ON c.id = v.category_id ${whereClause}`)
    .bind(...binds)
    .first();
  const total = countRow ? countRow.total : 0;

  const rows = await db
    .prepare(
      `SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id
       ${whereClause} ORDER BY ${orderColumn} DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, perPage, offset)
    .all();

  return {
    items: rows.results || [],
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getVideoBySlug(db, slug, { publishedOnly = true } = {}) {
  const query = publishedOnly
    ? `SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id WHERE v.slug = ? AND v.status = 'published'`
    : `SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id WHERE v.slug = ?`;
  return await db.prepare(query).bind(slug).first();
}

export async function getVideoById(db, id) {
  return await db
    .prepare(`SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id WHERE v.id = ?`)
    .bind(id)
    .first();
}

export async function getRelatedVideos(db, categoryId, excludeId, limit = 8) {
  if (!categoryId) {
    const rows = await db
      .prepare(`SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id WHERE v.status = 'published' AND v.id != ? ORDER BY v.views DESC LIMIT ?`)
      .bind(excludeId, limit)
      .all();
    return rows.results || [];
  }
  const rows = await db
    .prepare(
      `SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id
       WHERE v.status = 'published' AND v.category_id = ? AND v.id != ? ORDER BY v.publish_date DESC LIMIT ?`
    )
    .bind(categoryId, excludeId, limit)
    .all();
  return rows.results || [];
}

export async function listCategories(db) {
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.created_at,
              (SELECT COUNT(*) FROM videos v WHERE v.category_id = c.id AND v.status = 'published') AS video_count
       FROM categories c ORDER BY c.name ASC`
    )
    .all();
  return rows.results || [];
}

export async function listAdZones(db) {
  const rows = await db.prepare("SELECT * FROM ad_zones ORDER BY placement ASC, created_at DESC").all();
  return rows.results || [];
}

export async function getAdZoneById(db, id) {
  return await db.prepare("SELECT * FROM ad_zones WHERE id = ?").bind(id).first();
}

export async function getActiveAdsByPlacement(db, placement) {
  const rows = await db
    .prepare("SELECT id, name, placement, code FROM ad_zones WHERE placement = ? AND enabled = 1 ORDER BY created_at DESC")
    .bind(placement)
    .all();
  return rows.results || [];
}

export async function incrementAdImpression(db, id) {
  await db.prepare("UPDATE ad_zones SET impressions = impressions + 1 WHERE id = ?").bind(id).run();
}

export async function listAdmins(db) {
  const rows = await db.prepare("SELECT id, username, created_at FROM admins ORDER BY created_at ASC").all();
  return rows.results || [];
}

export async function countAdmins(db) {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM admins").first();
  return row ? row.c : 0;
}

export async function saveUpload(db, id, contentType, base64Data) {
  await db.prepare("INSERT INTO uploads (id, content_type, data) VALUES (?, ?, ?)").bind(id, contentType, base64Data).run();
}

export async function getUpload(db, id) {
  return await db.prepare("SELECT content_type, data FROM uploads WHERE id = ?").bind(id).first();
}

export async function upsertDevice(db, deviceId, installed, userAgent) {
  await db
    .prepare(
      `INSERT INTO devices (device_id, is_installed, user_agent) VALUES (?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         last_seen = datetime('now'),
         is_installed = MAX(is_installed, excluded.is_installed),
         user_agent = excluded.user_agent`
    )
    .bind(deviceId, installed ? 1 : 0, userAgent || "")
    .run();
}

export async function getDeviceStats(db, onlineThresholdSeconds = 60) {
  const total = await db.prepare("SELECT COUNT(*) AS c FROM devices").first();
  const installed = await db.prepare("SELECT COUNT(*) AS c FROM devices WHERE is_installed = 1").first();
  const online = await db
    .prepare(`SELECT COUNT(*) AS c FROM devices WHERE last_seen >= datetime('now', '-${onlineThresholdSeconds} seconds')`)
    .first();

  const totalCount = total ? total.c : 0;
  const onlineCount = online ? online.c : 0;

  return {
    totalDevices: totalCount,
    totalInstalled: installed ? installed.c : 0,
    onlineCount,
    offlineCount: Math.max(0, totalCount - onlineCount),
  };
}

const PUBLIC_SETTING_KEYS = ["cs_enabled", "cs_link", "cs_label"];

export async function getAllSettings(db) {
  const rows = await db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  (rows.results || []).forEach((r) => (out[r.key] = r.value));
  return out;
}

export async function getPublicSettings(db) {
  const all = await getAllSettings(db);
  const out = {};
  PUBLIC_SETTING_KEYS.forEach((k) => (out[k] = all[k] !== undefined ? all[k] : ""));
  return out;
}

export async function setSetting(db, key, value) {
  await db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .bind(key, value)
    .run();
}

export async function getStats(db) {
  const totalVideos = await db.prepare("SELECT COUNT(*) AS c FROM videos").first();
  const totalPublished = await db.prepare("SELECT COUNT(*) AS c FROM videos WHERE status = 'published'").first();
  const totalDraft = await db.prepare("SELECT COUNT(*) AS c FROM videos WHERE status = 'draft'").first();
  const totalViews = await db.prepare("SELECT COALESCE(SUM(views), 0) AS c FROM videos").first();
  const totalCategories = await db.prepare("SELECT COUNT(*) AS c FROM categories").first();
  const latest = await db
    .prepare(`SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id ORDER BY v.created_at DESC LIMIT 5`)
    .all();
  const popular = await db
    .prepare(`SELECT ${PUBLIC_VIDEO_FIELDS} FROM videos v LEFT JOIN categories c ON c.id = v.category_id WHERE v.status = 'published' ORDER BY v.views DESC LIMIT 5`)
    .all();

  return {
    totalVideos: totalVideos.c,
    totalPublished: totalPublished.c,
    totalDraft: totalDraft.c,
    totalViews: totalViews.c,
    totalCategories: totalCategories.c,
    latestVideos: latest.results || [],
    popularVideos: popular.results || [],
  };
}
