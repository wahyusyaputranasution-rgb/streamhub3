-- ============================================================
-- Migrasi v3: Push Notification
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "push_subscriptions", tidak menyentuh tabel lain.
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_push.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
