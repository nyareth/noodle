/** Browser-side helper for calling the JSON API. */
export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  let data: { error?: { code?: string; message?: string } & Record<string, unknown> } | null = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    throw new ApiClientError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `Request failed (${res.status}).`, data?.error);
  }
  return data as T;
}

/** Only allow same-site relative redirects after login. */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");
