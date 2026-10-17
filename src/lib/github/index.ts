import "server-only";
import { config } from "@/lib/config";
import { GitHubAppBackend } from "./app";
import { MockBackend } from "./mock";
import type { ScoringBackend } from "./types";

let backend: ScoringBackend | null = null;

export function getBackend(): ScoringBackend {
  backend ??= config.github.mode === "app" ? new GitHubAppBackend() : new MockBackend();
  return backend;
}

export function setBackendForTests(b: ScoringBackend | null) {
  backend = b;
}

export * from "./types";
