-- ============================================================
-- Migrasi v9: Tambah kolom "enabled" ke sponsor_ads
-- Jalankan ini HANYA JIKA Anda sudah pernah menjalankan migration_sponsor_ads.sql
-- versi lama (sebelum kolom enabled ditambahkan) dan mendapat error
-- "duplicate column" saat mencoba menjalankan migration_sponsor_ads.sql yang baru.
--
-- Kalau belum pernah menjalankan migrasi sponsor sama sekali, TIDAK PERLU
-- menjalankan file ini — cukup jalankan migration_sponsor_ads.sql yang sudah
-- termasuk kolom enabled di dalamnya.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_sponsor_enabled.sql
-- ============================================================

ALTER TABLE sponsor_ads ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
