import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Monorepo: the Next.js app lives in apps/web.
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      // React Compiler rules (react-hooks 7). The app doesn't use the compiler, and the flagged patterns are deliberate:
      // browser storage read after mount (no hydration mismatch), "latest callback" refs for player events.
      // Warnings, so new cases stay visible without blocking CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores(["**/.next/**", "**/node_modules/**", "**/next-env.d.ts", "**/drizzle/**", ".data/**", "docs/archive/**", "**/*.tsbuildinfo"]),
]);
