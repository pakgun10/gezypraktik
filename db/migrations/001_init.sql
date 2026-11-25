-- GezyPraktik Fase 1 — skema awal (kategori Guru saja).
-- MariaDB 10.11+ / 11.x. Semua tabel utf8mb4.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nama VARCHAR(255) NOT NULL,
  nip VARCHAR(32) NULL,
  instansi VARCHAR(255) NOT NULL,
  no_wa VARCHAR(32) NOT NULL,
  status ENUM('Guru','Kepala Sekolah','Pengawas','Siswa','Umum') NOT NULL DEFAULT 'Guru',
  role ENUM('admin','asesor','peserta','pengunjung') NOT NULL DEFAULT 'peserta',
  profile_slug VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  author_id INT NOT NULL,
  kategori ENUM('Guru') NOT NULL DEFAULT 'Guru',
  mapel VARCHAR(100) NOT NULL DEFAULT '',
  jenjang ENUM('SD','SMP','SMA','SMK') NOT NULL DEFAULT 'SMP',
  kelas VARCHAR(20) NOT NULL DEFAULT '',
  ringkasan TEXT NOT NULL DEFAULT '',
  status ENUM('Draf','Terbit','Dinilai') NOT NULL DEFAULT 'Draf',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_practices_status (status),
  INDEX idx_practices_mapel (mapel),
  INDEX idx_practices_jenjang (jenjang),
  INDEX idx_practices_author (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28 butir templat Guru (lihat lib/util.ts LANGKAH_GURU).
-- Satu baris per butir; list disimpan sebagai JSON array.
CREATE TABLE IF NOT EXISTS practice_fields (
  practice_id INT NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  field_value MEDIUMTEXT NOT NULL DEFAULT '',
  PRIMARY KEY (practice_id, field_key),
  FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  practice_id INT NOT NULL,
  nama_file VARCHAR(255) NOT NULL,
  jenis ENUM('file','tautan') NOT NULL DEFAULT 'file',
  path_or_url VARCHAR(1024) NOT NULL,
  ukuran INT NULL,
  mime VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE,
  INDEX idx_attach_practice (practice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Satu bintang per pengguna per praktik (bisa diubah).
CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  practice_id INT NOT NULL,
  user_id INT NOT NULL,
  bintang TINYINT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rating (practice_id, user_id),
  FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  practice_id INT NOT NULL,
  user_id INT NOT NULL,
  teks TEXT NOT NULL,
  tersembunyi TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reviews_practice (practice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Penilaian asesor: satu penilaian per asesor per praktik (bisa diubah).
CREATE TABLE IF NOT EXISTS assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  practice_id INT NOT NULL,
  asesor_id INT NOT NULL,
  skor_masalah TINYINT NOT NULL,
  skor_strategi TINYINT NOT NULL,
  skor_bukti TINYINT NOT NULL,
  skor_replikasi TINYINT NOT NULL,
  umpan_balik TEXT NOT NULL DEFAULT '',
  keputusan ENUM('Dinilai','Perlu perbaikan') NOT NULL DEFAULT 'Dinilai',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assessment (practice_id, asesor_id),
  FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE,
  FOREIGN KEY (asesor_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  aksi VARCHAR(100) NOT NULL,
  detail VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
