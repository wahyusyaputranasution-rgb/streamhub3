// public/js/admin-login.js

(() => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");

  // Bila sudah login, langsung arahkan ke dashboard
  Utils.api("/api/auth/check")
    .then(() => (window.location.href = "/admin/dashboard/"))
    .catch(() => {});

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.style.display = "none";
    loginBtn.disabled = true;
    loginBtn.textContent = "Memproses...";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      await Utils.api("/api/auth/login", { method: "POST", body: { username, password } });
      window.location.href = "/admin/dashboard/";
    } catch (err) {
      errorBox.textContent = err.message || "Login gagal";
      errorBox.style.display = "block";
      loginBtn.disabled = false;
      loginBtn.textContent = "Masuk";
    }
  });
})();
