import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8 text-xs text-faint">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
        <div>
          Tasks from <a className="hover:text-fg" href="https://www.swebench.com/">SWE-bench Verified</a>, model results from{" "}
          <a className="hover:text-fg" href="https://github.com/SWE-bench/experiments">SWE-bench/experiments</a> and{" "}
          <a className="hover:text-fg" href="https://www.vals.ai/benchmarks/swebench">vals.ai</a>. Not affiliated with the
          SWE-bench team or vals.ai.
          <div className="mt-1">
            <a className="hover:text-fg" href="https://thenounproject.com/icon/turing-test-6570497/">“Turing Test”</a> icon by Adrien Coquet from <a className="hover:text-fg" href="https://thenounproject.com/icon/turing-test-6570497/">Noun Project</a>.
          </div>
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
