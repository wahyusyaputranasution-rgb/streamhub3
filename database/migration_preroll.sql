-- ============================================================
-- Migrasi v11: Iklan Pre-Roll (mirip iklan YouTube, bisa di-skip)
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "preroll_ads", tidak menyentuh tabel lain.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_preroll.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS preroll_ads (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  ad_type             TEXT NOT NULL DEFAULT 'image' CHECK (ad_type IN ('video', 'image')),
  media_url           TEXT NOT NULL,
  link_url            TEXT,
  skip_after_seconds  INTEGER NOT NULL DEFAULT 5,
  enabled             INTEGER NOT NULL DEFAULT 1,
  start_date          TEXT NOT NULL,
  end_date            TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_preroll_ads_dates ON preroll_ads(start_date, end_date, enabled);
