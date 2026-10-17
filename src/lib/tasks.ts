import "server-only";
import realTasks from "../../data/tasks.json";
import fixtureTasks from "../../e2e/fixtures/tasks.json";
import type { Task, TasksFile } from "@/lib/data-types";

/** E2E/dev fixture mode swaps in a tiny synthetic task set with local bundles. */
export const FIXTURES = process.env.ABT_FIXTURES === "1";

const file = (FIXTURES ? fixtureTasks : realTasks) as unknown as TasksFile;
const byId = new Map(file.tasks.map((t) => [t.instance_id, t]));

export const taskIds: readonly string[] = file.tasks.map((t) => t.instance_id).sort();

export function getTasksFile(): TasksFile {
  return file;
}

export function getTask(id: string): Task | undefined {
  return byId.get(id);
}

export function bundleUrl(instanceId: string): string {
  const base = FIXTURES
    ? "/api/dev/bundles"
    : (process.env.BUNDLE_BASE_URL ?? "/bundles").replace(/\/$/, "");
  return `${base}/${instanceId}.json.gz`;
}

/** What the client may know before starting: only the repository. */
export function teaser(t: Task) {
  return { instance_id: t.instance_id, repo: t.repo, bundle_url: bundleUrl(t.instance_id) };
}

/** What the client sees during an attempt. Hints, gold patch, and tests stay hidden. */
export function briefing(t: Task) {
  return {
    instance_id: t.instance_id,
    repo: t.repo,
    title: t.title,
    base_commit: t.base_commit,
    version: t.version,
    created_at: t.created_at,
    problem_statement: t.problem_statement,
    bundle_url: bundleUrl(t.instance_id),
  };
}

/** Revealed once the attempt is over: tests, hints, and the reference patch. */
export function debrief(t: Task) {
  return {
    ...briefing(t),
    hints_text: t.hints_text,
    patch: t.patch,
    fail_to_pass: t.fail_to_pass,
    pass_to_pass_count: t.pass_to_pass_count,
  };
}

export function repoShort(repo: string) {
  return repo.split("/")[1] ?? repo;
}
