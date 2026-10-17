import { cx } from "@/components/ui";

/** Renders a unified diff with per-line colouring. */
export function DiffView({ diff, className }: { diff: string; className?: string }) {
  const lines = diff.replace(/\n$/, "").split("\n");
  return (
    <div className={cx("diff-view overflow-auto rounded-lg border border-line bg-[#0b0b0e] py-2", className)}>
      {lines.map((l, i) => {
        const cls = l.startsWith("diff --git")
          ? "diff-file mt-2 first:mt-0 border-t border-line pt-2 first:border-0 first:pt-0"
          : l.startsWith("+++") || l.startsWith("---") || l.startsWith("new file") || l.startsWith("deleted file")
            ? "text-faint"
            : l.startsWith("@@")
              ? "diff-hunk"
              : l.startsWith("+")
                ? "diff-add"
                : l.startsWith("-")
                  ? "diff-del"
                  : "text-muted";
        return (
          <div key={i} className={cx("px-3", cls)}>
            {l || " "}
          </div>
        );
      })}
    </div>
  );
}
