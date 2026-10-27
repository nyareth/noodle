import { createSession } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { clientIp, isHttps, readJson, route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { authenticate, loginInput } from "@/lib/services/users";

export const POST = route(async (req) => {
  const { email, password } = await readJson(req, loginInput, 10_000);
  const ip = clientIp(req);
  rateLimit(`login:ip:${ip}`, 60, 15 * 60_000);
  rateLimit(`login:${ip}:${email}`, 10, 15 * 60_000);
  const user = await authenticate(email, password);
  if (!user) throw new ApiError(401, "invalid_credentials", "Incorrect e-mail or password.");
  await createSession(user.id, isHttps(req));
  return { user };
});
