-- ============================================================
-- Migrasi v6: Pengaturan Website (Customer Service, dll)
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "settings", tidak menyentuh tabel lain.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_settings.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
