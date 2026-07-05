-- ============================================================
-- Data contoh (opsional). Jalankan dengan:
--   wrangler d1 execute streaming_db --remote --file=./database/seed.sql
-- Catatan: akun admin TIDAK dibuat lewat file ini demi keamanan.
-- Buat admin pertama lewat endpoint /api/auth/setup (lihat README.md).
-- ============================================================

INSERT INTO categories (name, slug) VALUES
  ('Aksi', 'aksi'),
  ('Drama', 'drama'),
  ('Komedi', 'komedi'),
  ('Dokumenter', 'dokumenter'),
  ('Anime', 'anime');

INSERT INTO videos (title, slug, description, category_id, embed_url, thumbnail_url, status, views, publish_date) VALUES
  ('Contoh Video Aksi Seru', 'contoh-video-aksi-seru',
   'Ini adalah deskripsi contoh untuk video aksi. Ganti dengan deskripsi asli Anda.',
   1, 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://image.tmdb.org/t/p/w500/placeholder1.jpg',
   'published', 120, datetime('now', '-2 day')),
  ('Drama Keluarga Mengharukan', 'drama-keluarga-mengharukan',
   'Kisah drama keluarga yang penuh emosi dan pelajaran hidup.',
   2, 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://image.tmdb.org/t/p/w500/placeholder2.jpg',
   'published', 340, datetime('now', '-1 day')),
  ('Komedi Konyol Sepanjang Masa', 'komedi-konyol-sepanjang-masa',
   'Video komedi yang bikin ngakak dari awal sampai akhir.',
   3, 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://image.tmdb.org/t/p/w500/placeholder3.jpg',
   'draft', 0, NULL);
