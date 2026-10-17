/**
 * Builds one gzipped JSON "source bundle" per task: every text file of the repo at
 * base_commit, so the in-browser editor can browse and search the whole tree without
 * a backend. Files that are binary/huge/irrelevant are listed (so the tree is honest)
 * but their contents are omitted.
 *
 *   pnpm data:bundles                       # all tasks in data/tasks.json -> public/bundles
 *   pnpm data:bundles --ids a,b --out dir   # specific tasks
 *   pnpm data:bundles --from candidates     # whole candidate pool (size survey)
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { CandidatesFile, TasksFile } from "../src/lib/data-types";
import { BUNDLE_VERSION, type SourceBundle } from "../src/lib/bundle-types";
import { DATA_DIR, ROOT, arg, flag, readJson, writeJson } from "./lib/util";

const REPO_CACHE = path.join(ROOT, ".cache", "repos");
const MAX_FILE_BYTES = 512 * 1024;

const BINARY_EXT = new Set(
  (
    "png jpg jpeg gif bmp ico icns webp tif tiff psd pdf eps ps svgz zip gz tgz bz2 xz 7z tar whl egg " +
    "so dylib dll exe bin o a pyc pyo pyd class jar npy npz pkl pickle h5 hdf5 nc fits fit fts mat " +
    "sav db sqlite sqlite3 mo woff woff2 ttf otf eot afm pfb pfa mp3 mp4 wav ogg avi mov dat bz"
  ).split(" "),
);
const OMIT_PATTERNS: [RegExp, string][] = [
  [/(^|\/)locale\/[^/]+\/LC_MESSAGES\/[^/]+\.po$/, "translation"],
  [/\.min\.(js|css)$/, "minified"],
  [/\.(svg|map)$/, "asset"],
  [/(^|\/)\.git\//, "vcs"],
];

function git(repoDir: string, args: string[]) {
  return execFileSync("git", args, { cwd: repoDir, maxBuffer: 256 * 1024 * 1024 }).toString();
}

async function ensureCommit(repo: string, sha: string): Promise<string> {
  const dir = path.join(REPO_CACHE, repo.replace("/", "__"));
  if (!existsSync(path.join(dir, ".git"))) {
    await mkdir(dir, { recursive: true });
    git(dir, ["init", "--quiet"]);
    git(dir, ["remote", "add", "origin", `https://github.com/${repo}.git`]);
  }
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: dir, stdio: "ignore" });
  } catch {
    execFileSync("git", ["fetch", "--quiet", "--depth", "1", "origin", sha], {
      cwd: dir,
      stdio: "inherit",
    });
  }
  return dir;
}

interface TreeEntry {
  mode: string;
  type: string;
  sha: string;
  size: number;
  path: string;
}

function listTree(dir: string, sha: string): TreeEntry[] {
  const out = git(dir, ["ls-tree", "-r", "-l", "-z", sha]);
  return out
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, p] = line.split("\t");
      const [mode, type, objSha, size] = meta.split(/\s+/);
      return { mode, type, sha: objSha, size: size === "-" ? 0 : Number(size), path: p };
    });
}

/** Reads many blobs through a single `git cat-file --batch` process. */
function readBlobs(dir: string, shas: string[]): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["cat-file", "--batch"], { cwd: dir });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`git cat-file exited ${code}`));
      const buf = Buffer.concat(chunks);
      const result = new Map<string, Buffer>();
      let pos = 0;
      while (pos < buf.length) {
        const nl = buf.indexOf(10, pos);
        const header = buf.subarray(pos, nl).toString();
        const [sha, , size] = header.split(" ");
        const len = Number(size);
        result.set(sha, buf.subarray(nl + 1, nl + 1 + len));
        pos = nl + 1 + len + 1;
      }
      resolve(result);
    });
    proc.stdin.end(shas.join("\n") + "\n");
  });
}

function omitReason(entry: TreeEntry): string | null {
  if (entry.type === "commit") return "submodule";
  if (entry.mode === "120000") return "symlink";
  const ext = entry.path.split(".").pop()?.toLowerCase() ?? "";
  if (BINARY_EXT.has(ext)) return "binary";
  for (const [re, reason] of OMIT_PATTERNS) if (re.test(entry.path)) return reason;
  if (entry.size > MAX_FILE_BYTES) return "too large";
  return null;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

export async function buildBundle(task: {
  instance_id: string;
  repo: string;
  base_commit: string;
}): Promise<{ bundle: SourceBundle; gz: Buffer }> {
  const dir = await ensureCommit(task.repo, task.base_commit);
  const entries = listTree(dir, task.base_commit);
  const omitted: Record<string, string> = {};
  const wanted: TreeEntry[] = [];
  for (const e of entries) {
    const reason = omitReason(e);
    if (reason) omitted[e.path] = reason;
    else wanted.push(e);
  }
  const blobs = await readBlobs(
    dir,
    [...new Set(wanted.map((e) => e.sha))],
  );
  const files: Record<string, string> = {};
  for (const e of wanted) {
    const buf = blobs.get(e.sha);
    if (!buf) {
      omitted[e.path] = "unreadable";
      continue;
    }
    if (buf.includes(0)) {
      omitted[e.path] = "binary";
      continue;
    }
    try {
      files[e.path] = decoder.decode(buf);
    } catch {
      omitted[e.path] = "binary";
    }
  }
  const bundle: SourceBundle = {
    v: BUNDLE_VERSION,
    instance_id: task.instance_id,
    repo: task.repo,
    base_commit: task.base_commit,
    files,
    omitted,
  };
  const gz = gzipSync(JSON.stringify(bundle), { level: 9 });
  return { bundle, gz };
}

async function main() {
  const out = path.resolve(arg("out") ?? path.join(ROOT, "public", "bundles"));
  const from = arg("from") ?? "tasks";
  const ids = arg("ids")?.split(",").filter(Boolean);
  const force = flag("force");

  let tasks: { instance_id: string; repo: string; base_commit: string }[];
  if (from === "candidates") {
    tasks = (await readJson<CandidatesFile>(path.join(DATA_DIR, "candidates.json"))).candidates;
  } else {
    tasks = (await readJson<TasksFile>(path.join(DATA_DIR, "tasks.json"))).tasks;
  }
  if (ids) tasks = tasks.filter((t) => ids.includes(t.instance_id));
  await mkdir(out, { recursive: true });

  const manifestPath = path.join(out, "index.json");
  const manifest: Record<string, { bytes: number; files: number; omitted: number; base_commit: string }> =
    existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};

  let total = 0;
  for (const [i, task] of tasks.entries()) {
    const file = path.join(out, `${task.instance_id}.json.gz`);
    if (!force && existsSync(file) && manifest[task.instance_id]?.base_commit === task.base_commit) {
      total += (await stat(file)).size;
      continue;
    }
    const { bundle, gz } = await buildBundle(task);
    await writeFile(file, gz);
    manifest[task.instance_id] = {
      bytes: gz.length,
      files: Object.keys(bundle.files).length,
      omitted: Object.keys(bundle.omitted).length,
      base_commit: task.base_commit,
    };
    total += gz.length;
    console.log(
      `[${i + 1}/${tasks.length}] ${task.instance_id}: ${(gz.length / 1e6).toFixed(2)} MB, ` +
        `${Object.keys(bundle.files).length} files, ${Object.keys(bundle.omitted).length} omitted`,
    );
  }
  await writeJson(manifestPath, manifest);
  console.log(`total ${(total / 1e6).toFixed(1)} MB in ${out}`);
}

if (process.argv[1]?.endsWith("build-bundles.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
