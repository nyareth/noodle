import { queryOne } from "@/lib/db";
import { json } from "@/lib/http";

/** Liveness + database check for Docker / load balancers. No login required, reveals nothing else. */
export async function GET() {
  try {
    await queryOne("SELECT 1");
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}
