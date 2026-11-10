import { securityHeaders } from "@zdz/core";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zdz/core", "@zdz/db"],
  // The dev badge sat on the year bar's ◀ button and caught its clicks; build errors still show.
  devIndicators: false,
  // PGlite loads its WASM/data files from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Fixed security headers for every response; the CSP with its nonce comes from proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ production: process.env.NODE_ENV === "production" }) }];
  },
};

export default nextConfig;
