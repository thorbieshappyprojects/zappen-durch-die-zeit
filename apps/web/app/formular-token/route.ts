import { issueFormToken } from "@/lib/contribution-security";

export const dynamic = "force-dynamic";

/** A fresh signed form token for pages left open for a long time (lib/form-token.ts). */
export function GET() {
  return Response.json({ token: issueFormToken() }, { headers: { "Cache-Control": "no-store" } });
}
