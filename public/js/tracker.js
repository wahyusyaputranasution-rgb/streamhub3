// public/js/tracker.js
// Tracking anonim (tanpa login/akun) untuk statistik jumlah perangkat,
// berapa yang menginstall sebagai app, dan status online/offline di dashboard admin.
// Tidak mengumpulkan data pribadi apa pun — hanya ID acak per perangkat.

(() => {
  const DEVICE_ID_KEY = "streamhub_device_id";
  const HEARTBEAT_INTERVAL_MS = 25000; // di bawah threshold "online" 60 detik di server

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function isRunningInstalled() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true // iOS Safari
    );
  }

  let trackingEnabled = true;

  async function checkTrackingEnabled() {
    try {
      const res = await fetch("/api/settings/public");
      const payload = await res.json();
      const settings = (payload && payload.data) || {};
      trackingEnabled = settings.feature_tracking_enabled !== "0";
    } catch {
      trackingEnabled = true;
    }
  }

  function sendHeartbeat() {
    if (!trackingEnabled) return;
    const deviceId = getDeviceId();
    const installed = isRunningInstalled();
    fetch("/api/track/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, installed }),
      keepalive: true,
    }).catch(() => {});
  }

  checkTrackingEnabled().then(sendHeartbeat);
  setInterval(() => {
    if (!document.hidden) sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sendHeartbeat();
  });

  // Kalau event 'appinstalled' terpicu (Android Chrome), langsung catat sebagai terinstall
  window.addEventListener("appinstalled", () => {
    fetch("/api/track/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId(), installed: true }),
    }).catch(() => {});
  });
})();
