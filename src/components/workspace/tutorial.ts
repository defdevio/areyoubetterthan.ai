import { BUNDLE_VERSION, type SourceBundle } from "@/lib/bundle-types";
import type { ActiveAttempt, Briefing } from "./workspace";

// A tiny made-up repo that runs entirely in the browser. Nothing here is sent to the server.
const FILES: Record<string, string> = {
  "README.md": "# greeter\n\nA tiny helper for saying hello.\n",
  "greeter.py": 'def greet(name: str) -> str:\n    """Return a greeting for ``name``."""\n    return f"Hello, {name}?"\n',
};

export const TUTORIAL_BRIEFING: Briefing = {
  instance_id: "tutorial__greeter-1",
  repo: "acme/greeter",
  title: "Greetings should sound excited",
  base_commit: "7e1c0de7e1c0de7e1c0de7e1c0de7e1c0de7e1c0",
  version: "practice",
  created_at: "2024-01-01T00:00:00.000Z",
  problem_statement:
    "`greet()` in `greeter.py` ends every greeting with a question mark. Greetings should be excited, so they should end with an exclamation mark instead.\n\nFor example, `greet(\"Ada\")` should return `Hello, Ada!`",
  bundle_url: "",
};

export const TUTORIAL_BUNDLE: SourceBundle = {
  v: BUNDLE_VERSION,
  instance_id: TUTORIAL_BRIEFING.instance_id,
  repo: TUTORIAL_BRIEFING.repo,
  base_commit: TUTORIAL_BRIEFING.base_commit,
  files: FILES,
  omitted: {},
};

/** Built fresh per practice run so the timer fields are never stale. */
export function tutorialAttempt(): ActiveAttempt {
  const now = Date.now();
  return {
    id: "tutorial",
    instance_id: TUTORIAL_BRIEFING.instance_id,
    started_at: new Date(now).toISOString(),
    deadline_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    draft_diff: null,
    paste_events: [],
    task: TUTORIAL_BRIEFING,
  };
}

/** Workspace actions the practice tour waits for, in the order they're listed in TOUR_STEPS. */
export type TourEvent = "issue-hidden" | "issue-shown" | "search-opened" | "edited" | "review-opened";

export interface TourStep {
  title: string;
  body: string;
  /** data-tour attribute of the control to highlight */
  target?: string;
  /** Action that moves to the next step. Steps without one just show a Next button. */
  event?: TourEvent;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to the practice round",
    body: "Nothing here is scored or saved to your results. We'll walk through the controls one at a time, then you start the clock on a real issue.",
  },
  {
    title: "Hide the issue",
    body: "Click Hide issue to make room for code. You'll want the issue during the real test, so you can show it again any time.",
    target: "issue-toggle",
    event: "issue-hidden",
  },
  {
    title: "Show it again",
    body: "Click Show issue to bring it back.",
    target: "issue-toggle",
    event: "issue-shown",
  },
  {
    title: "Search the repo",
    body: "Open Search in the sidebar (or press ⌘ ⇧ F), search for greet, and click the result.",
    target: "sidebar-search",
    event: "search-opened",
  },
  {
    title: "Fix the bug",
    body: "The issue says greetings should end with an exclamation mark. Change the ? to ! in greet(). Your edits become a patch automatically.",
    target: "editor",
    event: "edited",
  },
  {
    title: "Review and submit",
    body: "Open Review & submit to see your patch, then submit it. Practice results are never scored.",
    target: "review-submit",
    event: "review-opened",
  },
];
