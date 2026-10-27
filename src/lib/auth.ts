import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import { query, queryOne } from "./db";
import { env } from "./env";
import { ApiError } from "./errors";

export const SESSION_COOKIE = "quiz_session";

export type { SessionUser } from "./services/users";
import type { SessionUser } from "./services/users";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string, secure: boolean) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + env.sessionDays * 86_400_000);
  await query("DELETE FROM sessions WHERE expires_at < now()");
  await query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [userId, hashToken(token), expires]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return queryOne<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)],
  );
});

/* ---- API guards: throw ApiError (JSON 401/403) ---- */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Please sign in.");
  return user;
}
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ApiError(403, "forbidden", "Administrator access is required.");
  return user;
}

/* ---- Page guards: redirect / 404 ---- */
export async function requirePageUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
export async function requirePageAdmin(): Promise<SessionUser> {
  const user = await requirePageUser("/admin");
  if (user.role !== "admin") notFound();
  return user;
}
