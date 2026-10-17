# areyoubetterthan.ai — Human control group for SWE-bench

## Problem
AI coding benchmarks (SWE-bench, etc.) report model resolve rates with no human baseline. This site lets a
human do the *exact same* SWE-bench Verified tasks under comparable conditions, scores them with the
*official SWE-bench harness* on public GitHub Actions runners, and compares the human's results
task-for-task against published model results.

## Key facts (verified)
- `princeton-nlp/SWE-bench_Verified` (500 tasks) has a `difficulty` field; **194 tasks are `<15 min fix`** → our pool.
- Fields available: `repo, instance_id, base_commit, problem_statement, hints_text, FAIL_TO_PASS, PASS_TO_PASS, patch, test_patch, version, environment_setup_commit`.
- `SWE-bench/experiments` repo → `evaluation/verified/<date>_<agent>_<model>/{metadata.yaml, results/, per_instance_details.json}`
  gives **per-instance resolved/unresolved per model** (latest entries Sept 2026).
- Official harness: `swebench.harness.run_evaluation` with prebuilt `swebench/sweb.eval.x86_64.*` Docker Hub images.

## Decisions (confirmed with user)
| Area | Decision |
|---|---|
| Work environment | In-browser Monaco editor over the repo at `base_commit`; **no code execution** (disclosed on results) |
| Identity | Sign in with GitHub (OAuth via GitHub App) |
| Anti-cheat | Honor system + strict UI: hard 15-min timer (auto-submit at 0:00), `hints_text` hidden, record time-to-submit + paste events; flag, don't block |
| Scoring UX | Non-blocking: user can start next task; scores land in a results tray as PR checks finish |
| Stack | Next.js (App Router, TS) on Vercel Hobby + Neon Postgres (free) + GitHub App. ~$0 besides domain |

## Architecture
```
Browser (Next.js/Monaco) ──► Vercel API routes ──► Neon Postgres
   │ file contents (CORS)        │ GitHub App (bot)
   ▼                             ▼
 task source bundles      public repo: defdevio/areyoubetterthan.ai-submissions
 (GitHub Pages / R2)        bot branch feat/<user>-<instance>-<id>
                            PR adds submissions/<instance>/<id>.diff only
                            ▼
                         `score.yml` (pull_request) → swebench harness in Docker
                            ▼ artifact report.json
                         workflow_run.completed webhook ──► Vercel ──► DB ──► results tray
```

### Repos
1. **`areyoubetterthan.ai`** (this dir): Next.js app, data scripts, DB migrations.
2. **`defdevio/areyoubetterthan.ai-submissions`** (public): scoring workflow + one PR per submission (audit trail). PRs are
   auto-closed (never merged) after scoring; branches deleted. Kept separate so PR volume and the
   untrusted-code workflow are isolated from the app.

### Task set (100 tasks)
- Script pulls the 194 `<15 min fix` tasks, then **validates each on a GitHub public runner**: gold patch must
  resolve, empty patch must fail, and image must fit runner disk/time. Pick 100 that pass, spread across repos.
- Snapshot to `data/tasks.json` (no `patch`/`hints_text`/`test_patch` shipped to client).
- Per-user **seeded random order** so coverage is spread across all 100.

### Model comparison data
- Script ingests `SWE-bench/experiments/evaluation/verified/*` → `data/models.json`
  (model, agent/scaffold, date, per-instance resolved for our 100).
- Default comparison: most recent result per model, preferring the **bash-only/mini-swe-agent** scaffold
  (apples-to-apples); toggle to "all submissions".
- Scheduled GitHub Action (weekly) re-runs ingestion and opens a PR with refreshed data.

### In-browser editor
- Per-task **source bundle** (text files at `base_commit`, gzipped JSON/tar) pre-built by script and hosted on
  GitHub Pages of the data repo (CORS `*`, free); fall back to Cloudflare R2 free tier if size > Pages limit.
  Keeps Vercel bandwidth near zero.
- File tree + filename filter, full-text repo search in a Web Worker (AI agents grep, so humans need search),
  multi-tab Monaco, "modified files" panel, reset-file.
- Client generates a unified `git diff` (jsdiff) for modified files; round-trip validated client-side.

### Submission + scoring pipeline
1. `POST /api/submissions` (auth'd): diff, instance_id, elapsed ms, paste events. Server validates: size cap,
   paths are relative & inside repo, timer not exceeded (server-side start timestamp), rate limit per user.
2. GitHub App commits `submissions/<instance_id>/<submission_id>.diff` + `meta.json` to a new branch, opens PR
   (title `[score] <instance_id> by @user`).
3. `score.yml` on `pull_request` (submissions repo):
   - `permissions: contents: read`, **no secrets**, concurrency group per PR, timeout.
   - Guard step: fail fast unless PR changes exactly one `submissions/**` dir and author is the bot.
   - Build `predictions.jsonl` from the diff → `run_evaluation --dataset_name princeton-nlp/SWE-bench_Verified
     --instance_ids <id> --namespace swebench` (pinned harness version).
   - Upload `report.json` artifact; write job summary. Runs whether the patch passes or fails.
4. GitHub App webhook `workflow_run.completed` → `POST /api/webhooks/github` (signature verified) → download
   artifact → classify: **resolved / unresolved / infra_error** (empty-apply failure = unresolved; harness/Docker
   errors = infra_error) → update DB → close PR, delete branch.
5. `infra_error` → auto re-run up to 2x; then mark `needs_attention` and auto-open an issue for us to fix.
   User sees "scoring delayed", never a false fail.
6. Client polls `/api/me/results` (or SSE) to fill the results tray.

### Results & comparison
- Human resolve rate **on the subset of tasks they attempted** vs each model's rate on that same subset
  (with Wilson 95% CI, since n is small).
- Per-task breakdown: you ✅/❌ vs "N of M models solved it"; highlight tasks the human solved that most models
  failed, and vice versa ("AI makes different mistakes").
- Aggregate "all humans" stats once there's data.
- Public share page `/r/<shareId>` + dynamic OG image (`@vercel/og`); opt-in, user chooses display name.
- Methodology page: task selection, the no-execution caveat, timer, honor system, harness version, data dates.
  Results are reported as-is regardless of which side looks better.

### Data model (Postgres, Drizzle ORM)
`users(id, github_id, login, created_at)` · `sessions/attempts(id, user_id, instance_id, started_at, submitted_at,
elapsed_ms, paste_events, flagged)` · `submissions(id, attempt_id, diff_sha, pr_number, run_id, status,
retries, report_json)` · `shares(id, user_id, created_at, public)`.

## Security notes
- User code only runs inside the SWE-bench container on an ephemeral GitHub runner with no secrets & read-only token.
- Workflow never comes from user content (bot authors the whole commit; user diff is stored as data, not applied to repo tree).
- Branch protection on `main` of submissions repo; only the App can push `feat/*`.
- Webhook HMAC verification; GitHub App private key only in Vercel env.
- Diff size limit + per-user rate limit (e.g. max concurrent scoring jobs) to respect Actions concurrency (~20 jobs).

## Open risks
- Some SWE-bench images may exceed public-runner disk/time → handled by validation step when picking the 100.
- Actions concurrency queueing under load → tray shows queue position; non-blocking UX absorbs it.
- GitHub ToS/abuse sensitivity around automated PR volume → keep PRs in one dedicated repo, close promptly.
- Cheating can't be fully prevented; flagged results excluded from aggregate stats.

## Todos
See SQL `todos` table (ids below).
1. `scaffold-app` – Next.js + TS + Tailwind, Drizzle/Neon, lint/test setup in this dir.
2. `task-ingest` – script: fetch Verified `<15 min fix` tasks → candidate list.
3. `submissions-repo` – create public `defdevio/areyoubetterthan.ai-submissions` repo + `score.yml` (guarded, no secrets) + validation workflow.
4. `task-validate` – run gold/empty patches on public runners; pick final 100 → `data/tasks.json`.
5. `source-bundles` – build/host per-task source bundles (Pages/R2).
6. `model-ingest` – ingest experiments repo → `data/models.json` + weekly refresh Action.
7. `github-app-auth` – GitHub App, OAuth sign-in, sessions.
8. `db-schema` – tables + migrations.
9. `editor-ui` – Monaco workspace, tree, search worker, timer, paste tracking, diff generation.
10. `submit-api` – validation, rate limits, bot branch + PR creation.
11. `webhook-scoring` – workflow_run webhook, artifact parsing, classification, retries, PR close, issues on infra error.
12. `results-tray` – live per-task status, continue flow.
13. `comparison-ui` – subset comparison, CIs, per-task breakdown, methodology page.
14. `share` – public share page + OG image.
15. `e2e-tests` – unit tests (diff gen, classification, stats) + Playwright happy path with mocked GitHub.
16. `deploy` – Vercel + Neon + domain + App webhook config, smoke test with a gold patch end to end.

## Implementation notes (first iteration)
Deviations from the plan above, and why:
- **Dataset**: the pinned harness (`swebench==5.0.2`) needs `image`/`eval_script` fields that only
  `SWE-bench/SWE-bench_Verified` has, so tasks and scoring use that dataset (same 500 instances and
  `difficulty` labels as `princeton-nlp/SWE-bench_Verified`).
- **Submissions repo** is `defdevio/areyoutbetterthan.ai-submissions` (configurable via `SUBMISSIONS_REPO`).
- **Validation** used a no-op patch (adds an untracked file) instead of an empty patch, because the
  harness skips empty predictions. 193/194 candidates finished: 192 passed; `django__django-10097`
  was rejected (passes without a fix); `psf__requests-2317` was excluded by hand (network-dependent
  tests hang on runners). Median harness time for gold patches was 64 s; images ≤ 7.1 GB.
- **Source bundles** are published from *this* repo's GitHub Pages (`bundles.yml`), keeping the
  untrusted-PR repo free of any workflow with write permissions. ~3 MB gzipped per task.
- **Model comparison**: `results/results.json` is preferred over `per_instance_details.json`; entries
  whose per-instance data disagrees with their published score by >2 pts are dropped (2 today);
  model names are normalized ("Claude Opus 4.5" = "Claude 4.5 Opus"); multi-model agent systems
  appear only under "All submissions".
- **Additions**: server-side draft autosave (an abandoned tab still gets its last draft scored),
  an in-app scoring queue with global/per-user caps, a mock GitHub backend for local dev/e2e,
  reference fix + hints revealed after each attempt, and a daily reconcile cron.

- **Richer metrics** (added after the first pass): per-attempt time, partial credit (FAIL_TO_PASS
  share), file-level localization vs. the upstream fix, patch size, and an outcome category are
  stored on `attempts.metrics`. A second model source, vals.ai (86 models run with one bash-only
  harness), adds per-task resolved lists plus average wall-clock time and cost per task on the
  "<15 min fix" band; it's parsed from page data (no API), validated, and refreshed weekly.

Status: todos 1–15 are implemented and tested. `deploy` needs the GitHub App, Neon, Vercel, and
the domain (see docs/SETUP.md).
