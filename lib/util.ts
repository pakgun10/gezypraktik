import { run } from "../db";

// ---------- Slug ----------

export function slugify(teks: string): string {
  return teks
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "praktik";
}

export async function slugUnik(
  dasar: string,
  cek: (slug: string) => Promise<boolean>
): Promise<string> {
  let slug = slugify(dasar);
  let i = 2;
  while (await cek(slug)) {
    slug = `${slugify(dasar)}-${i++}`;
  }
  return slug;
}

// ---------- Templat Guru: 28 butir dalam 6 langkah ----------
// Sumber: workspace/user/files/bahan_bukti_berbagi_praktik_baik.md bagian 1.
// `list: true` berarti nilainya disimpan sebagai JSON array (satu butir per baris).

export type FieldDef = {
  key: string;
  label: string;
  jenis: "teks" | "area" | "list";
  wajib?: boolean;
  petunjuk?: string;
};

export type StepDef = { judul: string; sub: string; fields: FieldDef[] };

export const LANGKAH_GURU: StepDef[] = [
  {
    judul: "Identitas & Judul",
    sub: "Butir 1–2: identitas praktik baik dan judulnya.",
    fields: [
      { key: "identitas", label: "Identitas Praktik Baik", jenis: "area", wajib: true, petunjuk: "Nama penulis, sekolah/instansi, mata pelajaran, kelas, dan tahun ajaran." },
      { key: "judul", label: "Judul Praktik Baik", jenis: "teks", wajib: true },
    ],
  },
  {
    judul: "Masalah & Tujuan",
    sub: "Butir 3–5: latar belakang, tujuan, dan tantangan.",
    fields: [
      { key: "latar_belakang", label: "Latar Belakang Permasalahan Pembelajaran", jenis: "area", wajib: true },
      { key: "tujuan", label: "Tujuan Praktik Baik", jenis: "area", wajib: true },
      { key: "tantangan", label: "Identifikasi Tantangan Pembelajaran", jenis: "list", petunjuk: "Satu tantangan per baris." },
    ],
  },
  {
    judul: "Strategi & Inovasi",
    sub: "Butir 6–9: strategi, inovasi, media, dan teknologi digital.",
    fields: [
      { key: "strategi", label: "Strategi dan Metode Pembelajaran", jenis: "area", wajib: true },
      { key: "inovasi", label: "Inovasi Pembelajaran", jenis: "area" },
      { key: "media", label: "Media dan Sumber Belajar", jenis: "area" },
      { key: "teknologi", label: "Pemanfaatan Teknologi Digital", jenis: "area" },
    ],
  },
  {
    judul: "Pelaksanaan & Perangkat",
    sub: "Butir 10–14: langkah pelaksanaan dan perangkat pembelajaran.",
    fields: [
      { key: "langkah", label: "Langkah-Langkah Pelaksanaan Pembelajaran", jenis: "list", petunjuk: "Satu langkah per baris, berurutan." },
      { key: "modul_ajar", label: "Modul Ajar / RPP", jenis: "area", petunjuk: "Ringkasan atau tautan berkas. Berkasnya sendiri diunggah di bagian Lampiran." },
      { key: "bahan_ajar", label: "Bahan Ajar", jenis: "area" },
      { key: "lkpd", label: "LKPD", jenis: "area" },
      { key: "instrumen", label: "Instrumen Asesmen", jenis: "area" },
    ],
  },
  {
    judul: "Bukti & Dampak",
    sub: "Butir 15–21: dokumentasi, karya murid, hasil asesmen, dan perbandingan sebelum–sesudah.",
    fields: [
      { key: "dokumentasi", label: "Dokumentasi Kegiatan Pembelajaran", jenis: "area" },
      { key: "foto_video", label: "Foto atau Video Pelaksanaan", jenis: "area", petunjuk: "Tulis tautan video (YouTube/Drive). Foto diunggah di bagian Lampiran." },
      { key: "karya_murid", label: "Hasil Karya Peserta Didik", jenis: "area" },
      { key: "hasil_asesmen", label: "Hasil Asesmen Pembelajaran", jenis: "area" },
      { key: "sebelum", label: "Kondisi Sebelum Penerapan", jenis: "teks", petunjuk: "Angka atau keadaan sebelum, mis. 31%." },
      { key: "sebelum_label", label: "Keterangan kondisi sebelum", jenis: "teks", petunjuk: "Mis. ketuntasan ulangan harian." },
      { key: "sesudah", label: "Kondisi Sesudah Penerapan", jenis: "teks", petunjuk: "Angka atau keadaan sesudah, mis. 78%." },
      { key: "sesudah_label", label: "Keterangan kondisi sesudah", jenis: "teks" },
      { key: "dampak_motivasi", label: "Dampak terhadap Motivasi dan Keaktifan Peserta Didik", jenis: "area" },
      { key: "dampak_hasil", label: "Dampak terhadap Hasil Belajar", jenis: "area" },
    ],
  },
  {
    judul: "Refleksi & Replikasi",
    sub: "Butir 22–28: refleksi, tindak lanjut, dan potensi replikasi.",
    fields: [
      { key: "refleksi", label: "Refleksi Pelaksanaan", jenis: "area" },
      { key: "pendukung_penghambat", label: "Faktor Pendukung dan Penghambat", jenis: "area" },
      { key: "tindak_lanjut", label: "Rencana Tindak Lanjut", jenis: "area" },
      { key: "replikasi", label: "Potensi Replikasi dan Adaptasi Praktik Baik", jenis: "area" },
      { key: "testimoni", label: "Testimoni Peserta Didik atau Rekan Guru", jenis: "area" },
      { key: "diseminasi", label: "Bukti Diseminasi atau Berbagi Praktik Baik", jenis: "area" },
      { key: "tautan_portofolio", label: "Tautan Portofolio atau Publikasi Praktik Baik", jenis: "teks" },
    ],
  },
];

export const SEMUA_FIELD_GURU: FieldDef[] = LANGKAH_GURU.flatMap((s) => s.fields);
export const FIELD_KEYS_GURU = new Set(SEMUA_FIELD_GURU.map((f) => f.key));
export const FIELD_LIST_KEYS = new Set(
  SEMUA_FIELD_GURU.filter((f) => f.jenis === "list").map((f) => f.key)
);

/** Normalisasi nilai field dari body: list jadi JSON array, lainnya string. */
export function normalisasiField(key: string, nilai: unknown): string {
  if (FIELD_LIST_KEYS.has(key)) {
    if (Array.isArray(nilai)) return JSON.stringify(nilai.map(String).map((s) => s.trim()).filter(Boolean));
    return JSON.stringify(
      String(nilai ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  return String(nilai ?? "").trim();
}

/** Ubah nilai tersimpan kembali ke bentuk tampil (array untuk list). */
export function tampilField(key: string, nilai: string | null): string | string[] {
  if (!nilai) return FIELD_LIST_KEYS.has(key) ? [] : "";
  if (FIELD_LIST_KEYS.has(key)) {
    try {
      const v = JSON.parse(nilai);
      return Array.isArray(v) ? v : [nilai];
    } catch {
      return nilai.split(/\r?\n/).filter(Boolean);
    }
  }
  return nilai;
}

export const STATUS_PENGGUNA = ["Guru", "Kepala Sekolah", "Pengawas", "Siswa", "Umum"] as const;
export const PERAN = ["admin", "asesor", "peserta", "pengunjung"] as const;
export const JENJANG = ["SD", "SMP", "SMA", "SMK"] as const;

export function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Catat aktivitas ke tabel activity_log (gagal catat tidak menggagalkan aksi). */
export async function catatLog(
  userId: number | null,
  aksi: string,
  detail: string
): Promise<void> {
  try {
    await run("INSERT INTO activity_log (user_id, aksi, detail) VALUES (?,?,?)", [
      userId,
      aksi,
      detail.slice(0, 500),
    ]);
  } catch {
    // Log bersifat pelengkap; abaikan bila gagal.
  }
}
