-- ============================================================
-- Schema database D1 untuk StreamHub
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/schema.sql
-- ============================================================

DROP TABLE IF EXISTS view_logs;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS admins;

-- Admin yang bisa login ke dashboard
CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sesi login admin (dipakai untuk cookie session + CSRF token)
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  admin_id    INTEGER NOT NULL,
  csrf_token  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- Kategori video
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Video
CREATE TABLE videos (
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
CREATE TABLE view_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   INTEGER NOT NULL,
  ip_hash    TEXT NOT NULL,
  viewed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Log percobaan login untuk rate limiting brute force
CREATE TABLE login_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash       TEXT NOT NULL,
  attempted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index untuk performa query
CREATE INDEX idx_videos_status       ON videos(status);
CREATE INDEX idx_videos_category     ON videos(category_id);
CREATE INDEX idx_videos_views        ON videos(views DESC);
CREATE INDEX idx_videos_publish_date ON videos(publish_date DESC);
CREATE INDEX idx_videos_slug         ON videos(slug);
CREATE INDEX idx_categories_slug     ON categories(slug);
CREATE INDEX idx_view_logs_lookup    ON view_logs(video_id, ip_hash, viewed_at);
CREATE INDEX idx_login_attempts_ip   ON login_attempts(ip_hash, attempted_at);
CREATE INDEX idx_sessions_expires    ON sessions(expires_at);
