-- ============================================================
-- Migrasi v2: tracking impresi iklan
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- kolom baru "impressions" ke tabel ad_zones yang sudah ada.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_v2.sql
--
-- Catatan: fitur ganti password & multi-admin TIDAK butuh migrasi apa pun
-- karena memakai tabel "admins" yang sudah ada sejak awal.
-- ============================================================

ALTER TABLE ad_zones ADD COLUMN impressions INTEGER NOT NULL DEFAULT 0;
