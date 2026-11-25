import { one, all, run } from "./db";
import { slugUnik, normalisasiField, FIELD_KEYS_GURU } from "./lib/util";

// Seed GezyPraktik Fase 1 — IDEMPOTENT (boleh dijalankan berulang).
// Jalankan dulu: bun run migrate
// Membuat: 1 admin + 1 asesor + 2 penulis contoh + 2 praktik Guru TERBIT
// + 1 penilaian asesor contoh + bintang/ulasan contoh.
// SEMUA data seed adalah DATA CONTOH (ditandai di judul/identitas) dan
// boleh dihapus admin dari dasbor setelah aplikasi dipakai sungguhan.
//
// PERINGATAN: kata sandi bawaan admin "admin123" HARUS segera diganti
// setelah login pertama (buat akun admin baru lalu hapus yang ini, atau
// ubah lewat database). Jangan dipakai di produksi apa adanya.

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@gezytech.web.id";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

async function buatUser(u: {
  email: string; password: string; nama: string; nip: string | null;
  instansi: string; no_wa: string; status: string; role: string;
}): Promise<number> {
  const ada = await one("SELECT id FROM users WHERE email = ?", [u.email]);
  if (ada) return ada.id;
  const slug = await slugUnik(u.nama, async (s) => !!(await one("SELECT id FROM users WHERE profile_slug = ?", [s])));
  const hash = await Bun.password.hash(u.password);
  const r = await run(
    `INSERT INTO users (email, password_hash, nama, nip, instansi, no_wa, status, role, profile_slug)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [u.email, hash, u.nama, u.nip, u.instansi, u.no_wa, u.status, u.role, slug]
  );
  console.log(`OK: user ${u.email} (${u.role}) dibuat.`);
  return r.insertId;
}

async function buatPraktik(
  authorId: number,
  data: { judul: string; mapel: string; jenjang: string; kelas: string; ringkasan: string; fields: Record<string, unknown> }
): Promise<number> {
  const slug = await slugUnik(data.judul, async (s) => !!(await one("SELECT id FROM practices WHERE slug = ?", [s])));
  const ada = await one("SELECT id FROM practices WHERE slug = ?", [slug]);
  // Idempotensi seed: kenali lewat judul yang sama.
  const sama = await one(
    "SELECT pr.id FROM practices pr JOIN practice_fields pf ON pf.practice_id = pr.id AND pf.field_key='judul' AND pf.field_value = ?",
    [data.judul]
  );
  if (sama) {
    console.log(`OK: praktik "${data.judul}" sudah ada, dilewati.`);
    return sama.id;
  }
  const r = await run(
    "INSERT INTO practices (slug, author_id, kategori, mapel, jenjang, kelas, ringkasan, status, published_at) VALUES (?,?,?,?,?,?,?,'Terbit',NOW())",
    [slug, authorId, "Guru", data.mapel, data.jenjang, data.kelas, data.ringkasan]
  );
  for (const key of Object.keys(data.fields)) {
    if (!FIELD_KEYS_GURU.has(key)) continue;
    await run(
      "INSERT INTO practice_fields (practice_id, field_key, field_value) VALUES (?,?,?)",
      [r.insertId, key, normalisasiField(key, data.fields[key])]
    );
  }
  console.log(`OK: praktik "${data.judul}" terbit (id ${r.insertId}).`);
  return r.insertId;
}

// ---------- Akun ----------
const adminId = await buatUser({
  email: ADMIN_EMAIL, password: ADMIN_PASSWORD, nama: "Admin GezyPraktik",
  nip: null, instansi: "GezyPraktik", no_wa: "-", status: "Guru", role: "admin",
});
console.log("    !! SEGERA GANTI kata sandi admin setelah login pertama.");
const asesorId = await buatUser({
  email: "ratna@contoh.sch.id", password: "asesor123", nama: "Dr. Hj. Ratna Sari, M.Pd.",
  nip: "196505121990032001", instansi: "Dinas Pendidikan Lampung Tengah", no_wa: "081200000001",
  status: "Pengawas", role: "asesor",
});
const gunantoId = await buatUser({
  email: "gunanto@contoh.sch.id", password: "guru12345", nama: "Gunanto, S.Pd.",
  nip: "197905101999031002", instansi: "SMPN 1 Punggur", no_wa: "081200000002",
  status: "Guru", role: "peserta",
});
const helmiId = await buatUser({
  email: "helmi@contoh.sch.id", password: "guru12345", nama: "Helmi Wijayanti, S.Pd.",
  nip: "198203152006042003", instansi: "SMPN 1 Punggur", no_wa: "081200000003",
  status: "Guru", role: "peserta",
});

// ---------- Praktik contoh 1 (dari prototipe) ----------
const p1 = await buatPraktik(gunantoId, {
  judul: "[CONTOH] Menandai K: Kebiasaan Memeriksa Jawaban Sendiri pada Soal Bilangan Bulat",
  mapel: "Matematika", jenjang: "SMP", kelas: "VII",
  ringkasan:
    "Murid terbiasa salah salin angka dan tidak pernah memeriksa ulang jawabannya. Dengan tanda K (periksa Kembali) di setiap langkah, kesalahan hitung turun drastis dalam 4 pertemuan.",
  fields: {
    identitas: "Gunanto, S.Pd. — SMPN 1 Punggur, Matematika Kelas VII, Semester Ganjil 2026/2027. [DATA CONTOH]",
    judul: "[CONTOH] Menandai K: Kebiasaan Memeriksa Jawaban Sendiri pada Soal Bilangan Bulat",
    latar_belakang:
      "Pada ulangan harian bilangan bulat, 62% kesalahan murid bukan karena tidak paham konsep, melainkan salah salin angka dan tidak memeriksa ulang. Murid menganggap selesai berarti benar.",
    tujuan:
      "Membiasakan murid memeriksa kembali setiap langkah pengerjaan soal melalui penanda visual sederhana, sehingga kesalahan teknis menurun dan murid lebih percaya diri.",
    tantangan: [
      "Murid merasa memeriksa ulang membuang waktu",
      "Kebiasaan lama: menulis jawaban sekali jalan tanpa jeda",
      "Waktu pelajaran terbatas untuk latihan tambahan",
    ],
    strategi:
      "Setiap murid wajib menulis huruf K kecil di akhir setiap langkah hitung setelah memeriksanya. Guru mencontohkan dengan think-aloud di papan tulis, lalu murid saling memeriksa (peer-check) sebelum jawaban dikumpulkan.",
    inovasi:
      "Penanda satu huruf yang murah dan konsisten — tanpa alat khusus, tanpa aplikasi. Huruf K menjadi sinyal berhenti sejenak dan membaca ulang soal.",
    media: "Papan tulis, lembar kerja dengan kolom K, kartu soal berjenjang.",
    teknologi:
      "Dokumentasi foto lembar kerja diunggah ke grup kelas; kuis singkat 5 soal untuk pemanasan di awal pertemuan.",
    langkah: [
      "Guru mendemonstrasikan satu soal sambil berpikir keras (think-aloud) dan menandai K di tiap langkah",
      "Murid berlatih berpasangan: satu mengerjakan, satu memeriksa dan membubuhkan K",
      "Latihan mandiri dengan kartu soal berjenjang",
      "Refleksi kelas: menghitung bersama berapa kesalahan yang tertangkap tanda K",
    ],
    modul_ajar: "Modul Ajar Bilangan Bulat — lihat lampiran (contoh).",
    bahan_ajar: "Kartu soal berjenjang bilangan bulat.",
    lkpd: "LKPD Tanda K — lihat lampiran (contoh).",
    instrumen: "Instrumen asesmen formatif 5 soal — lihat lampiran (contoh).",
    dokumentasi: "Foto lembar kerja murid sebelum dan sesudah penerapan (contoh).",
    foto_video: "Video pelaksanaan: https://www.youtube.com/watch?v=dQw4w9WgXcQ (tautan contoh)",
    karya_murid: "Lembar kerja murid dengan tanda K di setiap langkah.",
    hasil_asesmen: "Ulangan harian bilangan bulat, 32 murid kelas VII.",
    sebelum: "31%",
    sebelum_label: "ketuntasan ulangan harian",
    sesudah: "78%",
    sesudah_label: "ketuntasan setelah 4 pertemuan",
    dampak_motivasi:
      "Murid mulai memeriksa tanpa disuruh; beberapa murid membuat tanda versinya sendiri.",
    dampak_hasil:
      "Kesalahan salah salin turun dari 21 kasus menjadi 5 kasus per ulangan.",
    refleksi:
      "Kekuatan praktik ini ada pada kesederhanaannya. Kelemahannya, murid cepat bosan bila tanda K hanya jadi formalitas — perlu variasi tantangan soal agar pemeriksaan tetap bermakna.",
    pendukung_penghambat:
      "Pendukung: kesepakatan kelas dan contoh konsisten guru. Penghambat: murid yang terburu-buru menyelesaikan soal.",
    tindak_lanjut:
      "Menerapkan tanda K pada materi persamaan linear dan membagikan praktik ini di MGMP Matematika kabupaten.",
    replikasi:
      "Sangat mudah direplikasi di semua mata pelajaran hitungan; cukup satu kesepakatan kelas dan contoh konsisten dari guru selama dua minggu pertama.",
    testimoni: "“Sekarang saya ketemu salah saya sendiri sebelum dikumpulkan.” — Murid kelas VII (contoh)",
    diseminasi: "Dibagikan di MGMP Matematika SMP Lampung Tengah, November 2026 (contoh).",
    tautan_portofolio: "https://contoh.sch.id/portofolio-gunanto",
  },
});

// ---------- Praktik contoh 2 (dari prototipe) ----------
const p2 = await buatPraktik(helmiId, {
  judul: "[CONTOH] Membaca Nyaring Bergilir Membuat Kelas Berani Berbicara Bahasa Inggris",
  mapel: "Bahasa Inggris", jenjang: "SMP", kelas: "IX",
  ringkasan:
    "Murid kelas IX diam total saat diminta berbicara. Membaca nyaring bergilir dalam kelompok kecil selama 10 menit tiap pertemuan mengubah keberanian mereka dalam 6 minggu.",
  fields: {
    identitas: "Helmi Wijayanti, S.Pd. — SMPN 1 Punggur, Bahasa Inggris Kelas IX, Semester Ganjil 2026/2027. [DATA CONTOH]",
    judul: "[CONTOH] Membaca Nyaring Bergilir Membuat Kelas Berani Berbicara Bahasa Inggris",
    latar_belakang:
      "Dari 32 murid, hanya 3 yang berani menjawab lisan. Murid takut salah ucap dan ditertawakan teman.",
    tujuan:
      "Meningkatkan keberanian dan kelancaran berbicara melalui latihan lisan berisiko rendah secara rutin.",
    tantangan: [
      "Rasa malu dan takut diejek",
      "Pengucapan yang sangat beragam",
      "Waktu bicara per murid sangat sedikit di kelas besar",
    ],
    strategi:
      "Kelompok 4 orang membaca teks descriptive bergiliran, satu paragraf satu murid, lalu satu kalimat pendapat pribadi. Teman memberi satu pujian spesifik sebelum koreksi.",
    inovasi:
      "Aturan 'pujian dulu, koreksi kemudian' dan kalimat pendapat wajib satu kalimat — kecil, tapi mengubah suasana kelas.",
    media: "Teks descriptive tentang tempat wisata Lampung, kartu peran pembaca, daftar frasa bantuan di dinding kelas.",
    teknologi: "Rekaman suara murid di ponsel guru untuk memantau kemajuan pengucapan dari minggu ke minggu.",
    langkah: [
      "Guru memodelkan membaca nyaring satu paragraf",
      "Kelompok membaca bergilir, guru berkeliling memberi frasa bantuan",
      "Setiap murid menyampaikan satu kalimat pendapat",
      "Rekaman pembanding minggu pertama dan keenam diputar anonim untuk refleksi",
    ],
    modul_ajar: "RPP Descriptive Text — lihat lampiran (contoh).",
    bahan_ajar: "Teks descriptive tentang tempat wisata Lampung.",
    lkpd: "Kartu Peran Pembaca.",
    instrumen: "Rubrik Penilaian Speaking.",
    dokumentasi: "Rekaman suara murid minggu pertama dan keenam (contoh).",
    foto_video: "—",
    karya_murid: "Rekaman bacaan murid dan lembar pendapat satu kalimat.",
    hasil_asesmen: "Penilaian speaking, 32 murid kelas IX.",
    sebelum: "3 murid",
    sebelum_label: "berani bicara dari 32 murid",
    sesudah: "24 murid",
    sesudah_label: "berani bicara dari 32 murid",
    dampak_motivasi: "Murid yang semula diam total mulai mengajukan diri membaca pertama.",
    dampak_hasil: "Rata-rata nilai speaking naik dari 61 menjadi 79.",
    refleksi:
      "Kunci keberhasilan adalah konsistensi 10 menit, bukan durasi panjang. Kelompok harus diacak ulang tiap dua minggu agar tidak terbentuk kelompok 'berani' dan 'diam'.",
    pendukung_penghambat:
      "Pendukung: teks yang dekat dengan kehidupan murid. Penghambat: kelas besar membuat giliran bicara pendek.",
    tindak_lanjut: "Melanjutkan ke tahap retelling dengan kata sendiri pada semester genap.",
    replikasi: "Dapat dipakai untuk teks narrative dan recount; cocok juga untuk latihan membaca nyaring Bahasa Indonesia.",
    testimoni: "“Awalnya malu, tapi karena berkelompok jadi tidak terlalu tegang.” — Murid kelas IX (contoh)",
    diseminasi: "Dibagikan di MGMP Bahasa Inggris (contoh).",
    tautan_portofolio: "",
  },
});

// ---------- Penilaian asesor contoh (untuk praktik 1) ----------
const penilaianAda = await one(
  "SELECT id FROM assessments WHERE practice_id = ? AND asesor_id = ?",
  [p1, asesorId]
);
if (!penilaianAda) {
  await run(
    `INSERT INTO assessments (practice_id, asesor_id, skor_masalah, skor_strategi, skor_bukti, skor_replikasi, umpan_balik, keputusan)
     VALUES (?,?,?,?,?,?,?, 'Dinilai')`,
    [
      p1, asesorId, 4, 3, 4, 4,
      "Masalah diidentifikasi dari data nyata, bukan asumsi. Bukti sebelum–sesudah jelas. Perlu ditambah contoh lembar kerja murid yang gagal agar pembaca melihat proses perbaikannya. [PENILAIAN CONTOH]",
    ]
  );
  await run("UPDATE practices SET status = 'Dinilai' WHERE id = ?", [p1]);
  console.log("OK: penilaian asesor contoh untuk praktik 1.");
}

// ---------- Bintang & ulasan contoh ----------
const bintangAda = await one("SELECT id FROM ratings WHERE practice_id = ? AND user_id = ?", [p1, helmiId]);
if (!bintangAda) {
  await run("INSERT INTO ratings (practice_id, user_id, bintang) VALUES (?,?,5)", [p1, helmiId]);
  await run("INSERT INTO reviews (practice_id, user_id, teks) VALUES (?,?,?)", [
    p1, helmiId,
    "Sederhana tapi kena. Saya adaptasi untuk Bahasa Inggris — tanda K jadi tanda C (check). [ULASAN CONTOH]",
  ]);
  console.log("OK: bintang + ulasan contoh untuk praktik 1.");
}
const bintang2Ada = await one("SELECT id FROM ratings WHERE practice_id = ? AND user_id = ?", [p2, gunantoId]);
if (!bintang2Ada) {
  await run("INSERT INTO ratings (practice_id, user_id, bintang) VALUES (?,?,5)", [p2, gunantoId]);
  console.log("OK: bintang contoh untuk praktik 2.");
}

console.log("\nSeed selesai. Akun contoh (ganti kata sandinya bila dipakai sungguhan):");
console.log(`  Admin  : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}  (WAJIB diganti setelah login pertama)`);
console.log("  Asesor : ratna@contoh.sch.id / asesor123");
console.log("  Peserta: gunanto@contoh.sch.id / guru12345");
console.log("  Peserta: helmi@contoh.sch.id / guru12345");
process.exit(0);
