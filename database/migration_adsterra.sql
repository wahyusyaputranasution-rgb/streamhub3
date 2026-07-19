-- ============================================================
-- Migrasi v10: Adsterra Revenue Dashboard
-- AMAN dijalankan di database yang sudah berisi data — hanya menambah
-- tabel baru "adsterra_stats" dan "adsterra_sync_log", tidak menyentuh
-- tabel lain (video, kategori, admin, iklan, sponsor, dll sama sekali
-- tidak diubah oleh migrasi ini).
--
-- Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/migration_adsterra.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS adsterra_stats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT NOT NULL,
  revenue        REAL NOT NULL DEFAULT 0,
  impressions    INTEGER NOT NULL DEFAULT 0,
  clicks         INTEGER NOT NULL DEFAULT 0,
  ctr            REAL NOT NULL DEFAULT 0,
  cpm            REAL NOT NULL DEFAULT 0,
  requests       INTEGER NOT NULL DEFAULT 0,
  fill_rate      REAL NOT NULL DEFAULT 0,
  json_response  TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adsterra_stats_date ON adsterra_stats(date, updated_at);

CREATE TABLE IF NOT EXISTS adsterra_sync_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
  response_time_ms INTEGER,
  status           TEXT NOT NULL,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_adsterra_sync_log_time ON adsterra_sync_log(synced_at);
