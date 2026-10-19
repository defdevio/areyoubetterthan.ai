# Production setup

Everything below is free-tier except the domain. Do the steps in order; each one produces
values the next one needs. `APP_URL` below is the public URL, e.g. `https://areyoubetterthan.ai`.

## 1. Neon (database)

1. Create a Neon project (any region close to your Vercel region).
2. Copy the **pooled** connection string. That's `DATABASE_URL`.
3. Migrations run automatically on every Vercel deploy (`pnpm vercel-build`). To run them by
   hand: `DATABASE_URL=... pnpm db:migrate`.

## 2. GitHub App (sign-in + scoring bot)

Create it under the `defdevio` org: *Settings → Developer settings → GitHub Apps → New*.

| Setting | Value |
|---|---|
| Homepage URL | `APP_URL` |
| Callback URL | `APP_URL/api/auth/callback` |
| Expire user authorization tokens | on (we only use the token once) |
| Request user authorization during installation | off |
| Webhook URL | `APP_URL/api/webhooks/github` |
| Webhook secret | a long random string → `GITHUB_WEBHOOK_SECRET` |
| **Repository permissions** | Actions: Read & write · Contents: Read & write · Issues: Read & write · Pull requests: Read & write · Metadata: Read |
| Account permissions | none |
| Subscribe to events | **Workflow run** |
| Where can it be installed | Any account (public) |

Then:

1. Generate a private key. The PEM contents are `GITHUB_APP_PRIVATE_KEY` (newlines may be
   written as `\n`).
2. Note the App ID (`GITHUB_APP_ID`), Client ID (`GITHUB_CLIENT_ID`), and create a client secret
   (`GITHUB_CLIENT_SECRET`).
3. Install the app on **only** `defdevio/areyoutbetterthan.ai-submissions`. The installation id
   is the number at the end of the installation's settings URL (`GITHUB_APP_INSTALLATION_ID`).
4. The bot's login is `<app-slug>[bot]`, e.g. `areyoubetterthan-ai[bot]`.

## 3. Submissions repo settings

In `defdevio/areyoutbetterthan.ai-submissions`:

1. *Settings → Secrets and variables → Actions → Variables*: add `BOT_LOGIN` = the bot login
   from step 2. `score.yml` only scores PRs opened by this account.
2. *Settings → Actions → General → Fork pull request workflows*: **Require approval for all
   external contributors**.
3. *Settings → Branches*: protect `main` (require PRs, block force pushes). The app only
   pushes `feat/*` branches.
4. Create an issue label `needs-attention`. The app files issues there when scoring keeps
   failing for infrastructure reasons.

The validation workflow has already been run for the current task set. Rerun it with
`pnpm data:validate dispatch` + `pnpm data:validate collect` whenever the pool changes.

## 4. GitHub Pages (source bundles)

In this repo (`defdevio/areyoubetterthan.ai`):

1. *Settings → Pages → Source*: **GitHub Actions**.
2. Run the **bundles** workflow (it also runs on every change to `data/tasks.json`). It builds
   ~350 MB of gzipped bundles and deploys them.
3. `BUNDLE_BASE_URL` = `https://defdevio.github.io/areyoubetterthan.ai/bundles`.

Pages serves files with `Access-Control-Allow-Origin: *`, so the browser can fetch them
directly and Vercel bandwidth stays near zero.

Also in this repo: *Settings → Actions → General → Allow GitHub Actions to create and approve
pull requests*, for the weekly **refresh-models** workflow.

## 5. Vercel

1. Import `defdevio/areyoubetterthan.ai` (framework: Next.js). Vercel runs `pnpm vercel-build`,
   which migrates the database and builds.
2. Environment variables (Production): everything in [.env.example](../.env.example) under
   "Required in production" and "GitHub App", plus `GITHUB_MODE=app` and a random `CRON_SECRET`.
   The server refuses to start in production without them.
3. Add the domain and set `APP_URL` to it (redeploy after changing it).
4. `vercel.json` registers a daily cron to `/api/cron/reconcile`. It finishes abandoned
   attempts, re-checks stalled scoring, and prunes webhook delivery ids.

## 6. Smoke test

1. Open `APP_URL`, sign in with GitHub, start a task, and submit any change.
2. A PR titled `[score] <instance> by @you` appears in the submissions repo, and the **score**
   workflow runs.
3. Within a few minutes the result lands in the tray, the PR is closed with a comment, and its
   branch is deleted.
4. If the result never arrives, check *App settings → Advanced → Recent deliveries* (webhook
   status) and the Vercel function logs for `[scoring]` lines.

## Operating notes

- **Re-scoring**: re-running a `score` workflow on a PR updates the result automatically
  through the webhook. That's useful for `needs-attention` submissions after fixing infra.
- **Capacity**: `MAX_ACTIVE_JOBS` caps concurrent scoring runs (default 18, under the ~20 job
  limit for free public repos). Each user is limited to 3 concurrent jobs and 40 attempts per day.
  Excess submissions wait in the app's own queue, and the tray shows their position.
- **Task set changes**: re-run validation, `pnpm data:select`, commit `data/tasks.json`. Bundles
  redeploy automatically. Attempts on removed tasks stay in the DB but drop out of comparisons.
