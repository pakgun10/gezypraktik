# GezyPraktik — Berbagi Praktik Baik

Aplikasi berbagi praktik baik kependidikan. Peserta mengisi praktik baiknya,
asesor menilai dan memberi umpan balik, pengunjung melihat, memberi bintang,
dan menulis ulasan.

## Keputusan awal (25 Nov 2026)

- Nama: **GezyPraktik**
- Kategori awal: **Guru saja dulu** (Kepala Sekolah, Pengawas, dan Tenaga
  Kependidikan tampil sebagai "segera" di prototipe)
- Praktik **langsung terbit**, asesor menilai setelah terbit
- Bintang/ulasan pengunjung **login pakai email**, dengan data: Nama, NIP,
  Instansi, No Telp/WA, dan status (guru, KS, pengawas, siswa, umum)
- Repo: `pakgun10/gezypraktik`

## Prototipe tampilan

`index.html` adalah prototipe tampilan satu halaman yang bisa diklik
(diekspor dari prototipe GezyPraktik). Isinya:

- Beranda dan Jelajahi: pencarian, filter mapel/jenjang, 6 contoh praktik
- Halaman detail praktik: masalah, strategi, pelaksanaan, bukti
  sebelum/sesudah, refleksi, lampiran, nilai asesor (rubrik 4 aspek,
  terpisah dari bintang komunitas)
- Daftar/masuk dengan email: Nama, NIP, Instansi, No Telp/WA, status
- Wizard menulis praktik 6 langkah yang memetakan 28 butir Guru, dengan
  simpan draf dan tombol Terbitkan
- Dasbor "Praktik Saya" dan antrean asesor dengan rubrik dan umpan balik

Semua data di prototipe ini adalah data contoh dan berjalan di dalam
halaman (belum terhubung ke server/database).

## Rencana

Prototipe ini menjadi acuan tampilan dan alur sebelum dibangun aplikasi
sesungguhnya (rencana: Bun + Hono + SQLite, satu proses di VPS, mengikuti
pola GezyForm/GezyAsko).
