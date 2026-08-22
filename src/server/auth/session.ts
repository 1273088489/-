import crypto from "node:crypto";
import { sqlite } from "../db/client";
import { sessions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { cookies } from "next/headers";

const db = drizzle(sqlite);
const SESSION_COOKIE = "qz_session";
export const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calc, "hex"));
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  db.insert(sessions).values({ userId, token, expiresAt }).run();
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function getSessionUserByToken(token: string | null | undefined) {
  if (!token) return null;
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .get();
  if (!row) return null;
  if (new Date(row.session.expiresAt).getTime() < Date.now()) return null;
  return row.user;
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  return getSessionUserByToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function logoutSession(token: string) {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

export async function getRawSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}
