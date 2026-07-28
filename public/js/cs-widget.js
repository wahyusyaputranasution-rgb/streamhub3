// public/js/cs-widget.js
// Widget chat mengambang di pojok bawah. Modenya diatur lewat dashboard admin
// (tab Pengaturan > Widget Chat) — HANYA salah satu yang aktif dalam satu waktu:
// "none" (tidak ada), "cs" (tombol Customer Service sendiri), atau
// "livechat" (widget dari livechat.com).

(() => {
  function renderCsButton(csLink, csLabel) {
    if (!csLink) return;

    const wrap = document.createElement("div");
    wrap.id = "cs-widget";
    wrap.style.cssText =
      "position:fixed;right:16px;bottom:90px;z-index:9998;display:flex;align-items:center;gap:8px;font-family:Segoe UI,Roboto,sans-serif;";

    if (csLabel) {
      const label = document.createElement("span");
      label.textContent = csLabel;
      label.style.cssText =
        "background:#181a23;color:#e9e9ef;border:1px solid #262836;padding:8px 12px;border-radius:8px;font-size:0.8rem;box-shadow:0 4px 14px rgba(0,0,0,0.3);white-space:nowrap;";
      wrap.appendChild(label);
    }

    const btn = document.createElement("a");
    btn.href = csLink;
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btn.setAttribute("aria-label", "Customer Service");
    btn.style.cssText =
      "width:52px;height:52px;border-radius:50%;background:#ff3860;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,56,96,0.4);flex-shrink:0;";
    btn.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    wrap.appendChild(btn);

    document.body.appendChild(wrap);
  }

  function renderLiveChatWidget(license) {
    if (!license) return;

    // Kode resmi widget LiveChat (www.livechat.com), license number diambil
    // dari pengaturan dashboard, bukan hardcode.
    window.__lc = window.__lc || {};
    window.__lc.license = Number(license);
    window.__lc.integration_name = "manual_channels";
    window.__lc.product_name = "livechat";
    (function (n, t, c) {
      function i(n) {
        return e._h ? e._h.apply(null, n) : e._q.push(n);
      }
      var e = {
        _q: [],
        _h: null,
        _v: "2.0",
        on: function () {
          i(["on", c.call(arguments)]);
        },
        once: function () {
          i(["once", c.call(arguments)]);
        },
        off: function () {
          i(["off", c.call(arguments)]);
        },
        get: function () {
          if (!e._h) throw new Error("[LiveChatWidget] You can't use getters before load.");
          return i(["get", c.call(arguments)]);
        },
        call: function () {
          i(["call", c.call(arguments)]);
        },
        init: function () {
          var n = t.createElement("script");
          (n.async = true), (n.type = "text/javascript"), (n.src = "https://cdn.livechatinc.com/tracking.js"), t.head.appendChild(n);
        },
      };
      !n.__lc.asyncInit && e.init(), (n.LiveChatWidget = n.LiveChatWidget || e);
    })(window, document, [].slice);
  }

  async function init() {
    try {
      const res = await fetch("/api/settings/public");
      const payload = await res.json();
      if (!payload.success) return;

      const settings = payload.data;
      // Default "livechat" kalau belum pernah diatur dari dashboard
      const mode = settings.chat_widget_mode || "livechat";

      if (mode === "cs") {
        renderCsButton(settings.cs_link, settings.cs_label);
      } else if (mode === "livechat") {
        renderLiveChatWidget(settings.livechat_license || "19867789");
      }
      // mode === "none" -> tidak render apa pun
    } catch {
      // Diamkan saja bila gagal memuat pengaturan widget chat
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
