"use client";

import { useSyncExternalStore } from "react";

// Module-level so the header (rendered by the root layout) can react to the play workspace.
let active = false;
const listeners = new Set<() => void>();

export function setWorkspaceActive(next: boolean) {
  if (active === next) return;
  active = next;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** True while the full-width code and file-tree workspace is showing. */
export function useWorkspaceActive() {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => false,
  );
}
