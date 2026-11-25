import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { one, run } from "./db";

// Pola login disalin dari GezyDafnil/GezyRaport — email + kata sandi,
// hash argon2id via Bun.password, sesi di tabel `sessions`, cookie
// HttpOnly "sesi" 7 hari. Peran: admin, asesor, peserta, pengunjung.

export interface SessionUser {
  id: number;
  email: string;
  nama: string;
  role: string;
  status: string;
  instansi: string;
  profile_slug: string;
}

const SESSION_DAYS = 7;

export async function createSession(userId: number): Promise<string> {
  const id = crypto.randomUUID();
  const expires_at = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  await run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)", [
    id,
    userId,
    expires_at,
  ]);
  return id;
}

export async function destroySession(id: string): Promise<void> {
  await run("DELETE FROM sessions WHERE id = ?", [id]);
}

export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const sid = getCookie(c, "sesi");
  if (!sid) return null;
  const s = await one(
    `SELECT s.user_id, s.expires_at, u.email, u.nama, u.role, u.status, u.instansi, u.profile_slug
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [sid]
  );
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    await destroySession(sid);
    return null;
  }
  return {
    id: s.user_id,
    email: s.email,
    nama: s.nama,
    role: s.role,
    status: s.status,
    instansi: s.instansi,
    profile_slug: s.profile_slug,
  };
}

export function setSessionCookie(c: Context, sid: string): void {
  setCookie(c, "sesi", sid, {
    httpOnly: true,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
    sameSite: "Lax",
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, "sesi", { path: "/" });
}

/** Middleware: user harus login dan role-nya termasuk yang diizinkan. */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const u = await getSessionUser(c);
    if (!u) return c.json({ error: "Belum login" }, 401);
    if (!roles.includes(u.role)) return c.json({ error: "Akses ditolak" }, 403);
    c.set("user", u);
    await next();
  };
}

/** Middleware: user harus login (peran apa pun). */
export async function requireLogin(c: Context, next: Next) {
  const u = await getSessionUser(c);
  if (!u) return c.json({ error: "Belum login" }, 401);
  c.set("user", u);
  await next();
}
