"use client";

import { memo, useMemo, useState } from "react";
import { cx } from "@/components/ui";

export interface TreeEntry {
  path: string;
  omitted?: string;
}

interface DirNode {
  name: string;
  path: string;
  dirs: Map<string, DirNode>;
  files: TreeEntry[];
}

function buildTree(entries: TreeEntry[]): DirNode {
  const root: DirNode = { name: "", path: "", dirs: new Map(), files: [] };
  for (const e of entries) {
    const parts = e.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      let child = node.dirs.get(name);
      if (!child) {
        child = { name, path: parts.slice(0, i + 1).join("/"), dirs: new Map(), files: [] };
        node.dirs.set(name, child);
      }
      node = child;
    }
    node.files.push(e);
  }
  return root;
}

/** Space-separated terms must all appear in the path; basename hits rank first. */
export function filterPaths(paths: string[], query: string, limit = 200): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: [number, string][] = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    if (!terms.every((t) => lower.includes(t))) continue;
    const base = lower.slice(lower.lastIndexOf("/") + 1);
    let score = p.length;
    for (const t of terms) {
      if (base.startsWith(t)) score -= 300;
      else if (base.includes(t)) score -= 200;
    }
    if (/(^|\/)tests?\//.test(lower)) score += 20;
    scored.push([score, p]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
    .slice(0, limit)
    .map((s) => s[1]);
}

const Row = memo(function Row({
  depth,
  label,
  isDir,
  open,
  active,
  modified,
  created,
  omitted,
  onClick,
}: {
  depth: number;
  label: string;
  isDir?: boolean;
  open?: boolean;
  active?: boolean;
  modified?: boolean;
  created?: boolean;
  omitted?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={omitted ? `Not loaded in the browser (${omitted})` : undefined}
      className={cx(
        "flex h-6 w-full items-center gap-1.5 truncate pr-2 text-left font-mono text-[12px]",
        active ? "bg-human/10 text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
        omitted && "opacity-45",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className="w-3 shrink-0 text-center text-[10px] text-faint">{isDir ? (open ? "▾" : "▸") : ""}</span>
      <span className={cx("truncate", isDir && "text-fg/80", (modified || created) && "text-human")}>{label}</span>
      {created && <span className="ml-auto text-[10px] text-human">new</span>}
      {modified && !created && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-human" />}
    </button>
  );
});

export function FileTree({
  entries,
  activePath,
  modified,
  created,
  onOpen,
  expanded,
  setExpanded,
}: {
  entries: TreeEntry[];
  activePath: string | null;
  modified: Set<string>;
  created: Set<string>;
  onOpen: (path: string) => void;
  expanded: Set<string>;
  setExpanded: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  const [filter, setFilter] = useState("");
  const tree = useMemo(() => buildTree(entries), [entries]);
  const allPaths = useMemo(() => entries.map((e) => e.path), [entries]);
  const omittedBy = useMemo(() => new Map(entries.filter((e) => e.omitted).map((e) => [e.path, e.omitted!])), [entries]);
  const matches = useMemo(() => filterPaths(allPaths, filter), [allPaths, filter]);

  const toggle = (path: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  const rows: React.ReactNode[] = [];
  const walk = (node: DirNode, depth: number) => {
    const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const d of dirs) {
      const open = expanded.has(d.path);
      rows.push(<Row key={`d:${d.path}`} depth={depth} label={d.name} isDir open={open} onClick={() => toggle(d.path)} />);
      if (open) walk(d, depth + 1);
    }
    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    for (const f of files) {
      rows.push(
        <Row
          key={`f:${f.path}`}
          depth={depth}
          label={f.path.slice(f.path.lastIndexOf("/") + 1)}
          active={f.path === activePath}
          modified={modified.has(f.path)}
          created={created.has(f.path)}
          omitted={f.omitted}
          onClick={() => onOpen(f.path)}
        />,
      );
    }
  };
  if (!filter) walk(tree, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <input
          id="file-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) onOpen(matches[0]);
            if (e.key === "Escape") setFilter("");
          }}
          placeholder="Go to file…  (⌘P)"
          spellCheck={false}
          className="h-8 w-full rounded-md border border-line bg-bg px-2.5 font-mono text-xs placeholder:text-faint focus:border-human/50 focus:outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4" data-testid="file-tree">
        {filter ? (
          matches.length ? (
            matches.map((p) => (
              <button
                key={p}
                onClick={() => onOpen(p)}
                className={cx(
                  "block w-full truncate px-3 py-1 text-left font-mono text-[12px] hover:bg-white/[0.04]",
                  p === activePath ? "text-fg" : "text-muted",
                  omittedBy.has(p) && "opacity-45",
                )}
              >
                <span className="text-fg/90">{p.slice(p.lastIndexOf("/") + 1)}</span>
                <span className="ml-2 text-faint">{p.slice(0, p.lastIndexOf("/"))}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-faint">No matching files.</div>
          )
        ) : (
          rows
        )}
      </div>
    </div>
  );
}
