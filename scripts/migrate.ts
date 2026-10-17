/**
 * Applies drizzle/ migrations to the database in DATABASE_URL (Neon).
 * Runs as part of the Vercel build so schema and code ship together.
 *
 *   DATABASE_URL=... pnpm db:migrate
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL not set; skipping migrations (local dev uses PGlite and migrates on startup).");
    return;
  }
  await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
