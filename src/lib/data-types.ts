// Shapes of the JSON snapshots in /data. Shared by the ingestion scripts and the app.

export const DATASET_NAME = "SWE-bench/SWE-bench_Verified";
export const DIFFICULTY_POOL = "<15 min fix";

export interface DatasetSource {
  dataset: string;
  revision: string;
  fetched_at: string;
}

export interface Candidate {
  instance_id: string;
  repo: string;
  base_commit: string;
  version: string;
  created_at: string;
  /** First line of the issue, used as a short title. */
  title: string;
  problem_statement: string;
  /** Never shown before or during an attempt. Revealed afterwards for learning. */
  hints_text: string;
  /** Reference (gold) patch. Server-only; revealed after the attempt is scored. */
  patch: string;
  fail_to_pass: string[];
  pass_to_pass_count: number;
  image: string;
}

export interface CandidatesFile {
  source: DatasetSource;
  difficulty: string;
  count: number;
  candidates: Candidate[];
}

export interface ValidationRun {
  outcome: "resolved" | "unresolved" | "patch_apply_failed" | "infra_error";
  reason?: string | null;
  duration_s?: number;
}

export interface ValidationRecord {
  instance_id: string;
  gold: ValidationRun;
  noop: ValidationRun;
  image_size_bytes?: number | null;
  disk_free_bytes_after?: number | null;
  harness_version: string;
  run_url?: string;
  validated_at: string;
}

export interface ValidationFile {
  harness_version: string;
  updated_at: string;
  records: Record<string, ValidationRecord>;
}

export interface Task extends Candidate {
  /** Index in the canonical (sorted) task list; stable ID used for compact storage. */
  index: number;
  validated: boolean;
  bundle_bytes?: number;
}

export interface TasksFile {
  source: DatasetSource;
  harness_version: string;
  selected_at: string;
  selection: {
    method: string;
    pool_size: number;
    validated_pool_size: number;
    per_repo: Record<string, number>;
    /** Manually excluded tasks and why. */
    excluded?: Record<string, string>;
    /** Tasks that failed validation and why. */
    rejected?: Record<string, string>;
  };
  tasks: Task[];
}

export interface ModelEntry {
  /** Directory name in SWE-bench/experiments, e.g. 20260901_mini-v2.4.2_gemini-3-5-flash. */
  id: string;
  name: string;
  model: string;
  model_org: string | null;
  agent: string;
  bash_only: boolean;
  /** Agent systems that combine several models ("Multiple"); left out of the per-model view. */
  multi_model?: boolean;
  /** Submission date (YYYY-MM-DD) taken from the directory prefix. */
  date: string;
  /** Resolve rate on all 500 Verified tasks as reported by the leaderboard (percent). */
  verified_resolved_pct: number | null;
  /** Indices into ModelsFile.pool of the tasks this entry resolved. Missing = unresolved. */
  resolved: number[];
}

export interface ModelsFile {
  source: { repo: string; commit: string; fetched_at: string };
  /** Candidate pool instance ids; ModelEntry.resolved indexes into this list. */
  pool: string[];
  entries: ModelEntry[];
}
