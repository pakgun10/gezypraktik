import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { configFromEnv, runMigrations, closePool, one, all, run } from "../db";
import { app } from "../server";

// Tes API GezyPraktik terhadap database khusus pengujian.
// Jalankan: bun test  (butuh MariaDB lokal jalan + .env terisi)

process.env.DB_NAME = "gezypraktik_test";

const TEST_CFG = { ...configFromEnv(), database: "gezypraktik_test" };

let cookiePeserta = "";
let cookiePeserta2 = "";
let cookieAsesor = "";
let cookieAdmin = "";
let praktikId = 0;
let praktikSlug = "";

function req(path: string, init: RequestInit = {}, cookie = "") {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as any) };
  if (cookie) headers["Cookie"] = cookie;
  return app.request(path, { ...init, headers });
}

function ambilCookie(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  return set.split(";")[0];
}

async function buatUser(email: string, password: string, nama: string, role: string) {
  const hash = await Bun.password.hash(password);
  const slug = email.split("@")[0].replace(/[^a-z0-9]+/g, "-");
  const r = await run(
    `INSERT INTO users (email, password_hash, nama, nip, instansi, no_wa, status, role, profile_slug)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [email, hash, nama, null, "SMPN 1 Punggur", "081200000000", "Guru", role, slug]
  );
  return r.insertId;
}

async function masuk(email: string, password: string): Promise<string> {
  const res = await req("/api/auth/masuk", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return ambilCookie(res);
}

beforeAll(async () => {
  await runMigrations(TEST_CFG);
  // Bersihkan database pengujian.
  const conn = await (await import("../db")).getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of ["activity_log", "assessments", "reviews", "ratings", "attachments", "practice_fields", "practices", "sessions", "users"]) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
  await buatUser("admin@test.id", "admin12345", "Admin Tes", "admin");
  await buatUser("asesor@test.id", "asesor123", "Asesor Tes", "asesor");
  await buatUser("guru@test.id", "guru12345", "Guru Tes", "peserta");
  await buatUser("guru2@test.id", "guru12345", "Guru Dua", "peserta");
  cookieAdmin = await masuk("admin@test.id", "admin12345");
  cookieAsesor = await masuk("asesor@test.id", "asesor123");
  cookiePeserta = await masuk("guru@test.id", "guru12345");
  cookiePeserta2 = await masuk("guru2@test.id", "guru12345");
});

afterAll(async () => {
  await closePool();
});

describe("auth", () => {
  test("daftar menolak kata sandi pendek", async () => {
    const res = await req("/api/auth/daftar", {
      method: "POST",
      body: JSON.stringify({ nama: "X", email: "x@test.id", password: "123", instansi: "SMP", no_wa: "081", status: "Guru" }),
    });
    expect(res.status).toBe(400);
  });

  test("daftar menolak email duplikat", async () => {
    const res = await req("/api/auth/daftar", {
      method: "POST",
      body: JSON.stringify({ nama: "Guru Tes", email: "guru@test.id", password: "guru12345", instansi: "SMP", no_wa: "081", status: "Guru" }),
    });
    expect(res.status).toBe(409);
  });

  test("daftar baru berhasil dan langsung login (cookie sesi)", async () => {
    const res = await req("/api/auth/daftar", {
      method: "POST",
      body: JSON.stringify({ nama: "Baru Daftar", email: "baru@test.id", password: "barubaru1", instansi: "SMPN 2", no_wa: "08129999", status: "Siswa" }),
    });
    expect(res.status).toBe(201);
    expect(ambilCookie(res)).toMatch(/^sesi=/);
    const me = await req("/api/auth/me", {}, ambilCookie(res));
    const j = await me.json();
    expect(j.user.email).toBe("baru@test.id");
    expect(j.user.role).toBe("peserta");
  });

  test("masuk dengan kata sandi salah ditolak", async () => {
    const res = await req("/api/auth/masuk", {
      method: "POST",
      body: JSON.stringify({ email: "guru@test.id", password: "salah123" }),
    });
    expect(res.status).toBe(401);
  });

  test("keluar menghapus sesi", async () => {
    const c = await masuk("guru@test.id", "guru12345");
    const res = await req("/api/auth/keluar", { method: "POST", body: "{}" }, c);
    expect(res.status).toBe(200);
    const me = await req("/api/auth/me", {}, c);
    expect((await me.json()).user).toBeNull();
  });
});

describe("CRUD praktik + status terbit", () => {
  test("buat draf tanpa judul ditolak", async () => {
    const res = await req("/api/praktik", {
      method: "POST",
      body: JSON.stringify({ fields: { latar_belakang: "x" }, mapel: "Matematika" }),
    }, cookiePeserta);
    expect(res.status).toBe(400);
  });

  test("buat draf berhasil, belum muncul di publik", async () => {
    const res = await req("/api/praktik", {
      method: "POST",
      body: JSON.stringify({
        mapel: "Matematika", jenjang: "SMP", kelas: "VII",
        ringkasan: "Ringkasan tes.",
        fields: {
          judul: "Tes Praktik Bilangan Bulat",
          identitas: "Guru Tes — SMPN 1 Punggur",
          latar_belakang: "Murid sering salah salin.",
          tujuan: "Membiasakan memeriksa jawaban.",
          strategi: "Tanda K di tiap langkah.",
        },
      }),
    }, cookiePeserta);
    expect(res.status).toBe(201);
    const j = await res.json();
    praktikId = j.id;
    praktikSlug = j.slug;
    expect(praktikSlug).toBe("tes-praktik-bilangan-bulat");
    const publik = await req("/api/praktik");
    const pj = await publik.json();
    expect(pj.praktik.find((p: any) => p.id === praktikId)).toBeUndefined();
  });

  test("terbitkan: draf menjadi Terbit dan muncul di publik", async () => {
    const res = await req(`/api/praktik/${praktikId}/terbitkan`, { method: "POST", body: "{}" }, cookiePeserta);
    expect(res.status).toBe(200);
    const publik = await req("/api/praktik");
    const pj = await publik.json();
    const ketemu = pj.praktik.find((p: any) => p.id === praktikId);
    expect(ketemu).toBeDefined();
    expect(ketemu.status).toBe("Terbit");
    const detail = await req(`/api/praktik/${praktikSlug}`);
    const dj = await detail.json();
    expect(dj.fields.latar_belakang).toBe("Murid sering salah salin.");
    expect(dj.fields.tujuan).toBe("Membiasakan memeriksa jawaban.");
  });

  test("pemilik lain tidak bisa mengubah praktik orang lain", async () => {
    const res = await req(`/api/praktik/${praktikId}`, {
      method: "PUT",
      body: JSON.stringify({ fields: { tujuan: "diubah orang lain" } }),
    }, cookiePeserta2);
    expect(res.status).toBe(403);
  });

  test("hapus draf hanya untuk draf sendiri", async () => {
    const buat = await req("/api/praktik", {
      method: "POST",
      body: JSON.stringify({ fields: { judul: "Draf Untuk Dihapus" }, mapel: "IPA" }),
    }, cookiePeserta);
    const id = (await buat.json()).id;
    const hapusOrang = await req(`/api/praktik/${id}`, { method: "DELETE" }, cookiePeserta2);
    expect(hapusOrang.status).toBe(403);
    const hapus = await req(`/api/praktik/${id}`, { method: "DELETE" }, cookiePeserta);
    expect(hapus.status).toBe(200);
    expect(await one("SELECT id FROM practices WHERE id = ?", [id])).toBeNull();
  });
});

describe("bintang & ulasan", () => {
  test("bintang tanpa login ditolak", async () => {
    const res = await req(`/api/praktik/${praktikId}/bintang`, {
      method: "POST",
      body: JSON.stringify({ bintang: 5 }),
    });
    expect(res.status).toBe(401);
  });

  test("satu bintang per pengguna: bintang kedua mengubah, bukan menambah", async () => {
    let res = await req(`/api/praktik/${praktikId}/bintang`, {
      method: "POST",
      body: JSON.stringify({ bintang: 5 }),
    }, cookiePeserta2);
    expect(res.status).toBe(200);
    res = await req(`/api/praktik/${praktikId}/bintang`, {
      method: "POST",
      body: JSON.stringify({ bintang: 3 }),
    }, cookiePeserta2);
    expect(res.status).toBe(200);
    const rows = await all("SELECT bintang FROM ratings WHERE practice_id = ?", [praktikId]);
    expect(rows.length).toBe(1);
    expect(rows[0].bintang).toBe(3);
    const detail = await req(`/api/praktik/${praktikSlug}`, {}, cookiePeserta2);
    const dj = await detail.json();
    expect(dj.rating.rata).toBe(3);
    expect(dj.bintang_saya).toBe(3);
  });

  test("bintang di luar 1–5 ditolak", async () => {
    const res = await req(`/api/praktik/${praktikId}/bintang`, {
      method: "POST",
      body: JSON.stringify({ bintang: 6 }),
    }, cookiePeserta2);
    expect(res.status).toBe(400);
  });

  test("ulasan tersimpan dan tampil di detail", async () => {
    const res = await req(`/api/praktik/${praktikId}/ulasan`, {
      method: "POST",
      body: JSON.stringify({ teks: "Praktik yang mudah ditiru." }),
    }, cookiePeserta2);
    expect(res.status).toBe(201);
    const detail = await req(`/api/praktik/${praktikSlug}`);
    const dj = await detail.json();
    expect(dj.ulasan.some((r: any) => r.teks === "Praktik yang mudah ditiru.")).toBe(true);
  });
});

describe("penilaian asesor", () => {
  test("peserta tidak boleh menilai", async () => {
    const res = await req(`/api/praktik/${praktikId}/penilaian`, {
      method: "POST",
      body: JSON.stringify({ skor_masalah: 4, skor_strategi: 4, skor_bukti: 4, skor_replikasi: 4, umpan_balik: "x", keputusan: "Dinilai" }),
    }, cookiePeserta);
    expect(res.status).toBe(403);
  });

  test("skor di luar 1–4 ditolak", async () => {
    const res = await req(`/api/praktik/${praktikId}/penilaian`, {
      method: "POST",
      body: JSON.stringify({ skor_masalah: 5, skor_strategi: 4, skor_bukti: 4, skor_replikasi: 4 }),
    }, cookieAsesor);
    expect(res.status).toBe(400);
  });

  test("asesor menilai: status praktik menjadi Dinilai, nilai terpisah dari bintang", async () => {
    const res = await req(`/api/praktik/${praktikId}/penilaian`, {
      method: "POST",
      body: JSON.stringify({ skor_masalah: 4, skor_strategi: 3, skor_bukti: 4, skor_replikasi: 4, umpan_balik: "Bukti kuat, tambah contoh gagal.", keputusan: "Dinilai" }),
    }, cookieAsesor);
    expect(res.status).toBe(200);
    const detail = await req(`/api/praktik/${praktikSlug}`);
    const dj = await detail.json();
    expect(dj.status).toBe("Dinilai");
    expect(dj.penilaian.rata).toBeCloseTo(3.75, 5);
    expect(dj.penilaian_detail[0].umpan_balik).toContain("Bukti kuat");
    expect(dj.rating.rata).toBe(3); // bintang komunitas tetap 3, tidak tercampur
  });
});

describe("filter & pencarian", () => {
  test("cari judul menemukan praktik", async () => {
    const res = await req("/api/praktik?q=Bilangan%20Bulat");
    const j = await res.json();
    expect(j.praktik.some((p: any) => p.id === praktikId)).toBe(true);
  });

  test("cari kata yang tidak ada menghasilkan kosong", async () => {
    const res = await req("/api/praktik?q=zzztidakada");
    const j = await res.json();
    expect(j.praktik.length).toBe(0);
  });

  test("filter mapel dan jenjang", async () => {
    const res = await req("/api/praktik?mapel=IPA");
    const j = await res.json();
    expect(j.praktik.every((p: any) => p.mapel === "IPA")).toBe(true);
    expect(j.praktik.find((p: any) => p.id === praktikId)).toBeUndefined();
    const res2 = await req("/api/praktik?jenjang=SMP&mapel=Matematika");
    const j2 = await res2.json();
    expect(j2.praktik.some((p: any) => p.id === praktikId)).toBe(true);
  });
});

describe("admin", () => {
  test("admin bisa mengubah peran pengguna", async () => {
    const u = await one("SELECT id FROM users WHERE email = 'guru2@test.id'");
    const res = await req(`/api/admin/pengguna/${u.id}/peran`, {
      method: "PUT",
      body: JSON.stringify({ role: "asesor" }),
    }, cookieAdmin);
    expect(res.status).toBe(200);
    const cek = await one("SELECT role FROM users WHERE id = ?", [u.id]);
    expect(cek.role).toBe("asesor");
    // Kembalikan supaya tes lain tidak terpengaruh.
    await req(`/api/admin/pengguna/${u.id}/peran`, {
      method: "PUT",
      body: JSON.stringify({ role: "peserta" }),
    }, cookieAdmin);
  });

  test("admin bisa menyembunyikan ulasan", async () => {
    const r = await one("SELECT id FROM reviews WHERE practice_id = ? LIMIT 1", [praktikId]);
    const res = await req(`/api/admin/ulasan/${r.id}/sembunyikan`, {
      method: "POST",
      body: JSON.stringify({ tersembunyi: true }),
    }, cookieAdmin);
    expect(res.status).toBe(200);
    const detail = await req(`/api/praktik/${praktikSlug}`);
    const dj = await detail.json();
    expect(dj.ulasan.some((x: any) => x.id === r.id)).toBe(false);
    const detailAdmin = await req(`/api/praktik/${praktikSlug}`, {}, cookieAdmin);
    const da = await detailAdmin.json();
    expect(da.ulasan.some((x: any) => x.id === r.id)).toBe(true);
  });

  test("backup admin mengembalikan JSON lengkap", async () => {
    const res = await req("/api/admin/backup", {}, cookieAdmin);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.aplikasi).toBe("GezyPraktik");
    expect(Array.isArray(j.practices)).toBe(true);
    expect(j.practices.some((p: any) => p.id === praktikId)).toBe(true);
  });

  test("non-admin tidak bisa membuka statistik admin", async () => {
    const res = await req("/api/admin/statistik", {}, cookiePeserta);
    expect(res.status).toBe(403);
  });
});
