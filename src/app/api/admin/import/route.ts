import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { json, readJson, route } from "@/lib/http";
import { commitImport, previewImport } from "@/lib/services/importer";

const body = z.object({
  data: z.unknown(),
  mode: z.enum(["skip", "update"]).default("skip"),
  commit: z.boolean().default(false),
});

/** commit=false: validate and preview only (nothing is written). commit=true: import (all-or-nothing). */
export const POST = route(async (req) => {
  await requireAdmin();
  const { data, mode, commit } = await readJson(req, body, 25 * 1024 * 1024);
  if (!commit) return previewImport(data, mode);
  return json(await commitImport(data, mode), { status: 201 });
});
