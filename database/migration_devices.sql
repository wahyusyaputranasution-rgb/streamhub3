-- ============================================================
-- Migrasi v5: Tracking Perangkat (install count & online/offline)
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "devices", tidak menyentuh tabel lain.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_devices.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS devices (
  device_id     TEXT PRIMARY KEY,
  first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  is_installed  INTEGER NOT NULL DEFAULT 0,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
