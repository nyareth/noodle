import { requireAdmin } from "@/lib/auth";
import { json, readJson, route } from "@/lib/http";
import { createUser, createUserInput, listUsers } from "@/lib/services/users";

export const GET = route(async () => {
  await requireAdmin();
  return { users: await listUsers() };
});

export const POST = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, createUserInput, 10_000);
  return json({ user: await createUser(input) }, { status: 201 });
});
