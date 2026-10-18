import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui";
import { FLAG_RULES } from "@/lib/flags";
import { RANK_MIN_TASKS } from "@/lib/leaderboard";
import { modelsSource, valsSource } from "@/lib/models";
import { getTasksFile } from "@/lib/tasks";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How tasks are chosen, how humans are scored, and how the comparison with AI models works.",
};

const SUBMISSIONS_REPO = process.env.SUBMISSIONS_REPO ?? "defdevio/areyoutbetterthan.ai-submissions";

function H({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 pt-6 text-xl font-semibold tracking-tight">
      <a href={`#${id}`} className="hover:text-human">
        {children}
      </a>
    </h2>
  );
}

export default function MethodologyPage() {
  const tasks = getTasksFile();
  const models = modelsSource();
  const vals = valsSource();
  const sel = tasks.selection;
  const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-3 text-muted">
          AI coding benchmarks report how often models fix real issues, but rarely how often <em>people</em> do under
          comparable conditions. This site is an attempt at that missing control group. Here is exactly how it works,
          including the parts that aren&apos;t a perfect comparison.
        </p>

        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-faint">
          {[
            ["tasks", "Tasks"],
            ["environment", "Environment"],
            ["scoring", "Scoring"],
            ["models", "Model comparison"],
            ["metrics", "Metrics"],
            ["stats", "Statistics"],
            ["leaderboard", "Leaderboard"],
            ["honor", "Honor system"],
            ["limits", "Limitations"],
            ["data", "Data & privacy"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="hover:text-fg">
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted [&_strong]:text-fg">
          <H id="tasks">Tasks</H>
          <p>
            Every task comes from <strong>SWE-bench Verified</strong> ({tasks.source.dataset}, revision{" "}
            <code className="text-xs">{tasks.source.revision.slice(0, 10)}</code>), a set of 500 real GitHub issues from popular
            Python projects that human annotators confirmed are well-specified and fairly tested. We use the{" "}
            <strong>{sel.pool_size} tasks the annotators rated “&lt;15 min fix”</strong>, so the 15-minute limit is plausible.
          </p>
          <p>
            Each candidate was then <strong>validated on a GitHub-hosted runner</strong> with the same harness used for scoring:
            the reference fix must resolve it, and a no-op patch must not (otherwise the tests can&apos;t tell a fix from no fix).{" "}
            {sel.validated_pool_size} passed. From those, {tasks.tasks.length} were drawn, stratified by repository so the mix
            matches the pool:
          </p>
          <Card className="grid grid-cols-2 gap-x-6 gap-y-1 p-4 font-mono text-xs sm:grid-cols-3">
            {Object.entries(sel.per_repo)
              .sort((a, b) => b[1] - a[1])
              .map(([repo, n]) => (
                <div key={repo} className="flex justify-between gap-2">
                  <span>{repo}</span>
                  <span className="text-fg">{n}</span>
                </div>
              ))}
          </Card>
          {(Object.keys(sel.rejected ?? {}).length > 0 || Object.keys(sel.excluded ?? {}).length > 0) && (
            <p className="text-sm">
              Left out:{" "}
              {[...Object.entries(sel.rejected ?? {}).map(([id, why]) => `${id} (failed validation: ${why})`),
                ...Object.entries(sel.excluded ?? {}).map(([id, why]) => `${id} (${why})`)].join("; ")}
              .
            </p>
          )}
          <p>
            Each person gets the tasks in their own <strong>random order</strong> (seeded per account), one attempt per task,
            with no skipping. That stops cherry-picking easy tasks and spreads human coverage across the whole set.
          </p>

          <H id="environment">Environment</H>
          <p>
            You work in a browser editor over the <strong>full repository at the task&apos;s base commit</strong>: file tree, quick
            open, full-text and regex search, multiple tabs, new files. Binary files, translations and very large files are
            listed but not loaded. You see the issue text exactly as the models did. <strong>Hints</strong> from the issue thread
            are hidden (the leaderboard doesn&apos;t give them to models either) and revealed afterwards.
          </p>
          <p>
            The clock is <strong>15 minutes</strong>, measured on the server from the moment you press Start. The repository
            downloads before the clock starts. At 0:00, whatever you&apos;ve changed is submitted automatically; if you close the
            tab, your last autosaved draft (saved every 10 seconds) is submitted for you.
          </p>
          <p>
            <strong>You cannot run code.</strong> That&apos;s the biggest difference from the agents, which could run tests and
            scripts in a shell. Running untrusted code for every visitor isn&apos;t something we can do safely for free. Keep it in
            mind when reading the numbers.
          </p>

          <H id="scoring">Scoring</H>
          <p>
            Your edits become a unified <code className="text-xs">git diff</code> in the browser, checked by re-applying it to the
            original files before it&apos;s sent. Each submission becomes a pull request in the public{" "}
            <a className="text-ai hover:underline" href={`https://github.com/${SUBMISSIONS_REPO}`}>
              {SUBMISSIONS_REPO}
            </a>{" "}
            repository, where a GitHub Actions workflow runs the <strong>official SWE-bench harness</strong> (
            <code className="text-xs">swebench=={tasks.harness_version}</code>) with the prebuilt task images, the same way
            leaderboard submissions are evaluated. Your diff is treated as data and only ever applied inside the task&apos;s
            Docker container. The workflow has no secrets.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Resolved</strong>: every FAIL_TO_PASS test (the ones that reproduce the bug) and every PASS_TO_PASS test
              (regression checks) passes.
            </li>
            <li>
              <strong>Unresolved</strong>: anything else, including a patch that doesn&apos;t apply, tests that time out, and an
              empty submission.
            </li>
            <li>
              <strong>Infrastructure errors</strong> (Docker, runner, network) are never counted against you. They&apos;re
              retried automatically up to twice, then flagged for a human to fix.
            </li>
          </ul>
          <p>Every PR and workflow log stays public as an audit trail. PRs are closed after scoring and never merged.</p>

          <H id="models">Model comparison</H>
          <p>
            Per-task model results come from{" "}
            <a className="text-ai hover:underline" href="https://github.com/SWE-bench/experiments">
              SWE-bench/experiments
            </a>{" "}
            (commit <code className="text-xs">{models.commit.slice(0, 7)}</code>, fetched {fmt(models.fetched_at)}), refreshed
            weekly. Of {models.entries} submissions with per-instance results, the default view keeps{" "}
            <strong>one row per model ({models.default_entries})</strong>: its most recent result, preferring the
            <strong> bash-only mini-SWE-agent scaffold</strong>, where every model gets the same minimal tools. That&apos;s the
            closest thing to an apples-to-apples model comparison. “All submissions” shows every agent+model entry instead.
          </p>
          <p>
            Comparisons are always <strong>on the subset of tasks you attempted</strong>: if you did 12 tasks, each model is
            scored on those 12, not on all 500. A model that didn&apos;t produce a patch for a task counts as unresolved, as on
            the leaderboard. Entries whose per-instance data disagrees with their published score by more than 2 points are
            excluded.
          </p>

          <p>
            A second, independent source is{" "}
            <a className="text-ai hover:underline" href={vals.url}>
              vals.ai
            </a>
            , which runs {vals.entries} models itself with the same bash-only harness and also reports{" "}
            <strong>wall-clock time and API cost per task</strong> (snapshot from {vals.date_modified ?? fmt(vals.fetched_at)}).
            Pick “vals.ai runs” on your results page to compare against it. Their time and cost figures are averages over all
            “{vals.band}” tasks rather than per task, so they describe the same difficulty band, not exactly your tasks.
          </p>

          <H id="metrics">Metrics</H>
          <p>
            The headline is the resolve rate, since that&apos;s what the leaderboard ranks on. We also record:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Time</strong>: from pressing Start to submitting, measured on the server. Auto-submits and abandoned
              attempts count as the full 15 minutes. We show the median per task and the median for correct fixes only, and
              a “solved within N minutes” curve.
            </li>
            <li>
              <strong>Bug tests passing</strong> (partial credit): the share of each task&apos;s FAIL_TO_PASS tests your patch
              makes pass, averaged over attempts. No patch or a patch that doesn&apos;t apply counts as 0.
            </li>
            <li>
              <strong>Found the right file</strong>: whether your patch changed at least one file the upstream fix changed,
              plus file-level F1 against it. It&apos;s a measure of locating the bug, independent of fixing it.
            </li>
            <li>
              <strong>Patch size</strong>: lines you changed relative to the upstream fix.
            </li>
            <li>
              <strong>How it ended</strong>: resolved; fixed the bug but broke other tests; partly fixed; didn&apos;t fix it;
              patch didn&apos;t apply; no patch; or tests timed out.
            </li>
          </ul>
          <p>
            For models, only resolve rate (both sources) and vals.ai&apos;s average time and cost are available. Human and
            model times aren&apos;t perfectly comparable: humans are capped at 15 minutes and time includes reading the issue;
            model time is uncapped and includes API latency.
          </p>

          <H id="stats">Statistics</H>
          <p>
            Rates come with <strong>Wilson 95% intervals</strong>, which behave sensibly for small samples and rates near 0% or
            100%. With a handful of tasks the intervals are wide, and we say so. “You beat N models” compares point estimates;
            overlapping intervals mean the difference may be noise. The global page pools all non-flagged attempts and also
            shows the mean of per-task human rates, so prolific players don&apos;t dominate. It stays hidden until there are
            enough attempts to be meaningful.
          </p>

          <H id="leaderboard">Leaderboard</H>
          <p>
            Everyone gets the tasks in a different random order and plays a different number of them, so a raw resolve rate
            would reward lucky draws and short records. The leaderboard instead ranks by a <strong>skill score</strong> from a
            one-parameter item response (Rasch) model: the chance you solve a task is σ(θ − b), where b is the task&apos;s
            difficulty and θ is your skill.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Difficulty</strong> comes from vals.ai&apos;s runs (one harness, every model, every task): the logit of the
              share of models that failed it. Fixing a task most models miss raises θ a lot; missing one they all fix lowers it.
            </li>
            <li>
              <strong>θ</strong> is a maximum a posteriori estimate under a normal prior (sd 1 logit) centred on the human
              population&apos;s pooled skill. Short records are pulled toward the average human; after a few dozen tasks your
              own results dominate.
            </li>
            <li>
              The score shown is the <strong>share of all {tasks.tasks.length} tasks you&apos;d be expected to resolve</strong> at
              that θ, the same scale as each model&apos;s resolve rate on the full set, so “beats N models” compares like with
              like. The likely range is ±1 posterior standard deviation.
            </li>
            <li>
              You&apos;re <strong>ranked after {RANK_MIN_TASKS} scored tasks</strong>; before that you&apos;re listed as
              provisional. Ties to 0.1% go to the faster median time on solved tasks. Flagged attempts don&apos;t count.
            </li>
          </ul>

          <H id="honor">Honor system</H>
          <p>
            Please don&apos;t use AI assistants or look up the actual fix. The reference patches are public, so we can&apos;t make
            cheating impossible. We don&apos;t block anything, but we record a few signals and <strong>flag</strong> attempts
            that trip them:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>a single paste of {FLAG_RULES.largeExternalPaste}+ characters from outside the workspace,</li>
            <li>{FLAG_RULES.totalExternalPaste}+ characters pasted from outside in total,</li>
            <li>
              a patch of {FLAG_RULES.fastSubmitMinLines}+ changed lines submitted within {FLAG_RULES.fastSubmitMs / 1000}{" "}
              seconds.
            </li>
          </ul>
          <p>
            Copying and pasting within the editor or from the issue doesn&apos;t count. Flagged attempts still appear in your own
            results but are excluded from the global human statistics and the leaderboard.
          </p>

          <H id="limits">Limitations</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>No code execution for humans; agents could run code.</li>
            <li>A 15-minute cap for humans; agents had no wall-clock limit.</li>
            <li>The people who show up are self-selected and probably above-average programmers.</li>
            <li>Some participants may already know a task&apos;s fix; the issues are public.</li>
            <li>Only the easiest SWE-bench Verified difficulty bucket is used.</li>
            <li>
              Model results were produced by their submitters, sometimes with older harness versions. We take them as
              published.
            </li>
          </ul>
          <p>Results are reported as they are, whichever side they make look good.</p>

          <H id="data">Data &amp; privacy</H>
          <p>
            We store your GitHub id, login and avatar URL; your attempts (start/end times, your diff, paste sizes and timings,
            but not paste contents); and scoring results. The GitHub sign-in token is used once to read your public profile and
            is never stored. Your diffs are public in the submissions repository, attributed to your GitHub login.
          </p>
          <p>
            The <strong>leaderboard is public</strong>: once you have a scored attempt you&apos;re listed by your GitHub login
            and avatar, with your skill, tasks solved and times. In My results you can switch to a display name (no avatar or
            GitHub link) or hide yourself entirely; hidden players still count in the pooled Humans vs AI totals. Share pages
            are opt-in and show only the display name you pick.
          </p>
          <p className="text-sm text-faint">
            Task snapshot selected {fmt(tasks.selected_at)}. Dataset fetched {fmt(tasks.source.fetched_at)}.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
