import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: {
      ABT_FIXTURES: "1",
      PGLITE_DIR: "memory://",
      GITHUB_MODE: "mock",
      MOCK_SCORE_MS: "0",
      SESSION_SECRET: "test-secret-test-secret-test-secret-123",
    },
  },
});
