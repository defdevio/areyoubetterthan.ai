/**
 * Full-text repository search in a Web Worker so typing never blocks the editor.
 *
 * The worker body is a self-contained function turned into a Blob URL. That keeps it
 * independent of bundler worker support and makes it trivially unit-testable.
 */

export interface SearchQuery {
  id: number;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
  /** Optional glob-ish path filter, e.g. "*.py" or "django/db". Comma separated. */
  include: string;
  maxResults: number;
}

export interface SearchMatch {
  line: number;
  column: number;
  length: number;
  preview: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  id: number;
  results: SearchFileResult[];
  total: number;
  truncated: boolean;
  error?: string;
  ms: number;
}

type WorkerMessage =
  | { type: "load"; files: Record<string, string> }
  | { type: "update"; path: string; content: string | null }
  | ({ type: "search" } & SearchQuery);

export function searchFiles(files: Map<string, string>, q: SearchQuery): SearchResponse {
  const started = Date.now();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let re: RegExp;
  try {
    let src = q.regex ? q.query : escape(q.query);
    if (q.wholeWord) src = `\\b(?:${src})\\b`;
    re = new RegExp(src, q.caseSensitive ? "g" : "gi");
  } catch (e) {
    return { id: q.id, results: [], total: 0, truncated: false, error: (e as Error).message, ms: 0 };
  }
  const includes = q.include
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pat) => {
      if (!pat.includes("*")) return (p: string) => p.includes(pat);
      const r = new RegExp("^" + pat.split("*").map(escape).join(".*") + "$|/" + pat.split("*").map(escape).join(".*") + "$");
      return (p: string) => r.test(p);
    });
  const results: SearchFileResult[] = [];
  let total = 0;
  let truncated = false;
  const paths = [...files.keys()].sort();
  outer: for (const path of paths) {
    if (includes.length && !includes.some((f) => f(path))) continue;
    const content = files.get(path)!;
    re.lastIndex = 0;
    if (!re.test(content)) continue;
    const lines = content.split("\n");
    const matches: SearchMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const start = Math.max(0, m.index - 40);
        matches.push({
          line: i + 1,
          column: m.index + 1,
          length: m[0].length,
          preview: (start > 0 ? "…" : "") + line.slice(start, start + 160).replace(/\t/g, "  "),
        });
        total++;
        if (total >= q.maxResults) {
          truncated = true;
          results.push({ path, matches });
          break outer;
        }
        if (!re.global) break;
      }
    }
    if (matches.length) results.push({ path, matches });
  }
  return { id: q.id, results, total, truncated, ms: Date.now() - started };
}

function workerMain(searchFilesSrc: string) {
  const search = new Function(`return (${searchFilesSrc})`)() as typeof searchFiles;
  const files = new Map<string, string>();
  self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    if (msg.type === "load") {
      files.clear();
      for (const [k, v] of Object.entries(msg.files)) files.set(k, v);
    } else if (msg.type === "update") {
      if (msg.content === null) files.delete(msg.path);
      else files.set(msg.path, msg.content);
    } else if (msg.type === "search") {
      (self as unknown as Worker).postMessage(search(files, msg));
    }
  };
}

/**
 * Owns the search index. The worker is spawned lazily and can be disposed and re-spawned
 * (React StrictMode runs effects twice), since the file map lives on the main thread too.
 */
export class RepoSearch {
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextId = 1;
  private pending = new Map<number, (r: SearchResponse) => void>();
  private files: Map<string, string>;

  constructor(files: Record<string, string>) {
    this.files = new Map(Object.entries(files));
  }

  private ensureWorker(): Worker | null {
    if (this.worker || this.workerFailed) return this.worker;
    try {
      const src = `(${workerMain.toString()})(${JSON.stringify(searchFiles.toString())});`;
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = (e: MessageEvent<SearchResponse>) => {
        this.pending.get(e.data.id)?.(e.data);
        this.pending.delete(e.data.id);
      };
      worker.postMessage({ type: "load", files: Object.fromEntries(this.files) } satisfies WorkerMessage);
      this.worker = worker;
    } catch {
      this.workerFailed = true;
    }
    return this.worker;
  }

  update(path: string, content: string | null) {
    if (content === null) this.files.delete(path);
    else this.files.set(path, content);
    this.worker?.postMessage({ type: "update", path, content } satisfies WorkerMessage);
  }

  search(q: Omit<SearchQuery, "id">): Promise<SearchResponse> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve(searchFiles(this.files, { ...q, id }));
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({ type: "search", ...q, id } satisfies WorkerMessage);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const resolve of this.pending.values()) resolve({ id: -1, results: [], total: 0, truncated: false, ms: 0 });
    this.pending.clear();
  }
}
