import { createSession } from "@/lib/auth";
import { clientIp, isHttps, json, readJson, route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { assertRegistrationAllowed, createUser, registerInput } from "@/lib/services/users";

export const POST = route(async (req) => {
  const input = await readJson(req, registerInput, 10_000);
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);
  assertRegistrationAllowed(input.email);
  const user = await createUser({ ...input, role: "student" });
  await createSession(user.id, isHttps(req));
  return json({ user }, { status: 201 });
});
