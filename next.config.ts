import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets tests build into a separate directory without disturbing a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite loads its WASM/data files via URL-based fs reads, which break when bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
