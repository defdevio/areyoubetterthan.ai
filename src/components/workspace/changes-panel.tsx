"use client";

import { Button, cx } from "@/components/ui";
import type { GeneratedDiff } from "@/lib/diff";

export function ChangesPanel({
  diff,
  activePath,
  onOpen,
  onReset,
  onShowDiff,
}: {
  diff: GeneratedDiff;
  activePath: string | null;
  onOpen: (path: string) => void;
  onReset: (path: string) => void;
  onShowDiff: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] text-faint">
        <span>
          {diff.stats.files} file{diff.stats.files === 1 ? "" : "s"} ·{" "}
          <span className="text-pass">+{diff.stats.added}</span> <span className="text-fail">−{diff.stats.removed}</span>
        </span>
        {diff.stats.files > 0 && (
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onShowDiff}>
            View diff
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="changes-list">
        {diff.files.length === 0 && (
          <div className="px-3 py-4 text-xs leading-relaxed text-faint">
            No changes yet. Edit files in the editor; everything you change here becomes your patch.
          </div>
        )}
        {diff.files.map((f) => (
          <div
            key={f.path}
            className={cx("group flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.04]", f.path === activePath && "bg-human/5")}
          >
            <button onClick={() => onOpen(f.path)} className="min-w-0 flex-1 truncate text-left font-mono text-[12px]">
              <span className="text-human">{f.path.slice(f.path.lastIndexOf("/") + 1)}</span>
              <span className="ml-2 text-[11px] text-faint">{f.path.slice(0, f.path.lastIndexOf("/"))}</span>
            </button>
            <span className="shrink-0 font-mono text-[10px]">
              {f.kind === "created" && <span className="mr-1 text-human">new</span>}
              <span className="text-pass">+{f.added}</span> <span className="text-fail">−{f.removed}</span>
            </span>
            <button
              onClick={() => onReset(f.path)}
              title={f.kind === "created" ? "Remove this new file" : "Discard changes to this file"}
              className="shrink-0 text-[11px] text-faint opacity-0 group-hover:opacity-100 hover:text-fail"
            >
              ↺
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
