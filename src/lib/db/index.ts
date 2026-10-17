import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { config } from "@/lib/config";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { __abtDb?: Promise<DB> };

async function connect(): Promise<DB> {
  if (config.databaseUrl) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(config.databaseUrl), { schema }) as unknown as DB;
  }
  // Zero-setup local database. Migrations are applied on first use.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client: InstanceType<typeof PGlite>;
  if (config.pgliteDir.startsWith("memory://")) {
    client = new PGlite();
  } else {
    const dir = path.resolve(config.pgliteDir);
    mkdirSync(path.dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  globalForDb.__abtDb ??= connect().catch((err) => {
    globalForDb.__abtDb = undefined;
    throw err;
  });
  return globalForDb.__abtDb;
}

/** Test helper: swap in a fresh database. */
export function setDbForTests(db: Promise<DB> | undefined) {
  globalForDb.__abtDb = db;
}

export { schema };
