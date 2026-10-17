import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8 text-xs text-faint">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
        <div>
          Tasks from <a className="hover:text-fg" href="https://www.swebench.com/">SWE-bench Verified</a>, model results from{" "}
          <a className="hover:text-fg" href="https://github.com/SWE-bench/experiments">SWE-bench/experiments</a>. Not affiliated
          with the SWE-bench team.
        </div>
        <div className="flex gap-4">
          <Link className="hover:text-fg" href="/methodology">Methodology</Link>
          <a className="hover:text-fg" href="https://github.com/defdevio/areyoubetterthan.ai">Source</a>
          <a className="hover:text-fg" href="https://github.com/defdevio/areyoutbetterthan.ai-submissions">Scoring audit trail</a>
        </div>
      </div>
    </footer>
  );
}
