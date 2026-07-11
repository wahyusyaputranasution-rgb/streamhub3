// lib/response.js
// Helper kecil untuk membuat response JSON yang konsisten,
// lengkap dengan header keamanan dasar.

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
};

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function ok(data, extra = {}) {
  return json({ success: true, ...extra, data }, { status: 200 });
}

export function created(data) {
  return json({ success: true, data }, { status: 201 });
}

export function fail(message, status = 400, extra = {}) {
  return json({ success: false, error: message, ...extra }, { status });
}

export function notFound(message = "Data tidak ditemukan") {
  return fail(message, 404);
}

export function unauthorized(message = "Anda harus login sebagai admin") {
  return fail(message, 401);
}

export function forbidden(message = "Akses ditolak") {
  return fail(message, 403);
}

export function tooManyRequests(message = "Terlalu banyak permintaan, coba lagi nanti") {
  return fail(message, 429);
}

export function serverError(err) {
  return fail("Terjadi kesalahan pada server: " + (err && err.message ? err.message : String(err)), 500);
}
