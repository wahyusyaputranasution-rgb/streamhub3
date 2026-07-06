-- ============================================================
-- Migrasi: tambah fitur Kelola Iklan
-- AMAN dijalankan di database yang sudah berisi data (video,
-- kategori, admin, dll) — script ini TIDAK menghapus/mengubah
-- tabel yang sudah ada, hanya menambah tabel baru "ad_zones".
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_ads.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_zones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  placement    TEXT NOT NULL,
  code         TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ad_zones_placement ON ad_zones(placement, enabled);
