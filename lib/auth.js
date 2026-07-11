// lib/auth.js
// Autentikasi admin: hashing password dengan PBKDF2 (Web Crypto,
// tanpa dependency), pembuatan & verifikasi sesi login di D1,
// serta verifikasi CSRF token untuk request yang mengubah data.

import { parseCookies } from "./security.js";

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bufToHex(bytes);
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBuf(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bufToHex(bits);
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  const computed = await hashPassword(password, saltHex);
  // Perbandingan constant-time sederhana
  if (computed.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  return diff === 0;
}

export function generateToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export async function createSession(db, adminId) {
  const sessionId = crypto.randomUUID();
  const csrfToken = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (id, admin_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, adminId, csrfToken, expiresAt)
    .run();
  return { sessionId, csrfToken, maxAge: SESSION_TTL_SECONDS };
}

/**
 * Ambil sesi aktif dari cookie request. Mengembalikan null bila
 * tidak ada / sudah kedaluwarsa.
 */
export async function getSession(request, db) {
  const cookies = parseCookies(request);
  const sessionId = cookies["session"];
  if (!sessionId) return null;

  const row = await db
    .prepare("SELECT s.id, s.admin_id, s.csrf_token, s.expires_at, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id = ?")
    .bind(sessionId)
    .first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }
  return row;
}

export async function destroySession(db, sessionId) {
  if (!sessionId) return;
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

/**
 * Wajibkan admin sudah login. Mengembalikan session row bila valid,
 * atau null bila tidak terautentikasi.
 */
export async function requireAuth(request, db) {
  return await getSession(request, db);
}

/**
 * Verifikasi CSRF token untuk request yang mengubah data (POST/PUT/DELETE).
 * Token dikirim client lewat header X-CSRF-Token dan harus cocok
 * dengan csrf_token yang tersimpan pada sesi aktif.
 */
export function verifyCsrf(request, session) {
  if (!session) return false;
  const headerToken = request.headers.get("X-CSRF-Token");
  if (!headerToken) return false;
  return headerToken === session.csrf_token;
}

/** Bersihkan sesi kedaluwarsa (dipanggil sesekali, best-effort). */
export async function pruneExpiredSessions(db) {
  await db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}
