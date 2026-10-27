import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { ApiError } from "./errors";
import { env } from "./env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data ?? {}, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

/**
 * CSRF defence for cookie-authenticated requests: browsers always send Origin (or Sec-Fetch-Site) on
 * cross-site POST/PUT/PATCH/DELETE, so a mismatch is rejected. Session cookies are also SameSite=Lax.
 */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let parsed: URL | null = null;
    try { parsed = new URL(origin); } catch { /* fall through */ }
    if (parsed && (parsed.host === host || env.trustedOrigins.includes(parsed.origin))) return;
    throw new ApiError(403, "bad_origin", "Cross-origin request rejected.");
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ApiError(403, "bad_origin", "Cross-site request rejected.");
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function isHttps(req: NextRequest) {
  return env.cookieSecure ?? (req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:");
}

function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, ...(err.extra ?? {}) } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return json(
      {
        error: {
          code: "validation_error",
          message: "The request is not valid.",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  const pg = err as { code?: string; constraint?: string };
  if (pg?.code === "23505") return json({ error: { code: "conflict", message: "That value already exists.", constraint: pg.constraint } }, { status: 409 });
  console.error("Unhandled API error:", err);
  return json({ error: { code: "internal_error", message: "Something went wrong on the server." } }, { status: 500 });
}

/** Wrap a route handler: origin check, JSON serialisation and uniform error responses. */
export function route<C = unknown>(handler: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      if (!SAFE_METHODS.has(req.method)) assertSameOrigin(req);
      const result = await handler(req, ctx);
      return result instanceof Response ? result : json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S, maxBytes = 12 * 1024 * 1024): Promise<z.output<S>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ApiError(413, "too_large", "The request body is too large.");
  let body: unknown;
  try { body = await req.json(); } catch { throw new ApiError(400, "invalid_json", "The request body is not valid JSON."); }
  return schema.parse(body);
}

/** A 404 ApiError, e.g. `throw notFound("Attempt")`. */
export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
