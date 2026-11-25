import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getCookie } from "hono/cookie";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { one, all, run, closePool } from "./db";
import {
  createSession,
  destroySession,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  requireRole,
  requireLogin,
  type SessionUser,
} from "./auth";
import {
  slugify,
  slugUnik,
  LANGKAH_GURU,
  FIELD_KEYS_GURU,
  normalisasiField,
  tampilField,
  STATUS_PENGGUNA,
  PERAN,
  JENJANG,
  emailValid,
  catatLog,
} from "./lib/util";

const PORT = Number(process.env.PORT ?? 3104);
const UPLOAD_DIR = path.join(import.meta.dir, "uploads");
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_BOLEH = new Set(["pdf", "docx", "doc", "png", "jpg", "jpeg", "webp", "gif"]);

export function buildApp(): Hono {
  const app = new Hono();

  async function bacaBody(c: any): Promise<any> {
    try {
      return await c.req.json();
    } catch {
      return {};
    }
  }

  function publikUser(u: any) {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      nama: u.nama,
      nip: u.nip,
      instansi: u.instansi,
      no_wa: u.no_wa,
      status: u.status,
      role: u.role,
      profile_slug: u.profile_slug,
      created_at: u.created_at,
    };
  }

  async function muatPraktik(p: any) {
    const fieldRows = await all(
      "SELECT field_key, field_value FROM practice_fields WHERE practice_id = ?",
      [p.id]
    );
    const fields: Record<string, any> = {};
    for (const r of fieldRows) fields[r.field_key] = tampilField(r.field_key, r.field_value);
    const lampiran = await all(
      "SELECT id, nama_file, jenis, path_or_url, ukuran, mime, created_at FROM attachments WHERE practice_id = ? ORDER BY id",
      [p.id]
    );
    const rating = await one(
      "SELECT COALESCE(AVG(bintang),0) AS rata, COUNT(*) AS jumlah FROM ratings WHERE practice_id = ?",
      [p.id]
    );
    const nilai = await one(
      `SELECT COALESCE(AVG((skor_masalah+skor_strategi+skor_bukti+skor_replikasi)/4),0) AS rata,
              COUNT(*) AS jumlah FROM assessments WHERE practice_id = ?`,
      [p.id]
    );
    const ulasan = await all(
      `SELECT r.id, r.teks, r.tersembunyi, r.created_at, u.nama, u.status, u.instansi
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.practice_id = ? ORDER BY r.created_at DESC`,
      [p.id]
    );
    return {
      ...p,
      judul: fields.judul ?? "",
      fields,
      lampiran,
      rating: { rata: Number(rating?.rata ?? 0), jumlah: Number(rating?.jumlah ?? 0) },
      penilaian: { rata: Number(nilai?.rata ?? 0), jumlah: Number(nilai?.jumlah ?? 0) },
      ulasan: ulasan.map((r: any) => ({
        id: r.id,
        teks: r.teks,
        tersembunyi: !!r.tersembunyi,
        created_at: r.created_at,
        nama: r.nama,
        status: r.status,
        instansi: r.instansi,
      })),
    };
  }

  async function cariPraktik(idAtauSlug: string) {
    const p = await one(
      `SELECT pr.*, u.nama AS penulis_nama, u.instansi AS penulis_instansi,
              u.status AS penulis_status, u.profile_slug AS penulis_slug
       FROM practices pr JOIN users u ON u.id = pr.author_id
       WHERE pr.id = ? OR pr.slug = ?`,
      [Number(idAtauSlug) || 0, idAtauSlug]
    );
    return p;
  }

  // ---------- Halaman & aset statis ----------
  app.get("/", () => new Response(Bun.file(path.join(import.meta.dir, "public", "index.html"))));
  app.get("/praktik/:slug", () =>
    new Response(Bun.file(path.join(import.meta.dir, "public", "index.html")))
  );
  app.get("/p/:slug", () =>
    new Response(Bun.file(path.join(import.meta.dir, "public", "index.html")))
  );
  app.use("/js/*", serveStatic({ root: "./public" }));
  app.use("/css/*", serveStatic({ root: "./public" }));

  // ---------- Meta ----------
  app.get("/api/meta/langkah", (c) => c.json({ langkah: LANGKAH_GURU }));

  app.get("/api/stats", async (c) => {
    const t = await one("SELECT COUNT(*) AS n FROM practices WHERE status IN ('Terbit','Dinilai')");
    const p = await one(
      "SELECT COUNT(DISTINCT author_id) AS n FROM practices WHERE status IN ('Terbit','Dinilai')"
    );
    const d = await one("SELECT COUNT(*) AS n FROM practices WHERE status = 'Dinilai'");
    const u = await one("SELECT COUNT(*) AS n FROM reviews WHERE tersembunyi = 0");
    return c.json({
      total_terbit: Number(t?.n ?? 0),
      total_penulis: Number(p?.n ?? 0),
      total_dinilai: Number(d?.n ?? 0),
      total_ulasan: Number(u?.n ?? 0),
    });
  });

  // ---------- Auth ----------
  app.post("/api/auth/daftar", async (c) => {
    const b = await bacaBody(c);
    const nama = String(b.nama ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const instansi = String(b.instansi ?? "").trim();
    const noWa = String(b.no_wa ?? b.noWa ?? "").trim();
    const status = String(b.status ?? "");
    const nip = String(b.nip ?? "").trim() || null;
    if (!nama || !emailValid(email) || password.length < 8 || !instansi || !noWa)
      return c.json({ error: "Isi semua data wajib: nama, email valid, kata sandi minimal 8 karakter, instansi, dan No Telp/WA." }, 400);
    if (!STATUS_PENGGUNA.includes(status as any))
      return c.json({ error: "Status tidak dikenal (guru, Kepala Sekolah, Pengawas, Siswa, Umum)." }, 400);
    const ada = await one("SELECT id FROM users WHERE email = ?", [email]);
    if (ada) return c.json({ error: "Email sudah terdaftar. Silakan masuk." }, 409);
    const slug = await slugUnik(nama, async (s) => !!(await one("SELECT id FROM users WHERE profile_slug = ?", [s])));
    const hash = await Bun.password.hash(password);
    const r = await run(
      `INSERT INTO users (email, password_hash, nama, nip, instansi, no_wa, status, role, profile_slug)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [email, hash, nama, nip, instansi, noWa, status, "peserta", slug]
    );
    const sid = await createSession(r.insertId);
    setSessionCookie(c, sid);
    await catatLog(r.insertId, "daftar", `Pengguna baru: ${nama} (${status})`);
    const user = await one("SELECT * FROM users WHERE id = ?", [r.insertId]);
    return c.json({ user: publikUser(user) }, 201);
  });

  app.post("/api/auth/masuk", async (c) => {
    const b = await bacaBody(c);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const user = await one("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return c.json({ error: "Email atau kata sandi salah." }, 401);
    const ok = await Bun.password.verify(password, user.password_hash);
    if (!ok) return c.json({ error: "Email atau kata sandi salah." }, 401);
    const sid = await createSession(user.id);
    setSessionCookie(c, sid);
    return c.json({ user: publikUser(user) });
  });

  app.post("/api/auth/keluar", async (c) => {
    const sid = getCookie(c, "sesi");
    if (sid) await destroySession(sid);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", async (c) => {
    const u = await getSessionUser(c);
    if (!u) return c.json({ user: null });
    const full = await one("SELECT * FROM users WHERE id = ?", [u.id]);
    return c.json({ user: publikUser(full) });
  });

  // ---------- Jelajahi (publik) ----------
  app.get("/api/praktik", async (c) => {
    const q = String(c.req.query("q") ?? "").trim();
    const mapel = String(c.req.query("mapel") ?? "");
    const jenjang = String(c.req.query("jenjang") ?? "");
    const sort = String(c.req.query("sort") ?? "baru");
    const mine = c.req.query("mine") === "1";
    const me = await getSessionUser(c);
    const where: string[] = [];
    const params: any[] = [];
    if (mine) {
      if (!me) return c.json({ error: "Belum login" }, 401);
      where.push("pr.author_id = ?");
      params.push(me.id);
    } else {
      where.push("pr.status IN ('Terbit','Dinilai')");
    }
    if (q) {
      where.push("(pr.slug LIKE ? OR pr.ringkasan LIKE ? OR pr.mapel LIKE ? OR u.nama LIKE ? OR EXISTS (SELECT 1 FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul' AND pf.field_value LIKE ?))");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (mapel) {
      where.push("pr.mapel = ?");
      params.push(mapel);
    }
    if (jenjang) {
      where.push("pr.jenjang = ?");
      params.push(jenjang);
    }
    const order =
      sort === "bintang"
        ? "rating_rata DESC, pr.published_at DESC"
        : sort === "asesor"
          ? "nilai_rata DESC, pr.published_at DESC"
          : sort === "populer"
            ? "jml_ulasan DESC, pr.published_at DESC"
            : "COALESCE(pr.published_at, pr.created_at) DESC";
    const rows = await all(
      `SELECT pr.*, u.nama AS penulis_nama, u.instansi AS penulis_instansi,
              u.status AS penulis_status, u.profile_slug AS penulis_slug,
              COALESCE((SELECT AVG(bintang) FROM ratings r WHERE r.practice_id = pr.id),0) AS rating_rata,
              (SELECT COUNT(*) FROM ratings r WHERE r.practice_id = pr.id) AS rating_jumlah,
              COALESCE((SELECT AVG((skor_masalah+skor_strategi+skor_bukti+skor_replikasi)/4) FROM assessments a WHERE a.practice_id = pr.id),0) AS nilai_rata,
              (SELECT COUNT(*) FROM reviews rv WHERE rv.practice_id = pr.id AND rv.tersembunyi = 0) AS jml_ulasan,
              (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul
       FROM practices pr JOIN users u ON u.id = pr.author_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${order} LIMIT 100`,
      params
    );
    return c.json({
      praktik: rows.map((r: any) => ({
        ...r,
        rating: { rata: Number(r.rating_rata), jumlah: Number(r.rating_jumlah) },
        penilaian: { rata: Number(r.nilai_rata), jumlah: 0 },
      })),
    });
  });

  app.get("/api/praktik/:idOrSlug", async (c) => {
    const me = await getSessionUser(c);
    const p = await cariPraktik(c.req.param("idOrSlug"));
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    const bolehLihat =
      p.status !== "Draf" || me?.id === p.author_id || me?.role === "admin";
    if (!bolehLihat) return c.json({ error: "Praktik ini masih draf." }, 403);
    const full = await muatPraktik(p);
    const bintangSaya = me
      ? await one("SELECT bintang FROM ratings WHERE practice_id = ? AND user_id = ?", [p.id, me.id])
      : null;
    const penilaianDetail = await all(
      `SELECT a.*, u.nama AS asesor_nama, u.instansi AS asesor_instansi
       FROM assessments a JOIN users u ON u.id = a.asesor_id
       WHERE a.practice_id = ? ORDER BY a.updated_at DESC`,
      [p.id]
    );
    const ulasanTampil = me?.role === "admin" ? full.ulasan : full.ulasan.filter((r: any) => !r.tersembunyi);
    return c.json({ ...full, ulasan: ulasanTampil, bintang_saya: bintangSaya?.bintang ?? null, penilaian_detail: penilaianDetail });
  });

  app.get("/api/profil/:slug", async (c) => {
    const user = await one("SELECT * FROM users WHERE profile_slug = ?", [c.req.param("slug")]);
    if (!user) return c.json({ error: "Profil tidak ditemukan." }, 404);
    const rows = await all(
      `SELECT pr.*, (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul,
              COALESCE((SELECT AVG(bintang) FROM ratings r WHERE r.practice_id = pr.id),0) AS rating_rata,
              (SELECT COUNT(*) FROM ratings r WHERE r.practice_id = pr.id) AS rating_jumlah
       FROM practices pr WHERE pr.author_id = ? AND pr.status IN ('Terbit','Dinilai')
       ORDER BY COALESCE(pr.published_at, pr.created_at) DESC`,
      [user.id]
    );
    return c.json({
      profil: {
        nama: user.nama,
        instansi: user.instansi,
        status: user.status,
        profile_slug: user.profile_slug,
      },
      praktik: rows.map((r: any) => ({ ...r, rating: { rata: Number(r.rating_rata), jumlah: Number(r.rating_jumlah) } })),
    });
  });

  // ---------- Tulis praktik (peserta/asesor/admin) ----------
  const bolehMenulis = requireRole("peserta", "asesor", "admin");

  app.post("/api/praktik", bolehMenulis, async (c) => {
    const me = c.get("user") as SessionUser;
    const b = await bacaBody(c);
    const fields = (b.fields ?? {}) as Record<string, unknown>;
    const judul = String(fields.judul ?? "").trim();
    if (!judul) return c.json({ error: "Judul praktik wajib diisi." }, 400);
    const mapel = String(b.mapel ?? "").trim();
    const jenjang = JENJANG.includes(b.jenjang) ? b.jenjang : "SMP";
    const kelas = String(b.kelas ?? "").trim();
    const ringkasan = String(b.ringkasan ?? "").trim();
    const slug = await slugUnik(judul, async (s) => !!(await one("SELECT id FROM practices WHERE slug = ?", [s])));
    const r = await run(
      "INSERT INTO practices (slug, author_id, kategori, mapel, jenjang, kelas, ringkasan, status) VALUES (?,?,?,?,?,?,?,'Draf')",
      [slug, me.id, "Guru", mapel, jenjang, kelas, ringkasan]
    );
    for (const key of Object.keys(fields)) {
      if (!FIELD_KEYS_GURU.has(key)) continue;
      await run(
        "INSERT INTO practice_fields (practice_id, field_key, field_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE field_value = VALUES(field_value)",
        [r.insertId, key, normalisasiField(key, fields[key])]
      );
    }
    await catatLog(me.id, "buat_draf", `Draf praktik: ${judul}`);
    return c.json({ id: r.insertId, slug }, 201);
  });

  app.put("/api/praktik/:id", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT * FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    if (p.author_id !== me.id && me.role !== "admin")
      return c.json({ error: "Hanya penulis atau admin yang boleh mengubah." }, 403);
    const b = await bacaBody(c);
    const fields = (b.fields ?? {}) as Record<string, unknown>;
    const judulBaru = fields.judul !== undefined ? String(fields.judul).trim() : null;
    if (judulBaru !== null && !judulBaru) return c.json({ error: "Judul tidak boleh kosong." }, 400);
    const patch: string[] = [];
    const params: any[] = [];
    if (b.mapel !== undefined) { patch.push("mapel = ?"); params.push(String(b.mapel).trim()); }
    if (b.jenjang !== undefined && JENJANG.includes(b.jenjang)) { patch.push("jenjang = ?"); params.push(b.jenjang); }
    if (b.kelas !== undefined) { patch.push("kelas = ?"); params.push(String(b.kelas).trim()); }
    if (b.ringkasan !== undefined) { patch.push("ringkasan = ?"); params.push(String(b.ringkasan).trim()); }
    // Penulis mengubah praktik yang sudah Dinilai -> kembali Terbit (perlu dinilai ulang).
    if (p.status === "Dinilai" && p.author_id === me.id && me.role !== "admin") {
      patch.push("status = 'Terbit'");
    }
    if (patch.length) {
      await run(`UPDATE practices SET ${patch.join(", ")} WHERE id = ?`, [...params, p.id]);
    }
    for (const key of Object.keys(fields)) {
      if (!FIELD_KEYS_GURU.has(key)) continue;
      await run(
        "INSERT INTO practice_fields (practice_id, field_key, field_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE field_value = VALUES(field_value)",
        [p.id, key, normalisasiField(key, fields[key])]
      );
    }
    await catatLog(me.id, "ubah_praktik", `Praktik #${p.id} diubah`);
    return c.json({ ok: true });
  });

  app.post("/api/praktik/:id/terbitkan", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT * FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    if (p.author_id !== me.id && me.role !== "admin")
      return c.json({ error: "Hanya penulis atau admin yang boleh menerbitkan." }, 403);
    if (p.status !== "Draf") return c.json({ error: "Hanya draf yang bisa diterbitkan." }, 400);
    const judul = await one("SELECT field_value FROM practice_fields WHERE practice_id = ? AND field_key = 'judul'", [p.id]);
    if (!judul?.field_value) return c.json({ error: "Judul wajib diisi sebelum terbit." }, 400);
    await run("UPDATE practices SET status = 'Terbit', published_at = NOW() WHERE id = ?", [p.id]);
    await catatLog(me.id, "terbitkan", `Praktik #${p.id} terbit (slug: ${p.slug})`);
    return c.json({ ok: true, slug: p.slug });
  });

  app.delete("/api/praktik/:id", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT * FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    const bolehHapus =
      me.role === "admin" || (p.author_id === me.id && p.status === "Draf");
    if (!bolehHapus)
      return c.json({ error: "Hanya draf sendiri (atau admin) yang bisa dihapus." }, 403);
    await run("DELETE FROM practices WHERE id = ?", [p.id]);
    await catatLog(me.id, "hapus_praktik", `Praktik #${p.id} dihapus`);
    return c.json({ ok: true });
  });

  // ---------- Lampiran ----------
  app.post("/api/praktik/:id/lampiran", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT * FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    if (p.author_id !== me.id && me.role !== "admin")
      return c.json({ error: "Hanya penulis atau admin yang boleh menambah lampiran." }, 403);
    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ error: "Form tidak valid." }, 400);
    const jenis = String(form.get("jenis") ?? "file");
    if (jenis === "tautan") {
      const nama = String(form.get("nama") ?? "").trim();
      const url = String(form.get("url") ?? "").trim();
      if (!nama || !/^https?:\/\//.test(url))
        return c.json({ error: "Nama dan tautan (diawali http:// atau https://) wajib diisi." }, 400);
      const r = await run(
        "INSERT INTO attachments (practice_id, nama_file, jenis, path_or_url) VALUES (?,?,'tautan',?)",
        [p.id, nama, url]
      );
      return c.json({ id: r.insertId }, 201);
    }
    const file = form.get("berkas") as File | null;
    if (!file || typeof file === "string" || file.size === 0)
      return c.json({ error: "Pilih berkas untuk diunggah." }, 400);
    if (file.size > MAX_FILE_BYTES)
      return c.json({ error: "Berkas melebihi batas 5 MB." }, 413);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!FILE_BOLEH.has(ext))
      return c.json({ error: "Jenis berkas tidak diizinkan (PDF, DOCX, atau gambar)." }, 400);
    await mkdir(UPLOAD_DIR, { recursive: true });
    const aman = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const simpan = `${p.id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${aman}`;
    await Bun.write(path.join(UPLOAD_DIR, simpan), file);
    const r = await run(
      "INSERT INTO attachments (practice_id, nama_file, jenis, path_or_url, ukuran, mime) VALUES (?,?,'file',?,?,?)",
      [p.id, file.name, simpan, file.size, file.type || null]
    );
    return c.json({ id: r.insertId }, 201);
  });

  app.get("/api/lampiran/:id/file", async (c) => {
    const a = await one(
      "SELECT at.*, pr.status, pr.author_id FROM attachments at JOIN practices pr ON pr.id = at.practice_id WHERE at.id = ?",
      [c.req.param("id")]
    );
    if (!a || a.jenis !== "file") return c.json({ error: "Lampiran tidak ditemukan." }, 404);
    const me = await getSessionUser(c);
    if (a.status === "Draf" && me?.id !== a.author_id && me?.role !== "admin")
      return c.json({ error: "Lampiran draf hanya untuk penulis/admin." }, 403);
    const file = Bun.file(path.join(UPLOAD_DIR, a.path_or_url));
    if (!(await file.exists())) return c.json({ error: "Berkas tidak ditemukan di server." }, 404);
    return new Response(file, {
      headers: {
        "Content-Type": a.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(a.nama_file)}"`,
      },
    });
  });

  app.delete("/api/lampiran/:id", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const a = await one(
      "SELECT at.*, pr.author_id FROM attachments at JOIN practices pr ON pr.id = at.practice_id WHERE at.id = ?",
      [c.req.param("id")]
    );
    if (!a) return c.json({ error: "Lampiran tidak ditemukan." }, 404);
    if (a.author_id !== me.id && me.role !== "admin")
      return c.json({ error: "Hanya penulis atau admin." }, 403);
    await run("DELETE FROM attachments WHERE id = ?", [a.id]);
    if (a.jenis === "file") {
      try {
        await Bun.file(path.join(UPLOAD_DIR, a.path_or_url)).delete?.();
      } catch { /* berkas mungkin sudah tidak ada */ }
    }
    return c.json({ ok: true });
  });

  // ---------- Bintang & ulasan (login wajib) ----------
  app.post("/api/praktik/:id/bintang", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT id, status FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    if (p.status === "Draf") return c.json({ error: "Praktik masih draf." }, 400);
    const b = await bacaBody(c);
    const bintang = Number(b.bintang);
    if (!Number.isInteger(bintang) || bintang < 1 || bintang > 5)
      return c.json({ error: "Bintang harus 1–5." }, 400);
    await run(
      `INSERT INTO ratings (practice_id, user_id, bintang) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE bintang = VALUES(bintang)`,
      [p.id, me.id, bintang]
    );
    return c.json({ ok: true });
  });

  app.post("/api/praktik/:id/ulasan", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT id, status FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    if (p.status === "Draf") return c.json({ error: "Praktik masih draf." }, 400);
    const b = await bacaBody(c);
    const teks = String(b.teks ?? "").trim();
    if (!teks || teks.length > 2000)
      return c.json({ error: "Ulasan wajib diisi (maks 2000 karakter)." }, 400);
    const r = await run("INSERT INTO reviews (practice_id, user_id, teks) VALUES (?,?,?)", [p.id, me.id, teks]);
    return c.json({ id: r.insertId }, 201);
  });

  // ---------- Penilaian asesor ----------
  app.post("/api/praktik/:id/penilaian", requireRole("asesor", "admin"), async (c) => {
    const me = c.get("user") as SessionUser;
    const p = await one("SELECT id, status FROM practices WHERE id = ?", [c.req.param("id")]);
    if (!p) return c.json({ error: "Praktik tidak ditemukan." }, 404);
    if (p.status === "Draf") return c.json({ error: "Praktik masih draf, belum bisa dinilai." }, 400);
    const b = await bacaBody(c);
    const skor = ["skor_masalah", "skor_strategi", "skor_bukti", "skor_replikasi"].map((k) => Number(b[k]));
    if (skor.some((s) => !Number.isInteger(s) || s < 1 || s > 4))
      return c.json({ error: "Keempat skor rubrik harus 1–4." }, 400);
    const keputusan = b.keputusan === "Perlu perbaikan" ? "Perlu perbaikan" : "Dinilai";
    const umpan = String(b.umpan_balik ?? "").trim();
    await run(
      `INSERT INTO assessments (practice_id, asesor_id, skor_masalah, skor_strategi, skor_bukti, skor_replikasi, umpan_balik, keputusan)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE skor_masalah=VALUES(skor_masalah), skor_strategi=VALUES(skor_strategi),
       skor_bukti=VALUES(skor_bukti), skor_replikasi=VALUES(skor_replikasi),
       umpan_balik=VALUES(umpan_balik), keputusan=VALUES(keputusan)`,
      [p.id, me.id, ...skor, umpan, keputusan]
    );
    if (keputusan === "Dinilai" && p.status === "Terbit") {
      await run("UPDATE practices SET status = 'Dinilai' WHERE id = ?", [p.id]);
    }
    await catatLog(me.id, "nilai", `Menilai praktik #${p.id}: ${keputusan}`);
    return c.json({ ok: true });
  });

  // ---------- Dasbor ----------
  app.get("/api/dasbor/saya", requireLogin, async (c) => {
    const me = c.get("user") as SessionUser;
    const rows = await all(
      `SELECT pr.*, (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul,
              COALESCE((SELECT AVG(bintang) FROM ratings r WHERE r.practice_id = pr.id),0) AS rating_rata,
              (SELECT COUNT(*) FROM ratings r WHERE r.practice_id = pr.id) AS rating_jumlah,
              (SELECT COUNT(*) FROM reviews rv WHERE rv.practice_id = pr.id AND rv.tersembunyi = 0) AS jml_ulasan
       FROM practices pr WHERE pr.author_id = ? ORDER BY pr.updated_at DESC`,
      [me.id]
    );
    const totalBintang = rows.reduce((s: number, r: any) => s + Number(r.rating_jumlah), 0);
    return c.json({
      saya: await one("SELECT * FROM users WHERE id = ?", [me.id]).then(publikUser),
      praktik: rows.map((r: any) => ({ ...r, rating: { rata: Number(r.rating_rata), jumlah: Number(r.rating_jumlah) } })),
      statistik: {
        total: rows.length,
        draf: rows.filter((r: any) => r.status === "Draf").length,
        terbit: rows.filter((r: any) => r.status === "Terbit").length,
        dinilai: rows.filter((r: any) => r.status === "Dinilai").length,
        total_bintang_diberikan: totalBintang,
      },
    });
  });

  app.get("/api/dasbor/asesor", requireRole("asesor", "admin"), async (c) => {
    const me = c.get("user") as SessionUser;
    const antrean = await all(
      `SELECT pr.*, u.nama AS penulis_nama, u.instansi AS penulis_instansi,
              (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul
       FROM practices pr JOIN users u ON u.id = pr.author_id
       WHERE pr.status IN ('Terbit','Dinilai')
         AND NOT EXISTS (SELECT 1 FROM assessments a WHERE a.practice_id = pr.id AND a.asesor_id = ?)
       ORDER BY COALESCE(pr.published_at, pr.created_at) ASC`,
      [me.id]
    );
    const sudah = await all(
      `SELECT pr.*, u.nama AS penulis_nama,
              (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul,
              a.keputusan, a.updated_at AS dinilai_pada,
              (a.skor_masalah+a.skor_strategi+a.skor_bukti+a.skor_replikasi)/4 AS rata_saya
       FROM assessments a JOIN practices pr ON pr.id = a.practice_id
       JOIN users u ON u.id = pr.author_id
       WHERE a.asesor_id = ? ORDER BY a.updated_at DESC`,
      [me.id]
    );
    const rata = sudah.length
      ? sudah.reduce((s: number, r: any) => s + Number(r.rata_saya), 0) / sudah.length
      : null;
    return c.json({ antrean, sudah, statistik: { menunggu: antrean.length, sudah_dinilai: sudah.length, rata_nilai_saya: rata } });
  });

  // ---------- Admin ----------
  app.get("/api/admin/statistik", requireRole("admin"), async (c) => {
    const totalUser = await one("SELECT COUNT(*) AS n FROM users");
    const totalPraktik = await one("SELECT COUNT(*) AS n FROM practices");
    const terbit = await one("SELECT COUNT(*) AS n FROM practices WHERE status IN ('Terbit','Dinilai')");
    const dinilai = await one("SELECT COUNT(*) AS n FROM practices WHERE status = 'Dinilai'");
    const ulasan = await one("SELECT COUNT(*) AS n FROM reviews");
    const tersembunyi = await one("SELECT COUNT(*) AS n FROM reviews WHERE tersembunyi = 1");
    const log = await all(
      "SELECT l.*, u.nama FROM activity_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 30"
    );
    return c.json({
      total_pengguna: Number(totalUser?.n ?? 0),
      total_praktik: Number(totalPraktik?.n ?? 0),
      total_terbit: Number(terbit?.n ?? 0),
      total_dinilai: Number(dinilai?.n ?? 0),
      total_ulasan: Number(ulasan?.n ?? 0),
      ulasan_tersembunyi: Number(tersembunyi?.n ?? 0),
      log_terbaru: log,
    });
  });

  app.get("/api/admin/pengguna", requireRole("admin"), async (c) => {
    const rows = await all(
      "SELECT id, email, nama, nip, instansi, no_wa, status, role, profile_slug, created_at FROM users ORDER BY created_at DESC"
    );
    return c.json({ pengguna: rows });
  });

  app.post("/api/admin/pengguna", requireRole("admin"), async (c) => {
    const me = c.get("user") as SessionUser;
    const b = await bacaBody(c);
    const nama = String(b.nama ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const role = PERAN.includes(b.role) ? b.role : "asesor";
    const instansi = String(b.instansi ?? "").trim() || "-";
    const noWa = String(b.no_wa ?? "").trim() || "-";
    const status = STATUS_PENGGUNA.includes(b.status) ? b.status : "Guru";
    if (!nama || !emailValid(email) || password.length < 8)
      return c.json({ error: "Nama, email valid, dan kata sandi minimal 8 karakter wajib diisi." }, 400);
    const ada = await one("SELECT id FROM users WHERE email = ?", [email]);
    if (ada) return c.json({ error: "Email sudah terdaftar." }, 409);
    const slug = await slugUnik(nama, async (s) => !!(await one("SELECT id FROM users WHERE profile_slug = ?", [s])));
    const hash = await Bun.password.hash(password);
    const r = await run(
      "INSERT INTO users (email, password_hash, nama, nip, instansi, no_wa, status, role, profile_slug) VALUES (?,?,?,?,?,?,?,?,?)",
      [email, hash, nama, b.nip ?? null, instansi, noWa, status, role, slug]
    );
    await catatLog(me.id, "buat_akun", `Admin membuat akun ${role}: ${email}`);
    return c.json({ id: r.insertId }, 201);
  });

  app.put("/api/admin/pengguna/:id/peran", requireRole("admin"), async (c) => {
    const me = c.get("user") as SessionUser;
    const b = await bacaBody(c);
    if (!PERAN.includes(b.role)) return c.json({ error: "Peran tidak dikenal." }, 400);
    const target = await one("SELECT id FROM users WHERE id = ?", [c.req.param("id")]);
    if (!target) return c.json({ error: "Pengguna tidak ditemukan." }, 404);
    if (Number(c.req.param("id")) === me.id && b.role !== "admin")
      return c.json({ error: "Admin tidak boleh menurunkan perannya sendiri." }, 400);
    await run("UPDATE users SET role = ? WHERE id = ?", [b.role, target.id]);
    await catatLog(me.id, "ubah_peran", `Pengguna #${target.id} -> ${b.role}`);
    return c.json({ ok: true });
  });

  app.get("/api/admin/ulasan", requireRole("admin"), async (c) => {
    const rows = await all(
      `SELECT r.*, u.nama, u.instansi, pr.slug,
              (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul
       FROM reviews r JOIN users u ON u.id = r.user_id JOIN practices pr ON pr.id = r.practice_id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    return c.json({ ulasan: rows });
  });

  app.post("/api/admin/ulasan/:id/sembunyikan", requireRole("admin"), async (c) => {
    const b = await bacaBody(c);
    const sembunyi = b.tersembunyi === false || b.tersembunyi === 0 ? 0 : 1;
    const r = await run("UPDATE reviews SET tersembunyi = ? WHERE id = ?", [sembunyi, c.req.param("id")]);
    if (!r.affectedRows) return c.json({ error: "Ulasan tidak ditemukan." }, 404);
    return c.json({ ok: true });
  });

  app.get("/api/admin/praktik", requireRole("admin"), async (c) => {
    const rows = await all(
      `SELECT pr.*, u.nama AS penulis_nama,
              (SELECT field_value FROM practice_fields pf WHERE pf.practice_id = pr.id AND pf.field_key='judul') AS judul
       FROM practices pr JOIN users u ON u.id = pr.author_id ORDER BY pr.updated_at DESC LIMIT 100`
    );
    return c.json({ praktik: rows });
  });

  app.get("/api/admin/backup", requireRole("admin"), async (c) => {
    const data: Record<string, unknown> = {
      aplikasi: "GezyPraktik",
      versi: 1,
      diekspor_pada: new Date().toISOString(),
      users: await all("SELECT id, email, password_hash, nama, nip, instansi, no_wa, status, role, profile_slug, created_at FROM users"),
      practices: await all("SELECT * FROM practices"),
      practice_fields: await all("SELECT * FROM practice_fields"),
      attachments: await all("SELECT * FROM attachments"),
      ratings: await all("SELECT * FROM ratings"),
      reviews: await all("SELECT * FROM reviews"),
      assessments: await all("SELECT * FROM assessments"),
      activity_log: await all("SELECT * FROM activity_log"),
    };
    c.header("Content-Disposition", 'attachment; filename="gezypraktik-backup.json"');
    return c.json(data);
  });

  app.post("/api/admin/restore", requireRole("admin"), async (c) => {
    const me = c.get("user") as SessionUser;
    const b = await bacaBody(c);
    if (b.aplikasi !== "GezyPraktik" || !Array.isArray(b.users) || !Array.isArray(b.practices))
      return c.json({ error: "Berkas backup tidak valid (bukan backup GezyPraktik)." }, 400);
    const conn = await (await import("./db")).getConnection();
    try {
      await conn.beginTransaction();
      const q = (sql: string, params: any[] = []) => conn.query(sql, params);
      await q("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of ["activity_log", "assessments", "reviews", "ratings", "attachments", "practice_fields", "practices", "sessions", "users"]) {
        await q(`TRUNCATE TABLE ${t}`);
      }
      await q("SET FOREIGN_KEY_CHECKS = 1");
      for (const u of b.users) {
        await q("INSERT INTO users (id, email, password_hash, nama, nip, instansi, no_wa, status, role, profile_slug, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [u.id, u.email, u.password_hash, u.nama, u.nip, u.instansi, u.no_wa, u.status, u.role, u.profile_slug, u.created_at]);
      }
      for (const p of b.practices) {
        await q("INSERT INTO practices (id, slug, author_id, kategori, mapel, jenjang, kelas, ringkasan, status, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [p.id, p.slug, p.author_id, p.kategori, p.mapel, p.jenjang, p.kelas, p.ringkasan, p.status, p.created_at, p.updated_at, p.published_at]);
      }
      for (const f of b.practice_fields ?? []) {
        await q("INSERT INTO practice_fields (practice_id, field_key, field_value) VALUES (?,?,?)", [f.practice_id, f.field_key, f.field_value]);
      }
      for (const a of b.attachments ?? []) {
        await q("INSERT INTO attachments (id, practice_id, nama_file, jenis, path_or_url, ukuran, mime, created_at) VALUES (?,?,?,?,?,?,?,?)",
          [a.id, a.practice_id, a.nama_file, a.jenis, a.path_or_url, a.ukuran, a.mime, a.created_at]);
      }
      for (const r of b.ratings ?? []) {
        await q("INSERT INTO ratings (id, practice_id, user_id, bintang, updated_at) VALUES (?,?,?,?,?)", [r.id, r.practice_id, r.user_id, r.bintang, r.updated_at]);
      }
      for (const r of b.reviews ?? []) {
        await q("INSERT INTO reviews (id, practice_id, user_id, teks, tersembunyi, created_at) VALUES (?,?,?,?,?,?)", [r.id, r.practice_id, r.user_id, r.teks, r.tersembunyi, r.created_at]);
      }
      for (const a of b.assessments ?? []) {
        await q("INSERT INTO assessments (id, practice_id, asesor_id, skor_masalah, skor_strategi, skor_bukti, skor_replikasi, umpan_balik, keputusan, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [a.id, a.practice_id, a.asesor_id, a.skor_masalah, a.skor_strategi, a.skor_bukti, a.skor_replikasi, a.umpan_balik, a.keputusan, a.created_at, a.updated_at]);
      }
      for (const l of b.activity_log ?? []) {
        await q("INSERT INTO activity_log (id, user_id, aksi, detail, created_at) VALUES (?,?,?,?,?)", [l.id, l.user_id, l.aksi, l.detail, l.created_at]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await catatLog(me.id, "restore", "Backup JSON dipulihkan oleh admin");
    return c.json({ ok: true });
  });

  app.get("/api/admin/log", requireRole("admin"), async (c) => {
    const rows = await all(
      "SELECT l.*, u.nama FROM activity_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 100"
    );
    return c.json({ log: rows });
  });

  app.notFound((c) => c.json({ error: "Tidak ditemukan." }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Terjadi kesalahan di server." }, 500);
  });

  return app;
}

export const app = buildApp();

if (import.meta.main) {
  console.log(`GezyPraktik berjalan di http://127.0.0.1:${PORT}`);
  Bun.serve({ fetch: app.fetch, port: PORT });
}
