/** Fails fast if a production server is missing configuration, instead of silently falling back to mocks. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.ABT_E2E === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionConfig } = await import("@/lib/config");
  assertProductionConfig();
}
