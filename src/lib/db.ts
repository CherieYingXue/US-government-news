import { mkdir, readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const localDir = process.env.PGLITE_DIR?.trim() || ".data/pglite";

type DbGlobals = { pool?: pg.Pool; local?: Promise<PGlite> };
// Dev-server module reloads must reuse one handle: two PGlite instances on one directory corrupt it.
const g = globalThis as typeof globalThis & { __trackerDb?: DbGlobals };
const state: DbGlobals = (g.__trackerDb ??= {});

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (databaseUrl !== "") {
    state.pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await state.pool.query(text, params)).rows as T[];
  }
  state.local ??= startLocal().catch((error: unknown) => {
    state.local = undefined;
    throw error;
  });
  return (await (await state.local).query<T>(text, params)).rows;
}

async function startLocal(): Promise<PGlite> {
  let db: PGlite;
  if (localDir === ":memory:") {
    db = new PGlite();
  } else {
    await mkdir(localDir, { recursive: true });
    db = new PGlite(localDir);
  }
  const files = (await readdir("migrations").catch(() => [])).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
