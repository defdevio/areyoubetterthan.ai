"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cx, Spinner } from "@/components/ui";
import type { RepoSearch, SearchResponse } from "@/lib/client/search";

function Toggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cx(
        "h-6 min-w-6 rounded px-1 font-mono text-[11px]",
        on ? "bg-human/20 text-human" : "text-faint hover:bg-white/5 hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

export interface SearchPanelHandle {
  focus: (initial?: string) => void;
}

export const SearchPanel = forwardRef<
  SearchPanelHandle,
  { search: RepoSearch | null; version: number; onOpenAt: (path: string, line: number, column: number, length: number) => void }
>(function SearchPanel({ search, version, onOpenAt }, ref) {
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const shown = query.length >= 2 ? res : null;

  useImperativeHandle(ref, () => ({
    focus: (initial?: string) => {
      if (initial) setQuery(initial);
      setTimeout(() => {
        input.current?.focus();
        input.current?.select();
      }, 0);
    },
  }));

  useEffect(() => {
    if (!search || query.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await search.search({ query, include, caseSensitive, regex, wholeWord, maxResults: 2000 });
      if (!cancelled) {
        setRes(r);
        setBusy(false);
        setCollapsed(new Set());
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, query, include, caseSensitive, regex, wholeWord, version]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 p-2">
        <div className="flex items-center gap-1 rounded-md border border-line bg-bg pr-1 focus-within:border-human/50">
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the repo…  (⌘⇧F)"
            spellCheck={false}
            data-testid="search-input"
            className="h-8 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-xs placeholder:text-faint focus:outline-none"
          />
          <Toggle on={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} label="Aa" title="Match case" />
          <Toggle on={wholeWord} onClick={() => setWholeWord((v) => !v)} label="ab" title="Whole word" />
          <Toggle on={regex} onClick={() => setRegex((v) => !v)} label=".*" title="Regular expression" />
        </div>
        <input
          value={include}
          onChange={(e) => setInclude(e.target.value)}
          placeholder="files to include, e.g. *.py, django/db"
          spellCheck={false}
          className="h-7 w-full rounded-md border border-line bg-bg px-2.5 font-mono text-[11px] placeholder:text-faint focus:border-human/50 focus:outline-none"
        />
        <div className="flex h-4 items-center gap-2 px-0.5 text-[11px] text-faint">
          {busy && <Spinner className="size-2.5 border-[1.5px]" />}
          {shown?.error ? (
            <span className="text-fail">{shown.error}</span>
          ) : shown ? (
            <span>
              {shown.total}
              {shown.truncated ? "+" : ""} results in {shown.results.length} files · {shown.ms} ms
            </span>
          ) : query.length > 0 && query.length < 2 ? (
            <span>Type at least 2 characters</span>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4" data-testid="search-results">
        {shown?.results.map((f) => {
          const isCollapsed = collapsed.has(f.path);
          return (
            <div key={f.path}>
              <button
                onClick={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(f.path)) n.delete(f.path);
                    else n.add(f.path);
                    return n;
                  })
                }
                className="flex w-full items-center gap-1.5 truncate px-2 py-1 text-left font-mono text-[12px] text-fg/90 hover:bg-white/[0.04]"
              >
                <span className="w-3 text-[10px] text-faint">{isCollapsed ? "▸" : "▾"}</span>
                <span className="truncate">{f.path.slice(f.path.lastIndexOf("/") + 1)}</span>
                <span className="truncate text-[11px] text-faint">{f.path.slice(0, f.path.lastIndexOf("/"))}</span>
                <span className="ml-auto rounded bg-white/5 px-1.5 text-[10px] text-muted">{f.matches.length}</span>
              </button>
              {!isCollapsed &&
                f.matches.slice(0, 100).map((m, i) => (
                  <button
                    key={i}
                    onClick={() => onOpenAt(f.path, m.line, m.column, m.length)}
                    className="flex w-full gap-2 truncate py-0.5 pr-2 pl-7 text-left font-mono text-[11px] text-muted hover:bg-white/[0.04] hover:text-fg"
                  >
                    <span className="w-8 shrink-0 text-right text-faint">{m.line}</span>
                    <span className="truncate">{m.preview.trimStart()}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
});
