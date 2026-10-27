import { Pool, types, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env";

// Return bigint (count(*)) and numeric (score_percent) as JS numbers - safe at this scale.
types.setTypeParser(20, (v) => Number.parseInt(v, 10));
types.setTypeParser(1700, (v) => Number.parseFloat(v));

const g = globalThis as unknown as { __quizPool?: Pool };

function getPool(): Pool {
  if (!g.__quizPool) {
    g.__quizPool = new Pool({ connectionString: env.databaseUrl, max: 10 });
    g.__quizPool.on("error", (err) => console.error("Postgres pool error", err));
  }
  return g.__quizPool;
}

/** Anything that can run a query: the pool or a transaction client. */
export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

export const pool: Db = { query: (text, params) => getPool().query(text, params) };

export async function query<R extends QueryResultRow>(text: string, params: unknown[] = [], db: Db = pool): Promise<R[]> {
  return (await db.query<R>(text, params)).rows;
}

export async function queryOne<R extends QueryResultRow>(text: string, params: unknown[] = [], db: Db = pool): Promise<R | null> {
  return (await db.query<R>(text, params)).rows[0] ?? null;
}

/** Run `fn` in a transaction; commits on return, rolls back on throw. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (g.__quizPool) { await g.__quizPool.end(); g.__quizPool = undefined; }
}
