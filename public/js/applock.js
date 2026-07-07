// public/js/applock.js
// Kunci PIN untuk seluruh aplikasi. Script ini HARUS dimuat sedini mungkin
// (baris pertama di <body>) supaya overlay kunci menutupi konten sebelum
// sempat terlihat oleh mata pengguna.
//
// Catatan jujur soal batas keamanannya: ini kunci di level aplikasi web
// (PIN & hash-nya tersimpan di penyimpanan browser/perangkat itu sendiri),
// bukan kunci level sistem operasi Android. Cukup untuk mencegah orang lain
// yang pinjam/pegang HP kamu buka aplikasi ini begitu saja, tapi bukan
// pengganti keamanan tingkat OS/APK asli.

(() => {
  const PIN_HASH_KEY = "applock_pin_hash";
  const RECOVERY_Q_KEY = "applock_recovery_q";
  const RECOVERY_A_HASH_KEY = "applock_recovery_a_hash";
  const UNLOCKED_KEY = "applock_unlocked";

  // Sudah unlock di sesi ini (sejak app dibuka) -> tidak perlu tampilkan apa pun
  if (sessionStorage.getItem(UNLOCKED_KEY) === "1") return;

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const style = document.createElement("style");
  style.textContent = `
    #applock-overlay {
      position: fixed; inset: 0; z-index: 999999;
      background: #0b0c10;
      display: flex; align-items: center; justify-content: center;
      font-family: "Segoe UI", Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #e9e9ef;
    }
    #applock-box { width: 100%; max-width: 320px; padding: 24px; text-align: center; }
    #applock-box .lock-icon {
      width: 56px; height: 56px; margin: 0 auto 16px;
      border-radius: 50%; background: rgba(255,56,96,0.12);
      display: flex; align-items: center; justify-content: center;
    }
    #applock-box h1 { font-size: 1.15rem; margin: 0 0 6px; }
    #applock-box p.sub { color: #9a9db0; font-size: 0.82rem; margin: 0 0 22px; }
    #applock-dots { display: flex; justify-content: center; gap: 12px; margin-bottom: 24px; }
    #applock-dots span {
      width: 14px; height: 14px; border-radius: 50%;
      border: 1px solid #262836; background: transparent; transition: all .15s ease;
    }
    #applock-dots span.filled { background: #ff3860; border-color: #ff3860; }
    #applock-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    #applock-keypad button {
      padding: 16px 0; font-size: 1.1rem; border-radius: 10px;
      border: 1px solid #262836; background: #181a23; color: #e9e9ef;
    }
    #applock-keypad button:active { background: #20222e; }
    #applock-keypad button.wide { grid-column: span 1; }
    #applock-error { color: #ff3860; font-size: 0.82rem; min-height: 18px; margin-bottom: 8px; }
    #applock-box .link-btn {
      background: none; border: none; color: #9a9db0; font-size: 0.8rem;
      margin-top: 16px; text-decoration: underline;
    }
    #applock-box input[type="text"] {
      width: 100%; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px;
      border: 1px solid #262836; background: #14151c; color: #e9e9ef; font-size: 0.9rem;
    }
    #applock-box .btn-primary {
      width: 100%; padding: 11px; border-radius: 8px; border: 1px solid #ff3860;
      background: #ff3860; color: #fff; font-size: 0.9rem; margin-top: 6px;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "applock-overlay";
  document.documentElement.appendChild(overlay);

  function lockIconSvg() {
    return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff3860" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  }

  function render(html) {
    overlay.innerHTML = `<div id="applock-box">${html}</div>`;
  }

  function keypadHtml() {
    return `
      <div id="applock-dots"></div>
      <div id="applock-error"></div>
      <div id="applock-keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}">${n}</button>`).join("")}
        <button data-key="clear">Hapus</button>
        <button data-key="0">0</button>
        <button data-key="back">⌫</button>
      </div>
    `;
  }

  function attachKeypad(maxLen, onComplete) {
    let value = "";
    const dotsEl = overlay.querySelector("#applock-dots");
    function renderDots() {
      dotsEl.innerHTML = Array.from({ length: maxLen })
        .map((_, i) => `<span class="${i < value.length ? "filled" : ""}"></span>`)
        .join("");
    }
    renderDots();
    overlay.querySelector("#applock-keypad").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const key = btn.dataset.key;
      if (key === "back") value = value.slice(0, -1);
      else if (key === "clear") value = "";
      else if (value.length < maxLen) value += key;
      renderDots();
      if (value.length === maxLen) {
        onComplete(value, () => {
          value = "";
          renderDots();
        });
      }
    });
  }

  function showError(msg) {
    const el = overlay.querySelector("#applock-error");
    if (el) el.textContent = msg;
  }

  // ---------- Layar buka kunci (PIN sudah ada) ----------
  async function showUnlockScreen() {
    render(`
      <div class="lock-icon">${lockIconSvg()}</div>
      <h1>StreamHub Terkunci</h1>
      <p class="sub">Masukkan PIN untuk membuka aplikasi</p>
      ${keypadHtml()}
      <button class="link-btn" id="applock-forgot">Lupa PIN?</button>
    `);
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    attachKeypad(getPinLength(), async (value, reset) => {
      const hash = await sha256(value);
      if (hash === storedHash) {
        sessionStorage.setItem(UNLOCKED_KEY, "1");
        overlay.remove();
      } else {
        showError("PIN salah, coba lagi.");
        reset();
      }
    });
    overlay.querySelector("#applock-forgot").addEventListener("click", showRecoveryScreen);
  }

  function getPinLength() {
    const len = localStorage.getItem("applock_pin_length");
    return len ? parseInt(len, 10) : 4;
  }

  // ---------- Layar setup PIN pertama kali ----------
  function showSetupScreen() {
    let firstPin = null;
    const pinLength = 4;

    function askFirst() {
      render(`
        <div class="lock-icon">${lockIconSvg()}</div>
        <h1>Buat PIN Keamanan</h1>
        <p class="sub">Buat PIN ${pinLength} digit untuk mengunci aplikasi ini</p>
        ${keypadHtml()}
      `);
      attachKeypad(pinLength, (value, reset) => {
        firstPin = value;
        askConfirm();
      });
    }

    function askConfirm() {
      render(`
        <div class="lock-icon">${lockIconSvg()}</div>
        <h1>Ulangi PIN</h1>
        <p class="sub">Masukkan sekali lagi untuk konfirmasi</p>
        ${keypadHtml()}
      `);
      attachKeypad(pinLength, (value, reset) => {
        if (value === firstPin) {
          askRecoveryQuestion();
        } else {
          showError("PIN tidak cocok, ulangi dari awal.");
          setTimeout(askFirst, 900);
        }
      });
    }

    function askRecoveryQuestion() {
      render(`
        <div class="lock-icon">${lockIconSvg()}</div>
        <h1>Pertanyaan Keamanan</h1>
        <p class="sub">Untuk jaga-jaga kalau PIN lupa. Isi pertanyaan & jawaban yang hanya Anda tahu.</p>
        <input type="text" id="applock-q" placeholder="Contoh: Nama hewan peliharaan pertama?">
        <input type="text" id="applock-a" placeholder="Jawaban">
        <button class="btn-primary" id="applock-save">Simpan & Kunci</button>
      `);
      document.getElementById("applock-save").addEventListener("click", async () => {
        const q = document.getElementById("applock-q").value.trim();
        const a = document.getElementById("applock-a").value.trim();
        if (!q || !a) {
          alert("Pertanyaan dan jawaban wajib diisi.");
          return;
        }
        const pinHash = await sha256(firstPin);
        const aHash = await sha256(a.toLowerCase());
        localStorage.setItem(PIN_HASH_KEY, pinHash);
        localStorage.setItem("applock_pin_length", String(pinLength));
        localStorage.setItem(RECOVERY_Q_KEY, q);
        localStorage.setItem(RECOVERY_A_HASH_KEY, aHash);
        sessionStorage.setItem(UNLOCKED_KEY, "1");
        overlay.remove();
      });
    }

    askFirst();
  }

  // ---------- Layar lupa PIN ----------
  function showRecoveryScreen() {
    const question = localStorage.getItem(RECOVERY_Q_KEY);
    if (!question) {
      render(`
        <div class="lock-icon">${lockIconSvg()}</div>
        <h1>Tidak Ada Pemulihan</h1>
        <p class="sub">PIN ini dibuat tanpa pertanyaan keamanan. Hapus data situs lewat
        pengaturan browser/HP (Setelan Aplikasi &rarr; StreamHub &rarr; Hapus Data) untuk reset total.</p>
        <button class="link-btn" id="applock-back">&larr; Kembali</button>
      `);
      document.getElementById("applock-back").addEventListener("click", showUnlockScreen);
      return;
    }

    render(`
      <div class="lock-icon">${lockIconSvg()}</div>
      <h1>Lupa PIN</h1>
      <p class="sub">${question}</p>
      <input type="text" id="applock-answer" placeholder="Jawaban Anda">
      <button class="btn-primary" id="applock-verify">Verifikasi</button>
      <div id="applock-error" style="margin-top:10px;"></div>
      <button class="link-btn" id="applock-back">&larr; Kembali</button>
    `);

    document.getElementById("applock-back").addEventListener("click", showUnlockScreen);
    document.getElementById("applock-verify").addEventListener("click", async () => {
      const answer = document.getElementById("applock-answer").value.trim().toLowerCase();
      const hash = await sha256(answer);
      if (hash === localStorage.getItem(RECOVERY_A_HASH_KEY)) {
        localStorage.removeItem(PIN_HASH_KEY);
        localStorage.removeItem(RECOVERY_Q_KEY);
        localStorage.removeItem(RECOVERY_A_HASH_KEY);
        showSetupScreen();
      } else {
        showError("Jawaban salah.");
      }
    });
  }

  // ---------- Mulai ----------
  if (localStorage.getItem(PIN_HASH_KEY)) {
    showUnlockScreen();
  } else {
    showSetupScreen();
  }
})();
