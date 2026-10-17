import "server-only";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { unzipSync, strFromU8 } from "fflate";
import { config } from "@/lib/config";
import type { ScoreResult, Submission, User } from "@/lib/db/schema";
import { branchName, isScoreResult, type RunInfo, type ScoringBackend } from "./types";

function client() {
  const { appId, privateKey, installationId } = config.github;
  if (!appId || !privateKey || !installationId) throw new Error("GitHub App is not configured");
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: Number(installationId) },
    userAgent: "areyoubetterthan.ai",
  });
}

let cached: Octokit | null = null;
const gh = () => (cached ??= client());

function repo() {
  const [owner, name] = config.github.submissionsRepo.split("/");
  return { owner, repo: name };
}

function status(e: unknown): number | undefined {
  return (e as { status?: number })?.status;
}

export class GitHubAppBackend implements ScoringBackend {
  readonly kind = "app" as const;

  async dispatch(sub: Submission, user: Pick<User, "login">) {
    const o = gh();
    const r = repo();
    const branch = sub.branch ?? branchName(sub, user.login);
    const dir = `submissions/${sub.instanceId}`;

    const { data: main } = await o.git.getRef({ ...r, ref: "heads/main" });
    const baseSha = main.object.sha;
    const { data: baseCommit } = await o.git.getCommit({ ...r, commit_sha: baseSha });
    const meta = {
      submission_id: sub.id,
      instance_id: sub.instanceId,
      user: user.login,
      diff_sha256: sub.diffSha,
      files_changed: sub.filesChanged,
      lines_added: sub.linesAdded,
      lines_removed: sub.linesRemoved,
      submitted_at: sub.createdAt.toISOString(),
    };
    const { data: tree } = await o.git.createTree({
      ...r,
      base_tree: baseCommit.tree.sha,
      tree: [
        { path: `${dir}/${sub.id}.diff`, mode: "100644", type: "blob", content: sub.diff },
        { path: `${dir}/${sub.id}.meta.json`, mode: "100644", type: "blob", content: JSON.stringify(meta, null, 2) + "\n" },
      ],
    });
    const { data: commit } = await o.git.createCommit({
      ...r,
      message: `score ${sub.instanceId} (${sub.id})`,
      tree: tree.sha,
      parents: [baseSha],
    });
    try {
      await o.git.createRef({ ...r, ref: `refs/heads/${branch}`, sha: commit.sha });
    } catch (e) {
      // 422 = branch already exists from an earlier, interrupted dispatch: point it at our commit.
      if (status(e) !== 422) throw e;
      await o.git.updateRef({ ...r, ref: `heads/${branch}`, sha: commit.sha, force: true });
    }

    const title = `[score] ${sub.instanceId} by @${user.login}`;
    const body = [
      `Automated scoring run for a human attempt on [\`${sub.instanceId}\`](https://www.swebench.com/) from [areyoubetterthan.ai](${config.appUrl}).`,
      "",
      `- Submission: \`${sub.id}\``,
      `- Patch: ${sub.filesChanged} file(s), +${sub.linesAdded} / -${sub.linesRemoved}`,
      "",
      "This PR is scored by the `score` workflow and closed automatically. It is never merged.",
    ].join("\n");
    try {
      const { data: pr } = await o.pulls.create({ ...r, title, body, head: branch, base: "main" });
      return { branch, prNumber: pr.number };
    } catch (e) {
      if (status(e) !== 422) throw e;
      const { data: prs } = await o.pulls.list({ ...r, head: `${r.owner}:${branch}`, state: "open" });
      if (!prs[0]) throw e;
      return { branch, prNumber: prs[0].number };
    }
  }

  async findRun(sub: Submission): Promise<RunInfo | null> {
    if (!sub.branch) return null;
    const { data } = await gh().actions.listWorkflowRuns({
      ...repo(),
      workflow_id: config.github.scoreWorkflow,
      branch: sub.branch,
      event: "pull_request",
      per_page: 5,
    });
    const run = data.workflow_runs[0];
    if (!run) return null;
    return {
      id: run.id,
      status: run.status as RunInfo["status"],
      conclusion: run.conclusion,
      runAttempt: run.run_attempt ?? 1,
      htmlUrl: run.html_url,
    };
  }

  async fetchResult(_sub: Submission, run: RunInfo): Promise<ScoreResult | null> {
    const o = gh();
    const { data } = await o.actions.listWorkflowRunArtifacts({ ...repo(), run_id: run.id, name: "result" });
    const artifact = [...data.artifacts]
      .filter((a) => !a.expired)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    if (!artifact) return null;
    const res = await o.actions.downloadArtifact({
      ...repo(),
      artifact_id: artifact.id,
      archive_format: "zip",
    });
    const files = unzipSync(new Uint8Array(res.data as ArrayBuffer));
    const raw = files["result.json"];
    if (!raw) return null;
    const parsed = JSON.parse(strFromU8(raw)) as unknown;
    return isScoreResult(parsed) ? parsed : null;
  }

  async rerun(_sub: Submission, run: RunInfo) {
    await gh().actions.reRunWorkflowFailedJobs({ ...repo(), run_id: run.id }).catch(async (e) => {
      // Runs that "succeeded" without a result (e.g. skipped) can only be fully re-run.
      if (status(e) !== 403 && status(e) !== 422) throw e;
      await gh().actions.reRunWorkflow({ ...repo(), run_id: run.id });
    });
  }

  async closePr(sub: Submission, comment: string) {
    if (!sub.prNumber) return;
    const o = gh();
    const r = repo();
    await o.issues.createComment({ ...r, issue_number: sub.prNumber, body: comment });
    await o.pulls.update({ ...r, pull_number: sub.prNumber, state: "closed" });
    if (sub.branch) {
      await o.git.deleteRef({ ...r, ref: `heads/${sub.branch}` }).catch((e) => {
        if (status(e) !== 422 && status(e) !== 404) throw e;
      });
    }
  }

  async openIssue(title: string, body: string) {
    const { data } = await gh().issues.create({ ...repo(), title, body, labels: ["needs-attention"] });
    return data.number;
  }

  prUrl(sub: Submission) {
    return sub.prNumber ? `https://github.com/${config.github.submissionsRepo}/pull/${sub.prNumber}` : null;
  }
}
