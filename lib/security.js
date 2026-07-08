// lib/security.js
// Kumpulan util keamanan: sanitasi input, hashing IP, rate limiting,
// dan pembacaan cookie. Semua berjalan native di Workers runtime
// (Web Crypto API), tanpa dependency eksternal.

/**
 * Bersihkan string dari tag HTML/script untuk mencegah XSS ketika
 * data disimpan atau ditampilkan. Kita encode karakter berbahaya,
 * bukan menghapusnya, supaya makna teks tetap terjaga.
 */
export function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validasi bahwa sebuah string adalah URL http/https yang valid.
 * Dipakai untuk validasi embed_url & thumbnail_url agar tidak
 * disalahgunakan sebagai vektor javascript: URI dsb.
 */
export function isSafeUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Ubah teks bebas menjadi slug URL-safe. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Hash sebuah string (misal IP) dengan SHA-256 + pepper rahasia. */
export async function hashValue(value, pepper = "streamhub-default-pepper") {
  const enc = new TextEncoder();
  const data = enc.encode(`${pepper}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ambil IP klien dari header Cloudflare. */
export function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "0.0.0.0";
}

/** Parse cookie header menjadi object sederhana. */
export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

export function buildCookie(name, value, { maxAge, secure = true } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict`;
  if (secure) cookie += "; Secure";
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  return cookie;
}

export function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`;
}

/**
 * Rate limiting generik berbasis D1: menghitung berapa baris yang
 * tercatat untuk sebuah kunci (mis. ip_hash) dalam N menit terakhir
 * pada tabel tertentu, lalu insert baris baru bila diizinkan.
 *
 * table harus punya kolom: ip_hash TEXT, attempted_at/viewed_at TEXT
 */
export async function checkRateLimit(db, { table, timeColumn, keyColumn, keyValue, windowMinutes, maxAttempts }) {
  const since = `datetime('now', '-${windowMinutes} minutes')`;
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${keyColumn} = ? AND ${timeColumn} >= ${since}`)
    .bind(keyValue)
    .first();
  const count = countRow ? countRow.cnt : 0;
  return { allowed: count < maxAttempts, count };
}

export async function recordAttempt(db, { table, keyColumn, keyValue, extraColumn, extraValue }) {
  if (extraColumn) {
    await db
      .prepare(`INSERT INTO ${table} (${keyColumn}, ${extraColumn}) VALUES (?, ?)`)
      .bind(keyValue, extraValue)
      .run();
  } else {
    await db.prepare(`INSERT INTO ${table} (${keyColumn}) VALUES (?)`).bind(keyValue).run();
  }
}
