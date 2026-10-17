# areyoubetterthan.ai

**The human control group for SWE-bench.** Humans fix the same real GitHub issues that AI
coding agents are ranked on, in the browser, in 15 minutes. Their patches are graded by the
**official SWE-bench harness** on public GitHub Actions runners, and their results are compared
task-for-task with every model on the SWE-bench Verified leaderboard.

- App: Next.js 16 (App Router, Cache Components) · Tailwind 4 · Drizzle ORM on Neon Postgres
  (PGlite locally) · Monaco editor · GitHub App for sign-in and the scoring bot
- Scoring pipeline and public audit trail:
  [defdevio/areyoutbetterthan.ai-submissions](https://github.com/defdevio/areyoutbetterthan.ai-submissions)
- Design notes: [plan.md](plan.md) · production setup: [docs/SETUP.md](docs/SETUP.md)

## Run it locally

Requires Node 24+ and pnpm. No database or GitHub setup needed: without `DATABASE_URL` the app
uses an embedded PGlite database in `.data/`, scoring is simulated, and `/signin` lets you sign in
as any made-up user.

```sh
pnpm install

# Option A: tiny synthetic task set, works offline
pnpm dev:fixtures

# Option B: the real 100 tasks (downloads each repo at its base commit, ~350 MB of bundles)
pnpm data:bundles            # writes public/bundles/*.json.gz
pnpm dev
```

Open http://localhost:3000. Mock scoring resolves a patch if it touches a file the reference
fix touches. Put `MOCK_UNRESOLVED`, `MOCK_APPLY_FAIL`, `MOCK_INFRA_ONCE` or `MOCK_INFRA` in a
diff to exercise the other paths.

## How it works

```
Browser (Monaco) ─► Next.js API ─► Postgres
  │ source bundle (Pages)   │ GitHub App
  ▼                         ▼
 every text file at    PR adds submissions/<instance>/<id>.diff
 base_commit            ▼
                       score.yml → swebench harness in Docker → result.json artifact
                        ▼
                       workflow_run webhook → app → DB → results tray
```

1. **Tasks** ([data/tasks.json](data/tasks.json)): 100 tasks from the 194 SWE-bench Verified
   tasks rated "<15 min fix". Each was validated on a GitHub runner (gold patch resolves, no-op
   patch doesn't), then picked with repo-stratified sampling.
2. **Play** (`/play`): a per-user seeded order, so no cherry-picking. The repo bundle preloads
   before the clock starts. Then 15 minutes, measured on the server, in a workspace with a file
   tree, quick open, full-text/regex search in a Web Worker, tabs, new files, and a live diff.
   Drafts autosave every 10s; at 0:00 (or if the tab dies) the latest draft is submitted.
3. **Submit**: the browser builds a `git diff`, verifies it round-trips, and posts it. The server
   validates it (size, paths, deadline) and queues it. A dispatcher opens a PR in the submissions
   repo, capped globally (Actions concurrency) and per user (fairness).
4. **Score**: `score.yml` (no secrets, read-only token, guarded to bot PRs that add exactly two
   files) runs `swebench.harness.run_evaluation` and uploads `result.json`. The
   `workflow_run` webhook (HMAC-verified, idempotent) records `resolved`/`unresolved`, closes
   the PR, and deletes the branch. Infra errors are retried twice, then an issue is opened. They
   never count against the human. Polling reconciliation and a daily cron cover missed webhooks.
5. **Compare** (`/results`, `/stats`): each model is scored on exactly the subset of tasks you
   attempted, with Wilson 95% intervals. Beyond pass/fail, each attempt records time, partial
   credit (share of the bug's tests passing), whether it touched the right files, patch size vs.
   the upstream fix, and how it ended. Time and cost are compared against vals.ai's model runs. There's a per-task breakdown, the reference fix and hints
   after the attempt, an opt-in share page `/r/<id>` with an OG image, and a methodology page
   that discloses every difference between the human and model conditions.

## Data pipeline

| Command | What it does |
|---|---|
| `pnpm data:tasks` | Fetch SWE-bench Verified from Hugging Face → `data/candidates.json` (the "<15 min fix" pool) |
| `pnpm data:validate dispatch` / `collect` | Run `validate.yml` in the submissions repo for every candidate, then merge results → `data/validation.json` |
| `pnpm data:select` | Pick the final task set → `data/tasks.json` (validated only; hand exclusions live in `scripts/select-tasks.ts`) |
| `pnpm data:bundles` | Build per-task source bundles (`--out dir`, `--ids a,b`) |
| `pnpm data:models` | Ingest per-instance results from SWE-bench/experiments → `data/models.json` (also runs weekly in CI and opens a PR) |
| `pnpm data:vals` | Ingest vals.ai's uniform bash-only runs (resolved tasks, plus average time and cost per task on the "<15 min fix" band) → `data/vals.json` (weekly too) |

`data/tasks.json` contains reference patches and hints. It is only imported by server code
and those fields are only returned after an attempt is over.

## Tests

```sh
pnpm lint && pnpm typecheck
pnpm test            # unit + integration (diffs checked with real `git apply`, lifecycle on PGlite)
pnpm test:e2e        # Playwright against `next dev` with fixtures and mock scoring
pnpm test:e2e:prod   # same, against a production build
```

## Layout

```
src/app/                 pages + API routes (api/attempts, api/submissions, api/webhooks/github, …)
src/components/          workspace (editor, tree, search, timer), results, review, play flow
src/lib/game.ts          attempt lifecycle: order, start, autosave, submit, expiry
src/lib/scoring/         queue, dispatch, run handling, retries, reconcile
src/lib/github/          GitHub App backend + in-process mock
src/lib/models.ts        model comparison sets and subset rates
scripts/                 data ingestion, validation, selection, bundles, migrations
drizzle/                 SQL migrations
e2e/                     Playwright tests + fixture tasks
```
