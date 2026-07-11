-- ============================================================
-- Migrasi v4: Upload Thumbnail dari Dashboard
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "uploads", tidak menyentuh tabel lain.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_uploads.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS uploads (
  id            TEXT PRIMARY KEY,
  content_type  TEXT NOT NULL,
  data          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
