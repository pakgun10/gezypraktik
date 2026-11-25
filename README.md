# GezyPraktik — Berbagi Praktik Baik

Aplikasi berbagi praktik baik kependidikan. Peserta mengisi praktik baiknya,
asesor menilai dan memberi umpan balik, pengunjung melihat, memberi bintang,
dan menulis ulasan.

**Stack:** Bun + Hono + MariaDB (driver `mysql2`), satu proses, tanpa Docker.
Frontend HTML + CSS + JavaScript biasa tanpa build step, disajikan oleh Hono.

## Keputusan awal (25 Nov 2026)

- Nama: **GezyPraktik**. Tagline Beranda: "Praktik baik, ditulis oleh guru,
  untuk seluruh guru Indonesia."
- Kategori awal: **Guru saja dulu** (Kepala Sekolah, Pengawas, dan Tenaga
  Kependidikan tampil sebagai "segera" di aplikasi; belum dibangun).
- Praktik **langsung terbit** saat peserta menekan Terbitkan; asesor menilai
  **setelah** terbit (bukan gate sebelum terbit).
- Bintang/ulasan pengunjung **login pakai email**, dengan data profil wajib:
  Nama, NIP, Instansi, No Telp/WA, status (guru, KS, pengawas, siswa, umum).
- Repo: `pakgun10/gezypraktik`
- Peran: admin, asesor, peserta, pengunjung.

## Struktur

```
server.ts            # Aplikasi Hono: halaman + semua rute API
db.ts                # Pool mysql2, helper query, runner migrasi
auth.ts              # Sesi cookie HttpOnly "sesi" 7 hari, hash argon2id
lib/util.ts          # Templat Guru 28 butir dalam 6 langkah, slug, validasi
db/migrations/       # Migrasi SQL bernomor (001_init.sql)
scripts/setup-db.ts  # Buat database + user MariaDB (dev + test)
scripts/migrate.ts   # Jalankan migrasi (bun run migrate)
seed.ts              # Seed idempotent: admin + asesor + 2 praktik contoh
public/index.html    # Halaman aplikasi (desain dari prototipe)
public/js/app.js     # SPA: jelajahi, detail, wizard, dasbor, admin
tests/api.test.ts    # Tes API otomatis (bun test)
uploads/             # Lampiran yang diunggah (gitignore, maks 5 MB/berkas)
index.html           # Prototipe tampilan awal (arsip, bukan yang disajikan)
```

### Skema database (migrasi 001)

- `users` — email (unik), password_hash (argon2id), nama, nip, instansi,
  no_wa, status (Guru/Kepala Sekolah/Pengawas/Siswa/Umum),
  role (admin/asesor/peserta/pengunjung), profile_slug (unik).
- `sessions` — id (UUID), user_id, expires_at (ms).
- `practices` — slug (unik), author_id, kategori ('Guru'), mapel, jenjang
  (SD/SMP/SMA/SMK), kelas, ringkasan, status (Draf/Terbit/Dinilai),
  published_at.
- `practice_fields` — 28 butir templat Guru per praktik (PK practice_id +
  field_key); butir daftar (tantangan, langkah) disimpan sebagai JSON array.
- `attachments` — lampiran berkas (path lokal di `uploads/`) atau tautan
  video (YouTube/Drive).
- `ratings` — satu bintang (1–5) per pengguna per praktik (UNIQUE,
  bisa diubah).
- `reviews` — ulasan teks, bisa disembunyikan admin (`tersembunyi`).
- `assessments` — satu penilaian per asesor per praktik; rubrik 4 aspek
  skala 1–4 (masalah & tujuan, strategi & inovasi, bukti & dampak,
  potensi replikasi) + umpan balik + keputusan (Dinilai / Perlu perbaikan).
- `activity_log` — log aktivitas sederhana. `migrations` — catatan migrasi.

## Menjalankan di lokal (VM ini)

MariaDB lokal di VM ini BUKAN service apt: instalasi manual MariaDB 10.11.13
di `/home/hatch/mariadb-10.11.13`, config `/home/hatch/mariadb-manual.cnf`.
Bila belum jalan, start manual dulu:

```bash
mkdir -p /run/mysqld
/home/hatch/mariadb-10.11.13/bin/mariadbd --defaults-file=/home/hatch/mariadb-manual.cnf --user=root &
# Cek: PATH=/home/hatch/mariadb-10.11.13/bin:$PATH mysql -u root -e "SELECT VERSION();"
```

Lalu, dari direktori ini:

```bash
cp .env.example .env        # isi DB_PASSWORD (jangan commit .env)
bun install
bun run setup-db            # buat database gezypraktik + gezypraktik_test + user
bun run migrate             # terapkan migrasi
bun run seed                # admin + asesor + 2 praktik contoh (idempotent)
bun run start               # jalan di http://127.0.0.1:3104
```

Tes otomatis (database `gezypraktik_test`, tidak menyentuh data dev):

```bash
bun test                    # 24 tes API (25 Nov 2026: 24 lolos, 0 gagal)
```

## Akun default (WAJIB diganti saat deploy!)

Seed membuat akun berikut. Kata sandi admin bawaan **harus segera diganti**
setelah login pertama — buat akun admin baru lalu hapus akun ini, atau ubah
lewat database. Jangan memakai akun contoh ini di produksi.

| Akun | Email | Kata sandi | Peran |
| --- | --- | --- | --- |
| Admin | `admin@gezytech.web.id` | `admin123` | admin |
| Asesor contoh | `ratna@contoh.sch.id` | `asesor123` | asesor |
| Peserta contoh | `gunanto@contoh.sch.id` | `guru12345` | peserta |
| Peserta contoh | `helmi@contoh.sch.id` | `guru12345` | peserta |

Email/kata sandi admin seed bisa diubah lewat `ADMIN_EMAIL` / `ADMIN_PASSWORD`
di `.env` sebelum menjalankan seed (hanya berpengaruh bila akun belum ada).

Data seed adalah **data contoh** (judul praktik diawali `[CONTOH]`) dan boleh
dihapus admin dari dasbor setelah aplikasi dipakai sungguhan.

## API (ringkas)

- Auth: `POST /api/auth/daftar`, `POST /api/auth/masuk`,
  `POST /api/auth/keluar`, `GET /api/auth/me`
- Publik: `GET /api/stats`, `GET /api/praktik?q=&mapel=&jenjang=&sort=baru|bintang|asesor|populer`,
  `GET /api/praktik/:slug`, `GET /api/profil/:slug`
- Praktik (login): `POST /api/praktik`, `PUT /api/praktik/:id`,
  `POST /api/praktik/:id/terbitkan`, `DELETE /api/praktik/:id` (draf sendiri/admin),
  `POST /api/praktik/:id/lampiran` (berkas ≤5 MB atau tautan),
  `GET /api/lampiran/:id/file`, `DELETE /api/lampiran/:id`
- Komunitas (login): `POST /api/praktik/:id/bintang` (1–5, bisa diubah),
  `POST /api/praktik/:id/ulasan`
- Asesor: `POST /api/praktik/:id/penilaian` (rubrik 1–4 + umpan balik + keputusan)
- Dasbor: `GET /api/dasbor/saya`, `GET /api/dasbor/asesor`
- Admin: `GET /api/admin/statistik`, `GET /api/admin/pengguna`,
  `POST /api/admin/pengguna`, `PUT /api/admin/pengguna/:id/peran`,
  `GET /api/admin/ulasan`, `POST /api/admin/ulasan/:id/sembunyikan`,
  `GET /api/admin/praktik`, `GET /api/admin/backup`,
  `POST /api/admin/restore`, `GET /api/admin/log`
- Halaman berbagi: `/praktik/<slug>` (halaman praktik),
  `/p/<slug>` (profil penulis).

## Deploy VPS (di tangan Pak Gun)

Prasyarat di VPS (Ubuntu): Bun terpasang, MariaDB 11.8.6 sudah jalan
(service `mariadb.service`, dipakai GezyCBT — buat database + user
**terpisah** untuk GezyPraktik, jangan pakai database `gezycbt`), nginx.

```bash
# 1. Clone dan isi .env (DB_PASSWORD sendiri, PORT=3104)
git clone https://github.com/pakgun10/gezypraktik.git /home/ubuntu/gezypraktik
cd /home/ubuntu/gezypraktik
cp .env.example .env   # isi DB_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
bun install

# 2. Database (sebagai root MariaDB; sesuaikan sandinya)
mysql -u root -p -e "CREATE DATABASE gezypraktik CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gezypraktik'@'127.0.0.1' IDENTIFIED BY '<sandi-db>';
GRANT ALL PRIVILEGES ON gezypraktik.* TO 'gezypraktik'@'127.0.0.1'; FLUSH PRIVILEGES;"

# 3. Migrasi + seed (seed hanya data contoh; boleh dilewati bila tidak perlu)
bun run migrate
bun run seed

# 4. Service systemd /etc/systemd/system/gezypraktik.service
#    [Unit] Description=GezyPraktik / After=network.target mariadb.service / Requires=mariadb.service
#    [Service] Type=simple / WorkingDirectory=/home/ubuntu/gezypraktik
#    ExecStart=/home/ubuntu/.bun/bin/bun server.ts / Restart=on-failure
#    User=ubuntu / Environment=PORT=3104
#    [Install] WantedBy=multi-user.target
sudo systemctl daemon-reload
sudo systemctl enable --now gezypraktik
sudo systemctl status gezypraktik

# 5. Nginx: reverse proxy ke 127.0.0.1:3104 untuk domain praktik
#    (usulan: praktik.gezytech.web.id — domain final keputusan Pak Gun)
#    + sertifikat HTTPS (certbot), seperti pola GezyCBT/GezyDafnil.
```

Setelah deploy: login sebagai admin, **segera ganti kata sandi admin**,
buat akun asesor sungguhan, dan hapus data contoh bila tidak diperlukan.

## Yang belum / ditunda (Fase 2)

- Kategori Kepala Sekolah, Pengawas, Tenaga Kependidikan (templat 43/53/64
  butir sudah ada di `workspace/user/files/bahan_bukti_berbagi_praktik_baik.md`).
- Import .docx otomatis, SSO lintas aplikasi.
- Domain final dan port final bila 3104 bentrok di VPS.
- Mengubah praktik yang sudah Dinilai akan mengembalikannya ke status Terbit
  (perlu dinilai ulang) — penilaian lama tetap tersimpan sebagai riwayat.
