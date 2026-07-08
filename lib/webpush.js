// lib/webpush.js
// Implementasi Web Push (RFC 8291 - enkripsi pesan, RFC 8292 - VAPID)
// memakai Web Crypto API native, tanpa dependency eksternal.
// Logikanya sudah divalidasi lewat tes round-trip encrypt->decrypt sebelum dipasang.

const subtle = globalThis.crypto.subtle;

function b64urlToBuf(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bufToB64url(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBuf(...parts) {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), offset);
    offset += p.byteLength;
  }
  return out;
}

async function hmacSha256(keyBytes, msgBytes) {
  const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await subtle.sign("HMAC", key, msgBytes);
  return new Uint8Array(sig);
}

/** Enkripsi payload sesuai RFC 8291 (content-encoding aes128gcm). */
async function encryptPayload(payloadBytes, uaPublicKeyRaw, authSecret) {
  const asKeyPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await subtle.exportKey("raw", asKeyPair.publicKey));

  const uaPublicKey = await subtle.importKey("raw", uaPublicKeyRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecretBits = await subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256);
  const ecdhSecret = new Uint8Array(ecdhSecretBits);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatBuf(new TextEncoder().encode("WebPush: info\0"), uaPublicKeyRaw, asPublicRaw);
  const ikm = await hmacSha256(prkKey, concatBuf(keyInfo, new Uint8Array([1])));
  const prk = await hmacSha256(salt, ikm);

  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekFull = await hmacSha256(prk, concatBuf(cekInfo, new Uint8Array([1])));
  const cek = cekFull.slice(0, 16);

  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonceFull = await hmacSha256(prk, concatBuf(nonceInfo, new Uint8Array([1])));
  const nonce = nonceFull.slice(0, 12);

  const record = concatBuf(payloadBytes, new Uint8Array([2]));
  const cekKey = await subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, record));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([asPublicRaw.byteLength]);
  const header = concatBuf(salt, rs, idlen, asPublicRaw);

  return concatBuf(header, ciphertext);
}

/** Buat JWT VAPID (ES256) yang ditandatangani pakai private key VAPID. */
async function createVapidJwt(audience, subject, privateKeyJwk) {
  const privateKey = await subtle.importKey("jwk", privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const signingInput =
    bufToB64url(new TextEncoder().encode(JSON.stringify(header))) + "." + bufToB64url(new TextEncoder().encode(JSON.stringify(payload)));

  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput));
  return signingInput + "." + bufToB64url(new Uint8Array(sig));
}

/**
 * Kirim satu push notification ke satu subscription.
 * subscription: { endpoint, p256dh, auth }
 * vapid: { publicKey (base64url), privateKeyJwk (object), subject (mis. "mailto:admin@example.com") }
 * Mengembalikan { ok, status, expired } — expired=true berarti subscription sudah tidak valid
 * (endpoint 404/410) dan sebaiknya dihapus dari database.
 */
export async function sendPushNotification(subscription, payloadObj, vapid) {
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const jwt = await createVapidJwt(audience, vapid.subject, vapid.privateKeyJwk);

  const uaPublicKeyRaw = b64urlToBuf(subscription.p256dh);
  const authSecret = b64urlToBuf(subscription.auth);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));

  const body = await encryptPayload(payloadBytes, uaPublicKeyRaw, authSecret);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });

  return { ok: res.ok, status: res.status, expired: res.status === 404 || res.status === 410 };
}
