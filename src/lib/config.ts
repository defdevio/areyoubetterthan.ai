import "server-only";

function bool(v: string | undefined, fallback = false) {
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

const isProd = process.env.NODE_ENV === "production" && !bool(process.env.ABT_E2E);

export const config = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL,
  /** Local file for PGlite when DATABASE_URL is unset (dev). Use "memory://" in tests. */
  pgliteDir: process.env.PGLITE_DIR ?? ".data/pglite",
  sessionSecret:
    process.env.SESSION_SECRET ??
    (isProd ? "" : "dev-only-session-secret-change-me-dev-only-session-secret"),

  github: {
    /** "app" talks to GitHub; "mock" simulates PRs + scoring locally. */
    mode: (process.env.GITHUB_MODE ?? (process.env.GITHUB_APP_ID ? "app" : "mock")) as "app" | "mock",
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    submissionsRepo: process.env.SUBMISSIONS_REPO ?? "defdevio/areyoutbetterthan.ai-submissions",
    scoreWorkflow: process.env.SCORE_WORKFLOW ?? "score.yml",
  },

  /** Lets anyone sign in as a fake user. Never enabled in production. */
  devLogin: !isProd && bool(process.env.DEV_LOGIN, true),

  limits: {
    attemptMs: 15 * 60 * 1000,
    /** Network grace after the deadline for the auto-submit to land. */
    submitGraceMs: 30 * 1000,
    maxDiffBytes: 200 * 1024,
    maxDiffFiles: 30,
    maxActivePerUser: 3,
    maxActiveGlobal: Number(process.env.MAX_ACTIVE_JOBS ?? 18),
    maxAttemptsPerDay: 40,
    maxInfraRetries: 2,
  },

  /** Mock scoring delay so the async UX can be exercised locally. */
  mockScoreMs: Number(process.env.MOCK_SCORE_MS ?? 6000),
};

export function assertProductionConfig() {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (config.github.mode !== "app") missing.push("GITHUB_MODE=app (mock scoring is for development only)");
  if (!process.env.APP_URL) missing.push("APP_URL");
  if (!process.env.BUNDLE_BASE_URL) missing.push("BUNDLE_BASE_URL");
  if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push("SESSION_SECRET (>=32 chars)");
  if (config.github.mode === "app") {
    for (const [k, v] of Object.entries({
      GITHUB_APP_ID: config.github.appId,
      GITHUB_APP_PRIVATE_KEY: config.github.privateKey,
      GITHUB_APP_INSTALLATION_ID: config.github.installationId,
      GITHUB_CLIENT_ID: config.github.clientId,
      GITHUB_CLIENT_SECRET: config.github.clientSecret,
      GITHUB_WEBHOOK_SECRET: config.github.webhookSecret,
    })) {
      if (!v) missing.push(k);
    }
  }
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
}
