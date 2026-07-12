// lib/telegram.js
// Kirim notifikasi video baru ke channel/grup Telegram lewat Bot API.
// Tidak butuh dependency eksternal — cukup fetch() biasa.

function escapeMarkdown(text) {
  // Classic Markdown (bukan MarkdownV2) - cuma perlu escape 4 karakter ini
  return String(text || "").replace(/([_*`[])/g, "\\$1");
}

/**
 * Kirim pesan video baru ke Telegram.
 * Mengembalikan { ok, error } — ok=true berarti berhasil terkirim.
 */
export async function sendTelegramNotification({ botToken, chatId, title, description, url, thumbnailUrl }) {
  if (!botToken || !chatId) {
    return { ok: false, error: "Bot token atau Chat ID belum diisi" };
  }

  const shortDesc = (description || "").slice(0, 200);
  const caption = `🎬 *${escapeMarkdown(title)}*\n\n${escapeMarkdown(shortDesc)}\n\n🔗 ${url}`;

  try {
    if (thumbnailUrl) {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, photo: thumbnailUrl, caption, parse_mode: "Markdown" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        // Beberapa provider thumbnail kadang ditolak Telegram (mis. bukan gambar valid) -> fallback ke teks biasa
        return await sendTextFallback({ botToken, chatId, caption });
      }
      return { ok: true, error: null };
    }
    return await sendTextFallback({ botToken, chatId, caption });
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function sendTextFallback({ botToken, chatId, caption }) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "Markdown" }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: !!data.ok, error: data.ok ? null : data.description || "Gagal mengirim ke Telegram" };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
