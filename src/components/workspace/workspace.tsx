"use client";

import Editor, { loader, type BeforeMount, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { applyPatch, parsePatch } from "diff";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffView } from "@/components/diff-view";
import { Markdown } from "@/components/markdown";
import { Button, cx, Kbd, Spinner } from "@/components/ui";
import type { SourceBundle } from "@/lib/bundle-types";
import { api, ApiError } from "@/lib/client/api";
import { RepoSearch } from "@/lib/client/search";
import type { PasteEvent } from "@/lib/db/schema";
import { generateDiff, verifyRoundTrip, type FileChange, type GeneratedDiff } from "@/lib/diff";
import { isSafeRepoPath } from "@/lib/diff-validate";
import { ChangesPanel } from "./changes-panel";
import { FileTree, type TreeEntry } from "./file-tree";
import { languageFor, looksLikeTestFile } from "./language";
import { SearchPanel, type SearchPanelHandle } from "./search-panel";
import { Timer } from "./timer";

loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min/vs" } });

const ATTEMPT_MS = 15 * 60 * 1000;
const AUTOSAVE_MS = 10_000;
const MAX_TABS = 12;
const EMPTY_DIFF: GeneratedDiff = { diff: "", stats: { files: 0, added: 0, removed: 0 }, files: [] };

export interface Briefing {
  instance_id: string;
  repo: string;
  title: string;
  base_commit: string;
  version: string;
  created_at: string;
  problem_statement: string;
  bundle_url: string;
}

export interface ActiveAttempt {
  id: string;
  instance_id: string;
  started_at: string;
  deadline_at: string;
  draft_diff: string | null;
  paste_events: PasteEvent[];
  task: Briefing | null;
}

export interface SubmittedInfo {
  submissionId: string | null;
  auto: boolean;
  stats: GeneratedDiff["stats"];
  message?: string;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const storageKey = (attemptId: string) => `abt:ws:${attemptId}`;

interface Restored {
  current: Map<string, string>;
  created: Set<string>;
}

/** Restores in-progress edits: local copy first (most recent), then the server draft. */
function restore(attempt: ActiveAttempt, originals: Record<string, string>): Restored {
  const current = new Map<string, string>();
  const created = new Set<string>();
  try {
    const raw = localStorage.getItem(storageKey(attempt.id));
    if (raw) {
      const saved = JSON.parse(raw) as { files: Record<string, string>; created: string[] };
      for (const [p, c] of Object.entries(saved.files ?? {})) current.set(p, c);
      for (const p of saved.created ?? []) created.add(p);
      return { current, created };
    }
  } catch {}
  if (attempt.draft_diff) {
    try {
      for (const p of parsePatch(attempt.draft_diff)) {
        const isCreate = p.oldFileName === "/dev/null";
        const path = (isCreate ? p.newFileName : p.oldFileName)?.replace(/^[ab]\//, "");
        if (!path) continue;
        const result = applyPatch(isCreate ? "" : (originals[path] ?? ""), p);
        if (typeof result === "string") {
          current.set(path, result);
          if (isCreate) created.add(path);
        }
      }
    } catch {}
  }
  return { current, created };
}

function useDragWidth(initial: number, min: number, max: number, side: "left" | "right") {
  const [width, setWidth] = useState(initial);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      setWidth(Math.max(min, Math.min(max, side === "left" ? startW + dx : startW - dx)));
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  return { width, onMouseDown };
}

function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative w-px shrink-0 cursor-col-resize bg-line hover:bg-human/60"
      role="separator"
      aria-orientation="vertical"
    >
      <div className="absolute inset-y-0 -right-1.5 -left-1.5" />
    </div>
  );
}

export function Workspace({
  attempt,
  bundle,
  offsetMs,
  onSubmitted,
}: {
  attempt: ActiveAttempt;
  bundle: SourceBundle;
  offsetMs: number;
  onSubmitted: (info: SubmittedInfo) => void;
}) {
  const task = attempt.task!;
  const originals = bundle.files;
  const startedAt = new Date(attempt.started_at).getTime();
  const deadline = new Date(attempt.deadline_at).getTime();

  const [restored] = useState(() => restore(attempt, originals));
  const currentRef = useRef(restored.current);
  const createdRef = useRef(restored.created);
  const [createdList, setCreatedList] = useState<string[]>(() => [...restored.created]);
  const [version, setVersion] = useState(0);
  const [searchVersion, setSearchVersion] = useState(0);
  const [diff, setDiff] = useState<GeneratedDiff>(EMPTY_DIFF);

  const [tabs, setTabs] = useState<string[]>(() => [...restored.current.keys()].slice(0, MAX_TABS));
  const [active, setActive] = useState<string | null>(() => [...restored.current.keys()][0] ?? null);
  const activeRef = useRef(active);
  const [sidebar, setSidebar] = useState<"files" | "search" | "changes">("files");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const p of restored.current.keys()) {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join("/"));
    }
    return s;
  });
  const [issueOpen, setIssueOpen] = useState(() => window.innerWidth >= 1000);
  const [newFile, setNewFile] = useState<string | null>(null);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null);

  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; at?: number }>({
    status: attempt.draft_diff ? "saved" : "idle",
  });
  const lastSaved = useRef<string>(attempt.draft_diff ?? "");
  const lastSavedPastes = useRef<number>(attempt.paste_events?.length ?? 0);
  const pasteEvents = useRef<PasteEvent[]>(attempt.paste_events ?? []);
  const clips = useRef<string[]>([]);

  const [dialog, setDialog] = useState<"none" | "review" | "diff">("none");
  const [submitting, setSubmitting] = useState<null | "manual" | "auto">(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitted = useRef(false);

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const pendingReveal = useRef<{ line: number; column: number; length: number } | null>(null);
  const [search] = useState(() => {
    const files = { ...originals };
    for (const [p, c] of restored.current) files[p] = c;
    return new RepoSearch(files);
  });
  const searchPanel = useRef<SearchPanelHandle>(null);
  const problemNorm = useMemo(() => norm(task.problem_statement), [task.problem_statement]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const treeEntries = useMemo<TreeEntry[]>(() => {
    const entries: TreeEntry[] = Object.keys(originals).map((path) => ({ path }));
    for (const [path, reason] of Object.entries(bundle.omitted ?? {})) entries.push({ path, omitted: reason });
    for (const path of createdList) entries.push({ path });
    return entries;
  }, [originals, bundle.omitted, createdList]);

  const changes = useCallback((): FileChange[] => {
    return [...currentRef.current.entries()].map(([path, cur]) => ({
      path,
      original: createdRef.current.has(path) ? null : (originals[path] ?? null),
      current: cur,
    }));
  }, [originals]);

  const computeDiff = useCallback(() => generateDiff(changes()), [changes]);

  useEffect(() => () => search.dispose(), [search]);

  // Debounced: recompute the diff, persist locally, sync the search index.
  const dirtyPaths = useRef(new Set<string>());
  useEffect(() => {
    const t = setTimeout(() => {
      setDiff(computeDiff());
      try {
        localStorage.setItem(
          storageKey(attempt.id),
          JSON.stringify({ files: Object.fromEntries(currentRef.current), created: [...createdRef.current] }),
        );
      } catch {}
      if (dirtyPaths.current.size) {
        for (const p of dirtyPaths.current) {
          search.update(p, currentRef.current.get(p) ?? originals[p] ?? null);
        }
        dirtyPaths.current.clear();
        setSearchVersion((v) => v + 1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [version, computeDiff, attempt.id, originals, search]);

  const markChanged = useCallback((path: string) => {
    dirtyPaths.current.add(path);
    setVersion((v) => v + 1);
  }, []);

  // --- Saving -------------------------------------------------------------------------
  const saveDraft = useCallback(
    async (opts?: { keepalive?: boolean; force?: boolean }) => {
      if (submitted.current) return;
      const d = computeDiff().diff;
      const pastes = pasteEvents.current;
      if (!opts?.force && d === lastSaved.current && pastes.length === lastSavedPastes.current) return;
      const body = JSON.stringify({ diff: d, paste_events: pastes });
      setSaveState((s) => ({ ...s, status: "saving" }));
      try {
        const res = await fetch(`/api/attempts/${attempt.id}/draft`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body,
          keepalive: Boolean(opts?.keepalive) && body.length < 60_000,
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSaved.current = d;
        lastSavedPastes.current = pastes.length;
        setSaveState({ status: "saved", at: Date.now() });
      } catch {
        setSaveState((s) => ({ ...s, status: "error" }));
      }
    },
    [attempt.id, computeDiff],
  );

  useEffect(() => {
    const id = setInterval(() => void saveDraft(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void saveDraft({ keepalive: true });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (submitted.current) return;
      void saveDraft({ keepalive: true });
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Navigating away inside the app: flush so the server has the latest draft.
      void saveDraft({ keepalive: true });
    };
  }, [saveDraft]);

  // --- Submitting ---------------------------------------------------------------------
  const submit = useCallback(
    async (auto: boolean) => {
      if (submitted.current || submitting) return;
      const gen = computeDiff();
      const check = verifyRoundTrip(gen.diff, changes());
      if (!check.ok && !auto) {
        setSubmitError(`We couldn't build a clean patch (${check.error}). Please report this.`);
        return;
      }
      setSubmitting(auto ? "auto" : "manual");
      setSubmitError(null);
      setDialog("none");
      for (let attemptNo = 0; ; attemptNo++) {
        try {
          const r = await api<{ submission_id: string | null }>("/api/submissions", {
            method: "POST",
            json: { attempt_id: attempt.id, diff: gen.diff, paste_events: pasteEvents.current },
          });
          submitted.current = true;
          localStorage.removeItem(storageKey(attempt.id));
          onSubmitted({ submissionId: r.submission_id, auto, stats: gen.stats });
          return;
        } catch (err) {
          const e = err as ApiError;
          if (e.code === "deadline_passed" || e.code === "attempt_over") {
            submitted.current = true;
            localStorage.removeItem(storageKey(attempt.id));
            onSubmitted({ submissionId: null, auto: true, stats: gen.stats, message: e.message });
            return;
          }
          const retryable = !(e instanceof ApiError) || e.status >= 500;
          if (retryable && attemptNo < 4) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attemptNo));
            continue;
          }
          setSubmitError(e.message);
          setSubmitting(null);
          return;
        }
      }
    },
    [attempt.id, changes, computeDiff, onSubmitted, submitting],
  );

  const onExpire = useCallback(() => void submit(true), [submit]);

  // --- Files --------------------------------------------------------------------------
  const revealPending = useCallback(() => {
    const ed = editorRef.current;
    const m = monacoRef.current;
    const at = pendingReveal.current;
    if (!ed || !m || !at) return;
    pendingReveal.current = null;
    const sel = new m.Selection(at.line, at.column, at.line, at.column + at.length);
    ed.setSelection(sel);
    ed.revealLineInCenter(at.line);
    const deco = ed.createDecorationsCollection([
      { range: sel, options: { inlineClassName: "search-hit", isWholeLine: false } },
      { range: new m.Range(at.line, 1, at.line, 1), options: { isWholeLine: true, className: "search-hit-line" } },
    ]);
    setTimeout(() => deco.clear(), 1800);
  }, []);

  const expandTo = useCallback((path: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join("/"));
      return n;
    });
  }, []);

  const openFile = useCallback(
    (path: string, at?: { line: number; column: number; length: number }) => {
      pendingReveal.current = at ?? null;
      setTabs((t) => {
        if (t.includes(path)) return t;
        let next = [...t, path];
        while (next.length > MAX_TABS) {
          const victim = next.find((p) => p !== path && !currentRef.current.has(p));
          if (!victim) break;
          next = next.filter((p) => p !== victim);
        }
        return next;
      });
      setActive(path);
      expandTo(path);
      // Already showing this file: the path effect won't fire, so reveal now.
      if (activeRef.current === path) requestAnimationFrame(() => revealPending());
    },
    [expandTo, revealPending],
  );

  const closeTab = (path: string) => {
    setTabs((t) => {
      const next = t.filter((p) => p !== path);
      if (active === path) setActive(next[Math.max(0, t.indexOf(path) - 1)] ?? null);
      return next;
    });
  };

  const modelFor = (path: string) => {
    const m = monacoRef.current;
    return m?.editor.getModel(m.Uri.parse(path)) ?? null;
  };

  const resetFile = (path: string) => {
    if (createdRef.current.has(path)) {
      createdRef.current.delete(path);
      currentRef.current.delete(path);
      setCreatedList([...createdRef.current]);
      modelFor(path)?.dispose();
      closeTab(path);
    } else {
      const model = modelFor(path);
      if (model) {
        // An edit operation (not setValue) so the user can undo the reset.
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: originals[path] ?? "" }], () => null);
      }
      currentRef.current.delete(path);
    }
    markChanged(path);
  };

  const createFile = (raw: string) => {
    const path = raw.trim().replace(/^\/+/, "");
    if (!isSafeRepoPath(path)) return setNewFileError("Use a relative path like pkg/module.py");
    if (path in originals || createdRef.current.has(path) || bundle.omitted?.[path]) {
      return setNewFileError("That file already exists.");
    }
    createdRef.current.add(path);
    currentRef.current.set(path, "");
    setCreatedList([...createdRef.current]);
    setNewFile(null);
    setNewFileError(null);
    markChanged(path);
    openFile(path);
  };

  // --- Editor -------------------------------------------------------------------------

  useEffect(() => {
    requestAnimationFrame(() => revealPending());
  }, [active, revealPending]);

  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("abt", {
      base: "vs-dark",
      inherit: true,
      rules: [{ token: "comment", foreground: "6b6b78", fontStyle: "italic" }],
      colors: {
        "editor.background": "#0c0c0f",
        "editor.lineHighlightBackground": "#ffffff07",
        "editorLineNumber.foreground": "#44444f",
        "editorLineNumber.activeForeground": "#9a9aa8",
        "editorGutter.background": "#0c0c0f",
        "editor.selectionBackground": "#fbbf2433",
        "editorCursor.foreground": "#fbbf24",
        "minimap.background": "#0c0c0f",
        "scrollbarSlider.background": "#ffffff14",
      },
    });
  };

  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    ed.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }));
    ed.onDidPaste((e) => {
      const text = ed.getModel()?.getValueInRange(e.range) ?? "";
      if (!text) return;
      const n = norm(text);
      const path = activeRef.current ?? undefined;
      const internal =
        clips.current.some((c) => c.includes(n)) ||
        problemNorm.includes(n) ||
        (path ? (originals[path] ?? "").includes(text) : false);
      pasteEvents.current.push({
        t: Math.max(0, Date.now() + offsetMs - startedAt),
        chars: text.length,
        lines: text.split("\n").length,
        external: !internal,
        file: path,
      });
    });
    const K = monaco.KeyMod;
    const C = monaco.KeyCode;
    ed.addCommand(K.CtrlCmd | C.KeyS, () => void saveDraft({ force: true }));
    ed.addCommand(K.CtrlCmd | C.KeyP, () => focusFileFilter());
    ed.addCommand(K.CtrlCmd | K.Shift | C.KeyF, () => focusSearch());
    ed.addCommand(K.CtrlCmd | C.Enter, () => setDialog("review"));
    requestAnimationFrame(() => revealPending());
  };

  const focusFileFilter = () => {
    setSidebar("files");
    setTimeout(() => (document.getElementById("file-filter") as HTMLInputElement | null)?.focus(), 0);
  };
  const focusSearch = () => {
    const ed = editorRef.current;
    const sel = ed?.getSelection();
    const selected = sel && !sel.isEmpty() ? (ed?.getModel()?.getValueInRange(sel) ?? "") : "";
    setSidebar("search");
    searchPanel.current?.focus(selected && !selected.includes("\n") ? selected : undefined);
  };

  // Clipboard provenance: text copied inside the workspace is not an "external" paste.
  useEffect(() => {
    const onCopy = () => {
      const ed = editorRef.current;
      let text = "";
      if (ed?.hasTextFocus()) {
        const model = ed.getModel();
        text = (ed.getSelections() ?? [])
          .map((s) => (s.isEmpty() ? (model?.getLineContent(s.startLineNumber) ?? "") : (model?.getValueInRange(s) ?? "")))
          .join("\n");
      } else {
        text = window.getSelection()?.toString() ?? "";
      }
      if (text) {
        clips.current.push(norm(text));
        if (clips.current.length > 40) clips.current.shift();
      }
    };
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    return () => {
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
    };
  }, []);

  // Shortcuts when focus is outside the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(".monaco-editor")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void saveDraft({ force: true });
      } else if (k === "p" && !e.shiftKey) {
        e.preventDefault();
        focusFileFilter();
      } else if (k === "f" && e.shiftKey) {
        e.preventDefault();
        focusSearch();
      } else if (k === "enter") {
        e.preventDefault();
        setDialog("review");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveDraft]);

  const side = useDragWidth(window.innerWidth < 1200 ? 230 : 280, 180, 520, "left");
  const issue = useDragWidth(Math.round(Math.max(300, Math.min(520, window.innerWidth * 0.3))), 260, 900, "right");

  const activeOmitted = active ? bundle.omitted?.[active] : undefined;
  const modifiedSet = useMemo(() => new Set(diff.files.map((f) => f.path)), [diff]);
  const createdSet = useMemo(() => new Set(createdList), [createdList]);
  const touchedTests = diff.files.filter((f) => looksLikeTestFile(f.path));
  const shortSha = bundle.base_commit.slice(0, 7);

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col" data-testid="workspace">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-panel px-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
            <span className="text-muted">{task.repo}</span>
            <span>@{shortSha}</span>
            <span className="hidden sm:inline">· {task.instance_id}</span>
          </div>
          <div className="truncate text-sm font-medium" title={task.title}>
            {task.title}
          </div>
        </div>
        <Timer deadline={deadline} offsetMs={offsetMs} totalMs={ATTEMPT_MS} onExpire={onExpire} />
        <div className="hidden w-28 text-right text-[11px] text-faint lg:block" data-testid="save-state">
          {saveState.status === "saving" && "Saving…"}
          {saveState.status === "saved" && "Draft saved"}
          {saveState.status === "error" && <span className="text-warn">Offline, will retry</span>}
          {saveState.status === "idle" && "Autosaves"}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIssueOpen((o) => !o)} aria-pressed={issueOpen}>
          {issueOpen ? "Hide issue" : "Show issue"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setDialog("review")}
          disabled={Boolean(submitting)}
          data-testid="review-submit"
        >
          Review & submit
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside style={{ width: side.width }} className="flex shrink-0 flex-col bg-panel">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-1.5">
            {(
              [
                ["files", "Files"],
                ["search", "Search"],
                ["changes", `Changes${diff.stats.files ? ` (${diff.stats.files})` : ""}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => (key === "search" ? focusSearch() : setSidebar(key))}
                data-testid={`sidebar-${key}`}
                className={cx(
                  "h-7 rounded-md px-2.5 text-xs",
                  sidebar === key ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg",
                  key === "changes" && diff.stats.files > 0 && sidebar !== key && "text-human",
                )}
              >
                {label}
              </button>
            ))}
            {sidebar === "files" && (
              <button
                onClick={() => {
                  setNewFile(active && active.includes("/") ? active.slice(0, active.lastIndexOf("/") + 1) : "");
                  setNewFileError(null);
                }}
                title="New file"
                className="ml-auto h-7 rounded-md px-2 text-sm text-muted hover:bg-white/5 hover:text-fg"
              >
                +
              </button>
            )}
          </div>
          {sidebar === "files" && newFile !== null && (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={newFile}
                onChange={(e) => setNewFile(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFile(newFile);
                  if (e.key === "Escape") setNewFile(null);
                }}
                placeholder="path/to/new_file.py"
                className="h-8 w-full rounded-md border border-human/40 bg-bg px-2.5 font-mono text-xs focus:outline-none"
              />
              <div className="mt-1 text-[11px] text-faint">{newFileError ?? "Enter to create · Esc to cancel"}</div>
            </div>
          )}
          <div className={cx("min-h-0 flex-1 flex-col", sidebar === "files" ? "flex" : "hidden")}>
            <FileTree
              entries={treeEntries}
              activePath={active}
              modified={modifiedSet}
              created={createdSet}
              onOpen={(p) => openFile(p)}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          </div>
          <div className={cx("min-h-0 flex-1 flex-col", sidebar === "search" ? "flex" : "hidden")}>
            <SearchPanel
              ref={searchPanel}
              search={search}
              version={searchVersion}
              onOpenAt={(path, line, column, length) => openFile(path, { line, column, length })}
            />
          </div>
          <div className={cx("min-h-0 flex-1 flex-col", sidebar === "changes" ? "flex" : "hidden")}>
            <ChangesPanel
              diff={diff}
              activePath={active}
              onOpen={(p) => openFile(p)}
              onReset={resetFile}
              onShowDiff={() => setDialog("diff")}
            />
          </div>
        </aside>
        <DragHandle onMouseDown={side.onMouseDown} />

        {/* Editor */}
        <main className="flex min-w-[280px] flex-1 flex-col overflow-hidden bg-[#0c0c0f]">
          <div className="flex h-9 shrink-0 overflow-x-auto border-b border-line bg-panel" role="tablist">
            {tabs.map((p) => (
              <div
                key={p}
                role="tab"
                aria-selected={p === active}
                className={cx(
                  "group flex shrink-0 items-center gap-2 border-r border-line px-3 font-mono text-[12px]",
                  p === active ? "bg-[#0c0c0f] text-fg" : "text-muted hover:text-fg",
                )}
              >
                <button onClick={() => setActive(p)} title={p} className="max-w-48 truncate">
                  {p.slice(p.lastIndexOf("/") + 1)}
                </button>
                <button
                  onClick={() => closeTab(p)}
                  aria-label={`Close ${p}`}
                  className="grid size-4 place-items-center rounded text-faint hover:bg-white/10 hover:text-fg"
                >
                  {modifiedSet.has(p) ? <span className="size-1.5 rounded-full bg-human group-hover:hidden" /> : null}
                  <span className={cx(modifiedSet.has(p) && "hidden group-hover:inline")}>×</span>
                </button>
              </div>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            {active && !activeOmitted ? (
              <Editor
                path={active}
                // Only used when Monaco first creates this file's model; edits live in the model after that.
                defaultValue={restored.current.get(active) ?? originals[active] ?? ""}
                language={languageFor(active)}
                theme="abt"
                beforeMount={beforeMount}
                onMount={onMount}
                onChange={(value) => {
                  const path = activeRef.current;
                  if (!path || value === undefined) return;
                  if (!createdRef.current.has(path) && value === originals[path]) currentRef.current.delete(path);
                  else currentRef.current.set(path, value);
                  markChanged(path);
                }}
                loading={
                  <div className="flex items-center gap-2 text-xs text-faint">
                    <Spinner /> Loading editor…
                  </div>
                }
                options={{
                  fontSize: 13,
                  fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
                  fontLigatures: false,
                  minimap: { enabled: true, scale: 1, renderCharacters: false },
                  scrollBeyondLastLine: false,
                  renderWhitespace: "selection",
                  smoothScrolling: true,
                  automaticLayout: true,
                  padding: { top: 8 },
                  stickyScroll: { enabled: true },
                  bracketPairColorization: { enabled: true },
                  guides: { indentation: true, bracketPairs: false },
                  tabSize: 4,
                }}
              />
            ) : active && activeOmitted ? (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
                <div>
                  <div className="font-mono text-xs text-faint">{active}</div>
                  <p className="mt-2">This file isn&apos;t loaded in the browser ({activeOmitted}).</p>
                </div>
              </div>
            ) : (
              <EmptyEditor />
            )}
          </div>
          <div className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 font-mono text-[10.5px] text-faint">
            <span className="truncate">{active ?? "No file open"}</span>
            {cursor && active && (
              <span>
                Ln {cursor.line}, Col {cursor.col}
              </span>
            )}
            <span className="ml-auto hidden md:inline">No code execution here · the official tests run after you submit</span>
          </div>
        </main>

        {/* Issue */}
        {issueOpen && (
          <>
            <DragHandle onMouseDown={issue.onMouseDown} />
            <aside style={{ width: issue.width }} className="flex shrink-0 flex-col bg-panel">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-4 text-xs text-muted">
                <span>Issue</span>
                <span className="font-mono text-[10.5px] text-faint">
                  opened {new Date(task.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="issue">
                <Markdown>{task.problem_statement}</Markdown>
              </div>
            </aside>
          </>
        )}
      </div>

      {/* Review dialog */}
      {(dialog === "review" || dialog === "diff") && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={() => setDialog("none")}>
          <div
            className="animate-rise flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-line-strong bg-panel shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            data-testid="submit-dialog"
          >
            <div className="border-b border-line px-5 py-4">
              <div className="text-base font-semibold">{dialog === "diff" ? "Your patch so far" : "Submit your patch?"}</div>
              <div className="mt-1 text-sm text-muted">
                {diff.stats.files > 0 ? (
                  <>
                    {diff.stats.files} file{diff.stats.files === 1 ? "" : "s"} changed,{" "}
                    <span className="text-pass">+{diff.stats.added}</span> <span className="text-fail">−{diff.stats.removed}</span>.
                    {dialog === "review" &&
                      " It will be scored by the official SWE-bench harness on a GitHub runner. You can start the next task right away."}
                  </>
                ) : (
                  "You haven't changed anything yet."
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {diff.diff ? (
                <DiffView diff={diff.diff} className="max-h-[50vh]" />
              ) : (
                <p className="text-sm text-muted">
                  Submitting with no changes counts as <span className="text-fail">unresolved</span>. You can also keep
                  looking; the clock is still running.
                </p>
              )}
              {dialog === "review" && touchedTests.length > 0 && (
                <div className="mt-4 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-warn">
                  Heads up: you edited {touchedTests.map((f) => f.path).join(", ")}. The harness resets the tests it runs
                  to the official versions, so edits to those test files won&apos;t count. Fix the library code.
                </div>
              )}
              {submitError && <div className="mt-4 rounded-lg border border-fail/30 bg-fail/10 p-3 text-xs text-fail">{submitError}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
              <span className="mr-auto text-[11px] text-faint">
                <Kbd>⌘</Kbd> <Kbd>↵</Kbd> opens this dialog
              </span>
              <Button variant="ghost" onClick={() => setDialog("none")}>
                Keep editing
              </Button>
              {dialog === "review" &&
                (diff.stats.files > 0 ? (
                  <Button variant="primary" onClick={() => void submit(false)} disabled={Boolean(submitting)} data-testid="confirm-submit">
                    {submitting ? <Spinner /> : null} Submit for scoring
                  </Button>
                ) : (
                  <Button variant="danger" onClick={() => void submit(false)} disabled={Boolean(submitting)} data-testid="give-up">
                    Give up on this task
                  </Button>
                ))}
            </div>
          </div>
        </div>
      )}

      {submitting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-panel px-5 py-4 text-sm">
            <Spinner className="text-human" />
            {submitting === "auto" ? "Time's up! Submitting your patch…" : "Submitting…"}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-sm space-y-4 text-sm text-muted">
        <div className="text-base font-medium text-fg">Where to start</div>
        <ul className="space-y-2.5">
          <li>
            Read the issue on the right, then <span className="text-fg">search</span> for the function or error it
            mentions <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>F</Kbd>
          </li>
          <li>
            Jump to any file by name <Kbd>⌘</Kbd> <Kbd>P</Kbd>
          </li>
          <li>Edit as many files as you need. Your changes become a git diff automatically.</li>
          <li>
            Submit with <Kbd>⌘</Kbd> <Kbd>↵</Kbd>. At 0:00 whatever you have is submitted for you.
          </li>
        </ul>
      </div>
    </div>
  );
}
