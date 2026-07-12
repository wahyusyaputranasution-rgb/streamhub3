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
3. Jalankan schema:
   ```bash
   # Untuk database remote (production)
   npx wrangler d1 execute streaming_db --remote --file=./database/schema.sql

   # Untuk testing lokal
   npx wrangler d1 execute streaming_db --local --file=./database/schema.sql
   ```
   `schema.sql` aman dijalankan berkali-kali (memakai `CREATE TABLE IF NOT EXISTS`) — tidak akan
   menghapus data yang sudah ada bila Anda menjalankannya ulang di database yang sudah terisi,
   misalnya setelah update project ke versi yang lebih baru (mis. menambah fitur Kelola Iklan).

   Jika Anda hanya ingin menambahkan tabel iklan (`ad_zones`) ke database yang sudah berjalan
   tanpa menyentuh apa pun yang lain, bisa juga jalankan file migrasi khusus:
   ```bash
   npx wrangler d1 execute streaming_db --remote --file=./database/migration_ads.sql
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

## 11. Cara Memasang Iklan (Adsterra, dll)

Situs ini punya sistem **Kelola Iklan** bawaan di dashboard admin — tidak perlu edit kode atau
upload ulang untuk menambah/mengganti iklan.

1. Login ke `/admin/dashboard/`, buka tab **Iklan**.
2. Klik **+ Tambah Zona Iklan**.
3. Isi:
   - **Nama Zona** — nama bebas untuk referensi Anda sendiri (mis. "Adsterra Banner Home").
   - **Penempatan** — pilih lokasi tayang:
     - `Global` — dimuat di semua halaman publik, cocok untuk format Popunder/Social Bar.
     - `Home - atas` / `Home - tengah` — di halaman Home.
     - `Watch - bawah player` / `Watch - sidebar` — di halaman Watch.
     - `Kategori - atas`, `Search - atas` — di halaman masing-masing.
   - **Kode Iklan** — paste utuh kode `<script>`/HTML dari dashboard Adsterra (atau provider lain).
   - **Aktifkan iklan ini** — centang untuk langsung tayang, atau uncheck untuk simpan sebagai draft.
4. Simpan. Iklan langsung muncul di lokasi yang dipilih tanpa perlu deploy ulang.
5. Untuk menonaktifkan sementara, edit zona iklan tersebut dan hilangkan centang "Aktifkan".

**Catatan keamanan:** kode di kolom ini dieksekusi apa adanya di browser pengunjung (persis seperti
cara kerja iklan pada umumnya). Hanya tempel kode dari provider iklan yang Anda percaya (mis. akun
Adsterra Anda sendiri) — jangan tempel kode dari sumber yang tidak jelas.

**ads.txt:** jika provider iklan Anda meminta verifikasi lewat file `ads.txt`, edit file
`public/ads.txt` sesuai instruksi dari dashboard provider tersebut, lalu commit & deploy ulang.

---

## 13. Kunci PIN Aplikasi (App Lock)

Seluruh aplikasi (semua halaman publik + admin) dilindungi layar kunci PIN yang muncul setiap
kali aplikasi dibuka dari awal (tab/sesi baru).

**Cara kerja:**
- Saat pertama kali dibuka, pengunjung akan diminta membuat PIN 4 digit + 1 pertanyaan keamanan
  (untuk jaga-jaga kalau PIN lupa).
- Setelah itu, setiap kali aplikasi dibuka ulang (mis. lewat ikon di homescreen), akan muncul
  layar minta PIN sebelum bisa melihat konten apa pun.
- Selama sesi masih terbuka (belum ditutup total), berpindah antar halaman tidak akan
  meminta PIN berulang kali.
- Lupa PIN bisa direset lewat pertanyaan keamanan yang dibuat di awal.

**Penting — batasan keamanan:** PIN dan hash-nya tersimpan di penyimpanan browser/perangkat itu
sendiri (localStorage), bukan di server. Ini cukup untuk mencegah orang lain yang meminjam HP
Anda membuka aplikasi ini begitu saja, tapi **bukan pengganti keamanan tingkat sistem operasi
atau aplikasi native (.apk)** — pengguna yang cukup teknis (mis. lewat DevTools browser) masih
bisa melewatinya. Untuk konten yang benar-benar sensitif, tetap andalkan proteksi login admin
di sisi server (`/api/auth/*`), yang jauh lebih kuat karena divalidasi di backend.

**Reset PIN paksa (kalau perlu, mis. lupa jawaban keamanan juga):** pengguna bisa menghapus
data situs lewat Setelan Aplikasi di HP (Settings → Apps → StreamHub / Chrome → Storage →
Clear Data), lalu PIN akan diminta dibuat ulang dari awal.

---

## 15. Fitur Tambahan: Multi-Admin, Ganti Password, Import CSV, Statistik Iklan

**Ganti Password** — tab Pengaturan → isi password saat ini + password baru (minimal 8 karakter).

**Multi-Admin** — tab Pengaturan → bagian "Kelola Admin" → **+ Tambah Admin** untuk menambah akun
admin lain. Tidak bisa menghapus akun yang sedang login atau admin terakhir yang tersisa (supaya
tidak ada yang terkunci total dari dashboard).

**Import Video Massal via CSV** — tab Video → **Import CSV**. Format kolom (baris pertama harus
persis header ini):
```
title,description,category_name,embed_url,thumbnail_url,status,publish_date
```
- `status` diisi `draft` atau `published`.
- `category_name` boleh kosong; kalau diisi dan kategorinya belum ada, otomatis dibuat.
- `publish_date` boleh kosong (format ISO kalau diisi, mis. `2026-07-01T10:00:00`).
- Bisa upload file `.csv` langsung atau paste isinya ke kotak teks.
- Proses berjalan satu per satu dan menampilkan progress + jumlah berhasil/gagal di akhir.

**Statistik Impresi Iklan** — tab Iklan sekarang menampilkan kolom **Impresi**, dihitung otomatis
setiap kali zona iklan tersebut berhasil dimuat/tampil ke pengunjung (untuk placement banner/global)
atau saat smartlink benar-benar dibuka (untuk placement "Kategori - Smartlink saat diklik").

**Migrasi database yang diperlukan:** fitur statistik impresi butuh kolom baru di tabel `ad_zones`.
Jika database Anda sudah berjalan sebelum fitur ini ada, jalankan sekali:
```bash
wrangler d1 execute streaming_db --remote --file=./database/migration_v2.sql
```
Fitur ganti password & multi-admin **tidak butuh migrasi apa pun** (memakai tabel `admins` yang
sudah ada sejak awal).

---

## 17. Push Notification

Aplikasi ini bisa mengirim notifikasi ke HP pengunjung **walau aplikasinya sedang tertutup**,
mirip seperti notifikasi WhatsApp — memakai Web Push standar (bukan Firebase/OneSignal).

**Cara kerja untuk pengunjung:**
- Beberapa detik setelah membuka situs, muncul kotak kecil di bawah layar: "Aktifkan notifikasi
  biar tahu kalau ada video baru?" — bisa diterima atau ditutup ("Nanti").
- Kalau diterima, browser akan minta izin notifikasi (standar Android/Chrome), lalu perangkat
  terdaftar untuk menerima notifikasi ke depannya.

**Cara admin mengirim notifikasi:**
1. Login ke `/admin/dashboard/` → tab **Pengaturan** → bagian **"Kirim Push Notification"**
2. Isi Judul, Isi pesan, dan (opsional) halaman yang dibuka saat notifikasi diklik
   (mis. `/watch/?slug=nama-video`)
3. Klik **Kirim Notifikasi** — akan terkirim ke semua pengunjung yang sudah mengaktifkan

**VAPID Keys (kunci identitas server untuk push):** sudah digenerate otomatis dan tersimpan di
`wrangler.toml` (`VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY_JWK`). Ganti `VAPID_SUBJECT` dengan
email Anda sendiri (`mailto:email-anda@domain.com`) — ini kontak yang dilihat Google/Chrome kalau
ada masalah dengan server push Anda.

**Catatan keamanan:** `VAPID_PRIVATE_KEY_JWK` bersifat rahasia (bisa dipakai memalsukan
notifikasi "dari" server Anda kalau bocor). Menyimpannya di `wrangler.toml` yang ikut ter-commit
ke Git itu **praktis tapi kurang ideal**. Kalau repo Anda publik atau ingin lebih aman, pindahkan
nilai `VAPID_PRIVATE_KEY_JWK` ke **Cloudflare Dashboard → Worker Anda → Settings → Variables and
secrets → Add → tipe "Secret"** (bukan Variable biasa), lalu hapus baris itu dari `wrangler.toml`.

**Migrasi database yang diperlukan** (aman, tidak menyentuh tabel lain):
```bash
wrangler d1 execute streaming_db --remote --file=./database/migration_push.sql
```

**Batasan yang perlu diketahui:**
- Notifikasi hanya sampai ke pengunjung yang sempat klik "Aktifkan" — tidak otomatis ke semua orang.
- Beberapa bulan tidak aktif, langganan push di sisi Google/Chrome bisa kedaluwarsa dengan
  sendirinya (di luar kendali aplikasi ini) — sistem otomatis membersihkan langganan yang sudah
  tidak valid dari database saat gagal terkirim.
- Fitur ini memakai enkripsi Web Push standar industri (RFC 8291/8292) yang sudah diuji lewat
  simulasi encrypt-decrypt sebelum dipasang, tapi pengujian akhir tetap perlu dilakukan langsung
  di HP setelah deploy, karena tidak bisa diuji dari lingkungan pengembangan tanpa akses internet
  penuh ke server push Google.

---

## 19. Upload Thumbnail dari Dashboard

Selain menempel URL gambar, sekarang admin juga bisa **upload foto langsung dari HP** untuk
dijadikan thumbnail video.

**Cara pakai:**
1. Di form Tambah/Edit Video, klik tombol **"Upload dari HP"** di bawah kolom Link Thumbnail
2. Pilih foto dari galeri
3. Foto otomatis dikompres (dikecilkan ke maks lebar 640px, kualitas JPEG 75%) di HP sebelum
   dikirim, supaya hemat kuota & ruang penyimpanan
4. Setelah berhasil, kolom Link Thumbnail otomatis terisi dengan URL upload-nya, dan muncul preview

**Kenapa disimpan di D1, bukan R2:** sesuai desain awal project ini (tanpa Cloudflare R2), gambar
yang diupload disimpan sebagai data di database D1 (tabel `uploads`), lalu disajikan lewat URL
`/uploads/<id>`. Ini praktis dan tidak butuh binding tambahan, tapi ada batasannya:

- **Maksimal 800KB per gambar** (setelah kompresi otomatis) — cukup untuk thumbnail biasa
- Cocok untuk jumlah video yang wajar (puluhan-ratusan). Untuk situs dengan **ribuan** video,
  pertimbangkan tetap pakai URL eksternal (imgur, TMDB, dll) supaya tidak membebani kuota
  penyimpanan D1 (gratis hingga 5GB per database di paket Cloudflare Free)
- Upload lewat form tetap **opsional** — menempel URL manual seperti biasa masih bisa dipakai
  kapan saja, keduanya saling melengkapi

**Migrasi database yang diperlukan** (aman, tidak menyentuh tabel lain):
```bash
wrangler d1 execute streaming_db --remote --file=./database/migration_uploads.sql
```

---

## 21. Statistik Pengguna & Perangkat (Install, Online/Offline)

Dashboard admin (tab **Dashboard**) sekarang menampilkan panel **"Pengguna & Perangkat"**:

- **Total Perangkat** — jumlah perangkat unik (anonim, tanpa akun/login) yang pernah membuka situs
- **Terinstall sebagai App** — berapa dari perangkat itu yang membuka situs dalam mode "terinstall"
  (lewat ikon di homescreen, bukan tab browser biasa)
- **🟢 Online Sekarang** — perangkat yang aktif dalam 60 detik terakhir
- **⚪ Offline** — sisanya

Update otomatis tiap 10 detik selama tab Dashboard sedang dibuka.

**Cara kerja (jujur soal batasannya):**
- Setiap pengunjung dapat ID acak yang disimpan di `localStorage` HP mereka (tidak ada data
  pribadi yang dikumpulkan). ID ini "berdenyut" (heartbeat) ke server tiap ~25 detik selagi
  situsnya terbuka.
- "Online" berarti heartbeat terakhir kurang dari 60 detik lalu — ini **perkiraan**, bukan
  real-time sempurna (beda dengan status online WhatsApp yang pakai koneksi terus-menerus).
- "Terinstall" dideteksi dari mode tampilan browser (`display-mode: standalone`) — cukup akurat
  di Android Chrome, kurang konsisten di sebagian browser/iOS.
- Kalau pengunjung hapus data browser / uninstall, ID lama tidak otomatis hilang dari database
  (dianggap "offline" selamanya, tapi tetap terhitung di "Total Perangkat" kecuali dibersihkan
  manual lewat D1 Console).

**Migrasi database yang diperlukan** (aman, tidak menyentuh tabel lain):
```bash
wrangler d1 execute streaming_db --remote --file=./database/migration_devices.sql
```

---

## 22. Dashboard Admin sebagai App Terpisah (Install dari Homescreen)

Dashboard admin sekarang punya `manifest.json` sendiri (`public/admin/manifest.json`) dan service
worker sendiri (`public/admin/sw-admin.js`), terpisah dari situs publik. Ini membuat panel admin
bisa **di-install sebagai app tersendiri** dengan ikon & nama sendiri ("StreamHub Admin"),
terpisah dari ikon situs publik ("StreamHub").

**Cara install:**
1. Buka `/admin/login/` atau `/admin/dashboard/` di Chrome Android
2. Tap menu titik tiga (⋮) → **"Tambahkan ke Layar Utama"** / **"Install App"**
3. Muncul ikon "StreamHub Admin" terpisah di homescreen, langsung membuka ke dashboard

**Catatan jujur:** ini tetap **PWA (aplikasi web yang di-install)**, bukan file `.apk` asli yang
di-compile. Membuat `.apk` sungguhan butuh Android Studio/Gradle (toolchain khusus) yang tidak
bisa dijalankan dari lingkungan pengembangan mobile-only seperti Termux. Dari sisi pengalaman
pakai (ikon di homescreen, buka tanpa address bar, terasa seperti app), hasilnya mirip — tapi
secara teknis tetap web app, bukan aplikasi native Android.

---

## 24. Perbaikan PIN: Hanya Aktif Kalau Aplikasi Ter-install

Sebelumnya, kunci PIN muncul untuk **siapa saja** yang membuka situs, termasuk teman yang cuma
buka link video yang Anda bagikan lewat browser biasa — ini sudah diperbaiki.

**Sekarang:** PIN **hanya** muncul kalau situs dibuka dalam mode "terinstall" (dari ikon di
homescreen setelah di-install sebagai PWA). Kalau dibuka lewat tab browser biasa (link yang
dibagikan ke teman, hasil pencarian Google, dll), **tidak ada PIN sama sekali** — langsung bisa
nonton seperti situs normal.

Ini cocok untuk skenario: Anda install aplikasinya sendiri di HP (dikunci PIN, privasi Anda),
sementara video yang Anda bagikan ke orang lain tetap bisa diakses bebas tanpa PIN.

---

## 25. Pengaturan Website Terhubung ke Dashboard (Customer Service)

Sekarang ada sistem **Pengaturan Website** generik yang bisa diubah lewat dashboard tanpa perlu
edit kode atau deploy ulang — dimulai dengan pengaturan tombol Customer Service.

**Cara pakai:**
1. Login dashboard → tab **Pengaturan** → bagian **"Pengaturan Website"**
2. Centang **"Tampilkan tombol Customer Service mengambang"**
3. Isi **Link Customer Service** — bisa link WhatsApp (`https://wa.me/62812xxxxxxx`), Telegram,
   atau link kontak apa pun
4. Isi **Label** (opsional) — teks kecil yang muncul di sebelah tombol, mis. "Butuh bantuan?"
5. Simpan

Tombol mengambang otomatis muncul di pojok kanan bawah semua halaman publik (Home, Watch, Search,
Kategori), langsung terhubung ke pengaturan di dashboard — matikan/ubah link kapan saja tanpa
deploy ulang.

**Migrasi database yang diperlukan** (aman, tidak menyentuh tabel lain):
```bash
wrangler d1 execute streaming_db --remote --file=./database/migration_settings.sql
```

---

## 27. Automasi: Auto-Publish Terjadwal + Auto-post Telegram

### Auto-Publish Terjadwal

Video berstatus **Draft** dengan **Tanggal Publish** yang sudah lewat akan otomatis berubah jadi
**Published** setiap 5 menit, lewat fitur **Cloudflare Cron Trigger** (sudah dikonfigurasi di
`wrangler.toml`, tidak perlu setup tambahan apa pun).

**Cara pakai:**
1. Buat video seperti biasa, isi **Tanggal Publish** dengan tanggal/jam di masa depan
2. Set status **Draft**
3. Simpan — video akan otomatis jadi Published begitu waktunya tiba (dalam 5 menit setelah
   waktu itu lewat, sesuai jadwal cron)

**Untuk testing** (tidak perlu menunggu jadwal cron): dashboard → tab Pengaturan → panel
**"Auto-Publish Terjadwal"** → klik **"Jalankan Auto-Publish Sekarang"**.

### Auto-post ke Telegram

Setiap video yang jadi **Published** (baik manual atau lewat auto-publish di atas) otomatis
dikirim sebagai pesan ke channel/grup Telegram Anda (judul + deskripsi + thumbnail + link nonton).
Setiap video hanya dikirim **sekali** (tidak berulang kalau videonya diedit lagi setelah publish).

**Cara membuat Bot Telegram (gratis, 2 menit):**
1. Buka Telegram, cari **@BotFather**, mulai chat
2. Kirim `/newbot`, ikuti instruksinya (kasih nama & username bot)
3. BotFather akan kasih **Bot Token**, bentuknya seperti `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxx`
   — copy ini

**Cara mendapatkan Chat ID:**
- **Untuk channel:** tambahkan bot Anda sebagai admin di channel tersebut. Chat ID channel biasanya
  berbentuk `-100xxxxxxxxxx` (bisa dicek lewat bot seperti @username_to_id_bot, atau lewat API
  `https://api.telegram.org/bot<TOKEN>/getUpdates` setelah kirim pesan apa saja ke channel)
- **Untuk grup:** tambahkan bot ke grup, kirim pesan apa saja di grup, lalu buka
  `https://api.telegram.org/bot<TOKEN>/getUpdates` di browser — cari nilai `"chat":{"id": ...}`
- **Untuk chat pribadi dengan bot:** mulai chat dengan bot Anda, kirim `/start`, lalu cek endpoint
  `getUpdates` yang sama

**Cara aktifkan di StreamHub:**
1. Dashboard → tab Pengaturan → panel **"Integrasi Telegram"**
2. Centang **"Aktifkan auto-post ke Telegram"**
3. Isi **Bot Token** dan **Chat ID**
4. Simpan

**Migrasi database yang diperlukan** (aman, tidak menyentuh data video/kategori yang sudah ada):
```bash
wrangler d1 execute streaming_db --remote --file=./database/migration_automation.sql
```
(Butuh juga tabel `settings` dari migrasi sebelumnya — kalau belum pernah dijalankan, jalankan
`migration_settings.sql` terlebih dulu.)

**Catatan keamanan:** Bot Token bersifat rahasia (bisa dipakai kirim pesan "atas nama" bot Anda
kalau bocor). Tersimpan di database D1, hanya bisa dibaca lewat endpoint yang wajib login admin.

---

## 28. Pengembangan Lokal

```bash
npx wrangler dev
```

Ini menjalankan Worker secara lokal (termasuk static assets & binding D1 lokal), lengkap dengan
hot-reload. Tidak bisa dijalankan dari Termux/Android karena keterbatasan `workerd` di atas.
