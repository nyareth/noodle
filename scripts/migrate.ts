import { loadEnvConfig } from "@next/env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

loadEnvConfig(process.cwd());

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset && process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("Refusing to reset a production database without --force.");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (reset) {
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      console.log("Schema reset.");
    }
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(path.join(dir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Applied ${file}`);
        applied++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log(applied ? `Done (${applied} applied).` : "Database is up to date.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
