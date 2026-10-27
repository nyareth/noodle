import { z } from "zod";
import { query, queryOne } from "../db";
import { env } from "../env";
import { ApiError, isUniqueViolation } from "../errors";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../password";
import { isUuid } from "../util";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "student" | "admin";
}

export const emailSchema = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid e-mail address");
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);

export const registerInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: emailSchema,
  password: passwordSchema,
});
export const loginInput = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});
export const createUserInput = registerInput.extend({ role: z.enum(["student", "admin"]).default("student") });
export const updateUserInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["student", "admin"]).optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const row = await queryOne<SessionUser & { password_hash: string; active: boolean }>(
    "SELECT id, email, name, role, password_hash, active FROM users WHERE email = $1",
    [email],
  );
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !row.active || !ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function assertRegistrationAllowed(email: string) {
  if (!env.allowRegistration) throw new ApiError(403, "registration_closed", "Self-registration is turned off. Ask an administrator for an account.");
  const domains = env.allowedEmailDomains;
  if (domains.length && !domains.includes(email.split("@")[1] ?? "")) {
    throw new ApiError(422, "email_domain_not_allowed", `Use your campus e-mail address (${domains.map((d) => "@" + d).join(", ")}).`);
  }
}

export async function createUser(input: { name: string; email: string; password: string; role: "student" | "admin" }): Promise<SessionUser> {
  const hash = await hashPassword(input.password);
  try {
    const row = await queryOne<SessionUser>(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role",
      [input.name, input.email, hash, input.role],
    );
    return row!;
  } catch (e) {
    if (isUniqueViolation(e, "users_email_key")) throw new ApiError(409, "email_taken", "An account with that e-mail already exists.");
    throw e;
  }
}

export interface UserListRow extends SessionUser {
  active: boolean;
  created_at: string;
  attempt_count: number;
  last_attempt_at: string | null;
}

export const listUsers = () =>
  query<UserListRow>(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.created_at,
            (SELECT count(*) FROM attempts a WHERE a.user_id = u.id) AS attempt_count,
            (SELECT max(a.started_at) FROM attempts a WHERE a.user_id = u.id) AS last_attempt_at
       FROM users u ORDER BY u.created_at, u.email`,
  );

export async function updateUser(id: string, patch: z.output<typeof updateUserInput>) {
  if (!isUuid(id)) throw new ApiError(404, "not_found", "User not found.");
  const sets: string[] = [];
  const params: unknown[] = [id];
  const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.role !== undefined) add("role", patch.role);
  if (patch.active !== undefined) add("active", patch.active);
  if (patch.password !== undefined) add("password_hash", await hashPassword(patch.password));
  if (!sets.length) throw new ApiError(422, "nothing_to_update", "Nothing to update.");
  const row = await queryOne<SessionUser & { active: boolean }>(
    `UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 RETURNING id, email, name, role, active`,
    params,
  );
  if (!row) throw new ApiError(404, "not_found", "User not found.");
  // Deactivating or changing the password signs the person out everywhere.
  if (patch.active === false || patch.password !== undefined) await query("DELETE FROM sessions WHERE user_id = $1", [id]);
  return row;
}
