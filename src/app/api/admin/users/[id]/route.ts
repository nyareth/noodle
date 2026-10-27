import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { readJson, route } from "@/lib/http";
import { updateUser, updateUserInput } from "@/lib/services/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const patch = await readJson(req, updateUserInput, 10_000);
  if (id === admin.id && (patch.active === false || patch.role === "student")) {
    throw new ApiError(422, "cannot_lock_yourself_out", "You cannot deactivate or demote your own account.");
  }
  return { user: await updateUser(id, patch) };
});
