/**
 * Fills the local PGlite database with made-up people for designing the leaderboard UI:
 * GitHub handles, display names, and hidden users, with and without countries.
 * Re-running replaces the previous seed. Refuses to run when DATABASE_URL is set.
 *
 *   pnpm db:seed           # .data/pglite with the real task set (data/tasks.json)
 *   pnpm dev:fixtures      # runs the seed first against .data/pglite-fixtures (3 tasks)
 *
 * `pnpm dev` and `pnpm dev:fixtures` run this seed before starting Next. Stop any running dev
 * server first: the PGlite directory can only be opened by one process.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Task, TasksFile } from "../src/lib/data-types";
import { COUNTRIES } from "../src/lib/countries";
import { attempts, shares, users, type AttemptOutcome, type ScoreResult } from "../src/lib/db/schema";
import { computeAttemptMetrics } from "../src/lib/metrics";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set. The seed only writes to the local PGlite database.");
  process.exit(1);
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const ATTEMPT_MS = 15 * MIN;
const SEED_PREFIX = "seed-";

const GITHUB_LOGINS = [
  "mkoval",
  "tanakahiro",
  "sofia-ramirez-dev",
  "jbauer",
  "nnguyen-ops",
  "rustacean-pete",
  "the-real-oakley",
  "lena_k",
  "abdullahi-m",
  "gh-user-with-a-really-long-handle-x",
  "ivanpetrov",
  "soph-ie",
];
const DISPLAY_NAMES = [
  "Priya S.",
  "Dana Whitfield",
  "Ångström Kaur",
  "Maximilian Okonkwo-Vasquez",
  "🦊 Foxhound",
  "O'Brien",
  "Yuki",
  "Chidi A.",
  "Eleni Papadopoulou",
  "Sam (they/them)",
  "Ruth Adeyemi-Thompson",
  "Kofi",
];
const HIDDEN_LOGINS = ["stealth-coder", "anon-ish", "no-name-42", "private-dev", "ghost-ops", "quiet-bytes"];
const COUNTRY_POOL = [
  "US", "GB", "DE", "FR", "BR", "JP", "IN", "NG", "KR", "CA", "AU", "MX", "ES", "IT",
  "NL", "SE", "ZA", "TR", "PL", "EG", "AR", "IE", "NZ", "PH", "UA", "VN",
];
/** Attempts per person, most active first. Capped at the size of the task set. */
const ATTEMPT_COUNTS = [38, 31, 27, 22, 19, 16, 14, 12, 11, 10, 9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 6, 9, 13, 2];

type Handle = "github" | "name" | "hidden";

interface Persona {
  index: number;
  id: string;
  login: string;
  githubId: number;
  handle: Handle;
  leaderboardName: string | null;
  avatarUrl: string | null;
  country: string | null;
  skill: number;
}

/** Deterministic PRNG (mulberry32) so re-seeding gives the same people and attempts. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let k = a.length - 1; k > 0; k--) {
    const m = Math.floor(rand() * (k + 1));
    [a[k], a[m]] = [a[m], a[k]];
  }
  return a;
}

function buildPersonas(): Persona[] {
  const specs: { login: string; handle: Handle; name: string | null }[] = [
    ...GITHUB_LOGINS.map((login) => ({ login, handle: "github" as const, name: null })),
    ...DISPLAY_NAMES.map((name, k) => ({ login: `named-${k + 1}`, handle: "name" as const, name })),
    ...HIDDEN_LOGINS.map((login) => ({ login, handle: "hidden" as const, name: null })),
  ];
  return specs.map((spec, i) => {
    const country = i % 4 === 3 ? null : COUNTRY_POOL[(i * 7) % COUNTRY_POOL.length];
    if (country && !COUNTRIES.some((c) => c.code === country)) throw new Error(`Bad seed country ${country}`);
    return {
      index: i,
      id: `${SEED_PREFIX}user-${String(i + 1).padStart(2, "0")}`,
      login: spec.login,
      githubId: 900_000_000 + i,
      handle: spec.handle,
      leaderboardName: spec.handle === "name" ? spec.name : null,
      avatarUrl:
        spec.handle === "name" || (spec.handle === "github" && i % 5 === 4)
          ? null
          : `https://github.com/identicons/${spec.login}.png`,
      country,
      skill: 0.12 + (((i * 37) % 100) / 100) * 0.75,
    };
  });
}

async function main() {
  const fixtures = process.env.ABT_FIXTURES === "1";
  const tasksPath = path.resolve(process.cwd(), fixtures ? "e2e/fixtures/tasks.json" : "data/tasks.json");
  const tasks = (JSON.parse(readFileSync(tasksPath, "utf8")) as TasksFile).tasks as Task[];

  const dir = path.resolve(process.env.PGLITE_DIR ?? (fixtures ? ".data/pglite-fixtures" : ".data/pglite"));
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

  await db.delete(users).where(like(users.id, `${SEED_PREFIX}%`));

  const rand = rng(20261018);
  const now = Date.now();
  const personas = buildPersonas();
  const userRows: (typeof users.$inferInsert)[] = [];
  const shareRows: (typeof shares.$inferInsert)[] = [];
  const attemptRows: (typeof attempts.$inferInsert)[] = [];

  for (const p of personas) {
    const createdAt = new Date(now - (30 + p.index) * DAY);
    const displayName = p.leaderboardName ?? p.login;
    userRows.push({
      id: p.id,
      githubId: p.githubId,
      login: p.login,
      name: displayName,
      avatarUrl: p.avatarUrl,
      seed: Math.floor(rand() * 1_000_000_000),
      leaderboardName: p.leaderboardName,
      leaderboardHidden: p.handle === "hidden",
      country: p.country,
      createdAt,
      lastSeenAt: new Date(now - rand() * 10 * DAY),
      tourCompletedAt: createdAt,
    });
    if (p.handle !== "hidden" && p.index % 2 === 0) {
      shareRows.push({
        id: `${SEED_PREFIX}share-${p.index + 1}`,
        userId: p.id,
        displayName,
        public: p.index % 4 !== 0,
      });
    }

    const count = Math.min(ATTEMPT_COUNTS[p.index], tasks.length);
    for (const [j, task] of shuffled(tasks, rand).slice(0, count).entries()) {
      const endedAt = new Date(now - rand() * 60 * DAY);
      let outcome: AttemptOutcome;
      let outcomeReason: string;
      let elapsedMs: number | null;
      let diff: string | null = null;
      let result: ScoreResult | null = null;

      if (rand() < 0.04) {
        outcome = "excluded";
        outcomeReason = "seed_excluded";
        elapsedMs = null;
      } else if (rand() < p.skill) {
        outcome = "resolved";
        outcomeReason = "resolved";
        elapsedMs = Math.round((3 + rand() * 11) * MIN);
        diff = task.patch;
      } else if (rand() < 0.15) {
        outcome = "unresolved";
        outcomeReason = "no_patch";
        elapsedMs = ATTEMPT_MS;
      } else {
        outcome = "unresolved";
        outcomeReason = "tests_failed";
        elapsedMs = Math.round((6 + rand() * 9) * MIN);
        diff = task.patch;
        const total = task.fail_to_pass.length;
        const bugFixed = rand() < 0.2;
        const passed = bugFixed ? total : Math.floor(rand() * total);
        const brokeOthers = bugFixed ? 1 + Math.floor(rand() * 2) : 0;
        result = {
          schema: 1,
          instance_id: task.instance_id,
          submission_id: null,
          outcome: "unresolved",
          resolved: false,
          reason: "tests_failed",
          tests: {
            fail_to_pass: { passed: [], failed: [], passed_count: passed, failed_count: total - passed },
            pass_to_pass: { failed: [], passed_count: 0, failed_count: brokeOthers },
          },
          harness: { package: "seed", version: null, dataset: "seed" },
          duration_s: elapsedMs / 1000,
        };
      }

      const startedAt = new Date(endedAt.getTime() - (elapsedMs ?? 10 * MIN));
      const flagged = p.index === 5 && j === 0;
      attemptRows.push({
        id: `${SEED_PREFIX}att-${p.index + 1}-${j + 1}`,
        userId: p.id,
        instanceId: task.instance_id,
        status: "submitted",
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + ATTEMPT_MS),
        endedAt,
        elapsedMs,
        flagged,
        flagReasons: flagged ? ["large_external_paste"] : [],
        outcome,
        outcomeReason,
        metrics:
          outcome === "excluded"
            ? null
            : computeAttemptMetrics({
                elapsedMs: elapsedMs ?? ATTEMPT_MS,
                resolved: outcome === "resolved",
                reason: outcomeReason,
                diff,
                result,
                task,
              }),
      });
    }
  }

  for (let k = 0; k < userRows.length; k += 100) await db.insert(users).values(userRows.slice(k, k + 100));
  if (shareRows.length) await db.insert(shares).values(shareRows);
  for (let k = 0; k < attemptRows.length; k += 200) await db.insert(attempts).values(attemptRows.slice(k, k + 200));

  const withCountry = personas.filter((p) => p.country).length;
  const hidden = personas.filter((p) => p.handle === "hidden").length;
  console.log(
    `Seeded ${personas.length} people (${withCountry} with a country, ${hidden} hidden) with ${attemptRows.length} attempts ` +
      `across ${tasks.length} tasks in ${dir}`,
  );
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
