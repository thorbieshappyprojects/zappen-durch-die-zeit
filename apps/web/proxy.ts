import { contentSecurityPolicy, isCalendarDate } from "@zdz/core";
import { NextResponse, type NextRequest } from "next/server";

/**
 * A fresh CSP nonce per page request (Next puts it on its own scripts when it finds it in the
 * request's CSP header; pages are rendered per request, see app/layout.tsx). CSP_REPORT_ONLY=1
 * sends the policy as report-only, to try a change without blocking anything.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === "development" });
  const header = process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  // An impossible date: the 404 page with a real 404 status (the day page streams, so its own
  // notFound() could only send the page, not the status).
  const day = /^\/tag\/([^/]+)/.exec(request.nextUrl.pathname)?.[1];
  const response =
    day !== undefined && !isCalendarDate(decodeURIComponent(day))
      ? NextResponse.rewrite(new URL("/kein-empfang", request.url), { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Not for static files, images and routes with their own policy (uploaded files, share image).
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|og|healthz|robots.txt|sitemap.xml|admin/beitraege/datei).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
