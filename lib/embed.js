// lib/embed.js
// Normalisasi berbagai bentuk link video menjadi URL embed iframe
// yang valid, sehingga admin bisa menempelkan link "biasa" dari
// beberapa provider populer dan tetap otomatis ter-embed dengan benar.

export function normalizeEmbedUrl(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // YouTube: watch?v=, youtu.be/, sudah embed/
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (url.pathname.startsWith("/embed/")) return url.toString();
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  }
  if (host === "youtu.be") {
    const id = url.pathname.replace("/", "");
    if (id) return `https://www.youtube.com/embed/${id}`;
  }

  // Vimeo
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    if (url.pathname.startsWith("/video/")) return url.toString();
  }
  if (host === "player.vimeo.com") return url.toString();

  // Dailymotion
  if (host === "dailymotion.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "video" && parts[1]) return `https://www.dailymotion.com/embed/video/${parts[1]}`;
    if (parts[0] === "embed") return url.toString();
  }

  // Provider generik (mis. domain.com/e/xxxxx) -- dipakai apa adanya
  // selama berupa URL https/http yang valid. Admin bertanggung jawab
  // menempelkan link embed yang benar dari provider masing-masing.
  if (url.protocol === "https:" || url.protocol === "http:") {
    return url.toString();
  }

  return null;
}
