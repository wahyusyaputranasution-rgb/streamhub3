// public/js/push.js
// Menampilkan tombol kecil "Aktifkan Notifikasi" (tidak memaksa, bisa ditutup).
// Kalau pengunjung setuju, subscribe ke Push API dan kirim datanya ke server.

(() => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const DISMISS_KEY = "push_prompt_dismissed";
  if (localStorage.getItem(DISMISS_KEY) === "1") return;
  if (Notification.permission === "denied") return;

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  function showPrompt() {
    if (Notification.permission === "granted") return; // sudah diizinkan sebelumnya, tidak perlu tanya lagi

    fetch("/api/settings/public")
      .then((res) => res.json())
      .then((payload) => {
        const settings = (payload && payload.data) || {};
        if (settings.feature_push_enabled === "0") return;
        renderPromptBar();
      })
      .catch(() => renderPromptBar());
  }

  function renderPromptBar() {
    const bar = document.createElement("div");
    bar.id = "push-prompt";
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#181a23;border:1px solid #262836;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);font-family:Segoe UI,Roboto,sans-serif;";
    bar.innerHTML = `
      <span style="font-size:1.3rem;">🔔</span>
      <span style="flex:1;color:#e9e9ef;font-size:0.85rem;">Aktifkan notifikasi biar tahu kalau ada video baru?</span>
      <button id="push-allow" style="background:#ff3860;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:0.82rem;">Aktifkan</button>
      <button id="push-dismiss" style="background:none;color:#9a9db0;border:none;font-size:0.82rem;padding:8px;">Nanti</button>
    `;
    document.body.appendChild(bar);

    document.getElementById("push-dismiss").addEventListener("click", () => {
      localStorage.setItem(DISMISS_KEY, "1");
      bar.remove();
    });

    document.getElementById("push-allow").addEventListener("click", async () => {
      bar.remove();
      await subscribeToPush();
    });
  }

  async function subscribeToPush() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyPayload = await keyRes.json();
      if (!keyPayload.success) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyPayload.data.publicKey),
      });

      const subJson = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });

      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Diamkan saja bila gagal (mis. browser tidak support, atau ditolak)
    }
  }

  window.addEventListener("load", () => {
    setTimeout(showPrompt, 2500); // beri jeda supaya tidak muncul instan mengganggu
  });
})();
