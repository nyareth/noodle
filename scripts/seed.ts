import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const { closePool, queryOne } = await import("../src/lib/db");
  const { createUser } = await import("../src/lib/services/users");
  const { commitImport } = await import("../src/lib/services/importer");

  const email = (process.env.ADMIN_EMAIL ?? "admin@campus.test").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.ADMIN_NAME ?? "Quiz Administrator";

  if (!(await queryOne("SELECT 1 FROM users WHERE email = $1", [email]))) {
    await createUser({ name: adminName, email, password, role: "admin" });
    console.log(`Created admin ${email}`);
    if (process.env.NODE_ENV === "production" && password === "ChangeMe123!") {
      console.warn("WARNING: the admin still has the default password. Change ADMIN_PASSWORD or reset it from Admin > Users.");
    }
  } else console.log(`Admin ${email} already exists`);

  if ((process.env.SEED_DEMO_DATA ?? "true").toLowerCase() !== "false") {
    if (!(await queryOne("SELECT 1 FROM users WHERE email = 'student@campus.test'"))) {
      await createUser({ name: "Demo Student", email: "student@campus.test", password: "Student123!", role: "student" });
      console.log("Created demo student student@campus.test / Student123!");
    }
    const sample = JSON.parse(readFileSync(path.join(process.cwd(), "sample-data", "net101.json"), "utf8"));
    const r = await commitImport(sample, "skip");
    console.log(`Sample subject "${r.subject_name}": ${r.created} created, ${r.skipped} already present`);
  }
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
