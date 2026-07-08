-- ============================================================
-- Schema database D1 untuk StreamHub
-- AMAN dijalankan berkali-kali / di database yang sudah berisi data —
-- semua perintah memakai "IF NOT EXISTS" sehingga tidak akan menghapus
-- atau menimpa tabel/data yang sudah ada.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/schema.sql
-- ============================================================

-- Admin yang bisa login ke dashboard
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sesi login admin (dipakai untuk cookie session + CSRF token)
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  admin_id    INTEGER NOT NULL,
  csrf_token  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- Kategori video
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Video
CREATE TABLE IF NOT EXISTS videos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT DEFAULT '',
  category_id   INTEGER,
  embed_url     TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  views         INTEGER NOT NULL DEFAULT 0,
  publish_date  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Log view untuk proteksi anti-spam refresh (rate limit view counter)
CREATE TABLE IF NOT EXISTS view_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   INTEGER NOT NULL,
  ip_hash    TEXT NOT NULL,
  viewed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Log percobaan login untuk rate limiting brute force
CREATE TABLE IF NOT EXISTS login_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash       TEXT NOT NULL,
  attempted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Zona iklan Adsterra (atau provider lain) yang dikelola lewat dashboard admin
CREATE TABLE IF NOT EXISTS ad_zones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  placement    TEXT NOT NULL,
  code         TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  impressions  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_ad_zones_placement ON ad_zones(placement, enabled);

-- Langganan Push Notification (disimpan per browser/perangkat pengunjung)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_videos_status       ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_category     ON videos(category_id);
CREATE INDEX IF NOT EXISTS idx_videos_views        ON videos(views DESC);
CREATE INDEX IF NOT EXISTS idx_videos_publish_date ON videos(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_videos_slug         ON videos(slug);
CREATE INDEX IF NOT EXISTS idx_categories_slug     ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_view_logs_lookup    ON view_logs(video_id, ip_hash, viewed_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip   ON login_attempts(ip_hash, attempted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires    ON sessions(expires_at);
