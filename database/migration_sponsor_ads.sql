-- ============================================================
-- Migrasi v8: Iklan Sponsor (kartu endorse menyatu di grid)
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "sponsor_ads", tidak menyentuh tabel lain.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_sponsor_ads.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS sponsor_ads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  title       TEXT NOT NULL,
  image_url   TEXT NOT NULL,
  link_url    TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sponsor_ads_dates ON sponsor_ads(start_date, end_date);
