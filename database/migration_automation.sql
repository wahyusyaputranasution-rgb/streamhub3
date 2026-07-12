-- ============================================================
-- Migrasi v7: Automasi (Auto-publish terjadwal + Auto-post Telegram)
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- kolom baru "telegram_posted" ke tabel videos yang sudah ada.
-- Tabel "settings" untuk konfigurasi Telegram sudah ada dari migrasi
-- sebelumnya (migration_settings.sql) — kalau belum pernah dijalankan,
-- jalankan itu dulu.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_automation.sql
-- ============================================================

ALTER TABLE videos ADD COLUMN telegram_posted INTEGER NOT NULL DEFAULT 0;
