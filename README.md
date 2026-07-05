# StreamHub — Website Streaming Video di Cloudflare

Website streaming video modern yang berjalan sepenuhnya di **Cloudflare Workers (dengan Static Assets) + D1**.
Ini adalah model deploy terbaru Cloudflare (menggantikan Cloudflare Pages yang lama) — satu Worker
menyajikan file statis (HTML/CSS/JS) sekaligus menjalankan API backend.
Tidak menggunakan PHP, MySQL, Firebase, Supabase, maupun Cloudflare R2.

Thumbnail & video **tidak diupload**, cukup tempel URL (mis. dari imgur, TMDB, YouTube, Vimeo, dll).

> **Catatan:** Cloudflare Pages tidak dihapus, tapi sejak 2026 Cloudflare mengarahkan project baru untuk
> memakai "Workers with Static Assets", yang menyatukan hosting statis + backend dalam satu Worker.
> Karena itu struktur project ini memakai `src/index.js` sebagai satu entry point, bukan folder
> `functions/` ala Pages Functions yang lama.

---

## 1. Struktur Folder

```
project/
├── public/              # Semua file statis (disajikan langsung oleh Cloudflare)
│   ├── index.html        # Home
│   ├── watch/index.html  # Watch (?slug=xxx)
│   ├── search/index.html # Search realtime
│   ├── category/index.html
│   ├── admin/login/index.html
│   ├── admin/dashboard/index.html
│   ├── 404.html
│   ├── css/               # style.css (public) & admin.css (dashboard)
│   ├── js/                 # Semua logic frontend (per halaman)
│   └── robots.txt
├── src/
│   └── index.js          # Satu entry point Worker: routing /api/* + /sitemap.xml,
│                          # request lain otomatis jatuh ke file statis di public/
├── lib/                  # Kode bersama (auth, db, security, embed), dipakai src/index.js
├── database/
│   ├── schema.sql
│   └── seed.sql
├── wrangler.toml         # Konfigurasi Worker: main, assets, D1 binding, env vars
└── README.md
```

---

## 2. Cara Install

Tidak perlu `npm install` apa pun untuk deploy lewat GitHub — Cloudflare akan langsung clone repo,
lalu meng-upload folder `public/` sebagai file statis dan menjalankan `src/index.js` sebagai Worker.
Tidak ada langkah build tambahan.

Jika ingin coba jalankan/dev di komputer (bukan HP/Termux, karena `wrangler` butuh binary native
yang tidak tersedia di Android), install Wrangler CLI global:
```bash
npm install -g wrangler
```

---

## 3. Cara Membuat Database D1

1. Login ke akun Cloudflare via CLI:
   ```bash
   npx wrangler login
   ```
2. Buat database D1:
   ```bash
   npx wrangler d1 create streaming_db
   ```
   Perintah ini akan menampilkan `database_id`. Salin nilai tersebut ke file `wrangler.toml`
   pada bagian:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "streaming_db"
   database_id = "REPLACE_WITH_YOUR_DATABASE_ID"
   ```
3. Jalankan migrasi schema:
   ```bash
   # Untuk database remote (production)
   npx wrangler d1 execute streaming_db --remote --file=./database/schema.sql

   # Untuk testing lokal
   npx wrangler d1 execute streaming_db --local --file=./database/schema.sql
   ```
4. (Opsional) Isi data contoh:
   ```bash
   npx wrangler d1 execute streaming_db --remote --file=./database/seed.sql
   ```

---

## 4. Cara Deploy ke Cloudflare Workers

### Opsi A — Lewat Git (Cloudflare Dashboard, direkomendasikan)
1. Push seluruh folder project ini ke repository GitHub.
2. Isi `database_id` yang benar di `wrangler.toml` (lihat langkah 3 di atas) sebelum push,
   atau edit langsung di GitHub lalu commit.
3. Di Cloudflare Dashboard → **Workers & Pages → Create → Connect to Git** → pilih repo tersebut.
4. Cloudflare otomatis mendeteksi `wrangler.toml` dan akan:
   - Build command: (kosongkan / tidak perlu)
   - Deploy command: otomatis terisi `npx wrangler versions upload` — biarkan seperti ini,
     jangan diganti ke `wrangler pages deploy` (itu perintah khusus Pages, bukan Workers).
5. Setelah deployment pertama sukses, buka tab **Bindings** pada Worker tersebut untuk memastikan
   D1 binding `DB` → `streaming_db` sudah terhubung (biasanya otomatis terbaca dari `wrangler.toml`,
   tapi kalau tidak muncul, tambahkan manual: **Add binding → D1 database → Variable name: `DB`**).
6. Setiap kali push ke branch utama, Cloudflare otomatis build & deploy ulang.

### Opsi B — Lewat CLI (di komputer, bukan Termux/Android)
```bash
npx wrangler deploy
```
Wrangler akan membaca `wrangler.toml` dan otomatis meng-upload folder `public/` sebagai static
assets, mem-bundle `src/index.js` sebagai Worker, serta menghubungkan D1 binding sesuai konfigurasi.

> **Catatan untuk pengguna Termux/Android:** `wrangler` menyertakan komponen native (`workerd`)
> yang tidak punya build untuk Android ARM64, sehingga `npx wrangler deploy` **tidak bisa** dijalankan
> langsung dari Termux. Gunakan Opsi A (Git) yang menjalankan build di server Cloudflare, bukan di HP.

---

## 5. Cara Login Admin (Setup Awal)

Belum ada admin dibuat otomatis demi keamanan. Buat admin pertama dengan memanggil endpoint
`/api/auth/setup` **satu kali saja** setelah deploy (endpoint ini otomatis terkunci setelah
ada satu admin di database):

```bash
curl -X POST https://nama-worker-anda.workers.dev/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"PasswordKuatAnda123"}'
```

Setelah berhasil, buka `https://nama-worker-anda.workers.dev/admin/login/` dan login dengan
username & password tersebut. Password minimal 8 karakter dan di-hash dengan PBKDF2 + salt
sebelum disimpan — tidak pernah disimpan dalam bentuk plain text.

**Mengganti password:** hitung ulang hash lewat endpoint `/api/auth/setup` tidak bisa dipakai lagi
setelah admin ada. Cara paling sederhana adalah menghapus baris admin di tabel `admins` lewat
`wrangler d1 execute streaming_db --remote --command="DELETE FROM admins WHERE username='admin'"`
lalu panggil ulang `/api/auth/setup`.

---

## 6. Cara Menambah Video

1. Login ke `/admin/dashboard/`.
2. Buka tab **Video** → klik **+ Tambah Video**.
3. Isi:
   - **Judul** — slug URL dibuat otomatis dari judul (dan otomatis unik bila ada duplikat).
   - **Deskripsi**
   - **Kategori** — pilih dari daftar kategori yang sudah dibuat di tab Kategori.
   - **Link Embed** — tempel link video dari provider (YouTube, Vimeo, Dailymotion, atau
     link embed generik seperti `https://domain.com/e/abcdef`). Sistem otomatis menormalkan
     link YouTube/Vimeo/Dailymotion biasa menjadi bentuk embed yang benar.
   - **Link Thumbnail** — tempel URL gambar (mis. dari imgur atau `image.tmdb.org`). Tidak ada
     upload file, cukup URL.
   - **Status** — Draft (belum tampil ke publik) atau Publish.
   - **Tanggal Publish** — opsional, default waktu saat ini bila status Publish.
4. Klik **Simpan**. Video langsung tampil di Home/Kategori/Search bila statusnya Publish.

---

## 7. Cara Backup Database

Ekspor seluruh isi database ke file SQL:

```bash
npx wrangler d1 export streaming_db --remote --output=backup.sql
```

Untuk restore ke database baru:

```bash
npx wrangler d1 execute streaming_db --remote --file=./backup.sql
```

Disarankan menjadwalkan backup berkala (mis. lewat cron di CI/CD Anda) karena Cloudflare D1
tidak menyediakan backup otomatis bawaan.

---

## 8. Keamanan yang Sudah Diterapkan

- **Validasi & sanitasi input** di setiap endpoint (`lib/security.js`, `sanitizeText`, `isSafeUrl`).
- **Proteksi XSS**: semua teks yang ditampilkan di-escape (`escapeHtml` di frontend & backend),
  serta header `X-Content-Type-Options`, `X-Frame-Options`.
- **CSRF Protection**: setiap request yang mengubah data (POST/PUT/DELETE) di panel admin wajib
  menyertakan header `X-CSRF-Token` yang cocok dengan token sesi aktif di D1.
- **Session admin**: cookie `HttpOnly`, `Secure`, `SameSite=Strict`, kedaluwarsa otomatis 7 hari.
- **Password hashing**: PBKDF2 (100.000 iterasi) + salt unik per admin, tanpa dependency eksternal.
- **Rate limiting**:
  - Login dibatasi 5 percobaan / 15 menit per IP (IP disimpan dalam bentuk hash, bukan mentah).
  - View counter dibatasi 1 hitungan / video / IP / 30 menit untuk mencegah spam refresh.
- **SQL Injection**: seluruh query memakai prepared statement D1 (`bind`), tidak ada string
  concatenation SQL.

---

## 9. Catatan Provider Embed

Field **Link Embed** menerima:
- Link YouTube biasa (`youtube.com/watch?v=...`, `youtu.be/...`) → otomatis dikonversi ke `/embed/...`
- Link Vimeo biasa (`vimeo.com/12345`) → otomatis dikonversi ke `player.vimeo.com/video/12345`
- Link Dailymotion biasa → otomatis dikonversi ke bentuk embed
- Link embed generik dari provider lain, mis. `https://domain.com/e/abcdef` → dipakai apa adanya
  selama berupa URL `http`/`https` yang valid.

---

## 10. Pengembangan Lokal

```bash
npx wrangler dev
```

Ini menjalankan Worker secara lokal (termasuk static assets & binding D1 lokal), lengkap dengan
hot-reload. Tidak bisa dijalankan dari Termux/Android karena keterbatasan `workerd` di atas.
