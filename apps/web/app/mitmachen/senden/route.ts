import { UPLOAD_LIMITS } from "@zdz/core";
import { handleSubmission, type SubmitState } from "@/lib/contribution-submit";

export const dynamic = "force-dynamic";

/** Attachments plus the form fields; anything larger is refused before it is read. */
const MAX_BODY_BYTES = UPLOAD_LIMITS.totalBytes + 1024 * 1024;

const answer = (state: SubmitState, status = 200) => Response.json(state, { status, headers: { "Cache-Control": "no-store" } });
const tooLarge = () => answer({ status: "error", errors: ["Die Dateien sind zusammen größer als 25 MB."] }, 413);

/**
 * Mitmachen submissions with attachments. A route instead of a server action: it can refuse a large
 * body from Content-Length and stop reading at the cap, so server actions keep the small default limit.
 */
export async function POST(request: Request) {
  // Server actions check the origin themselves; a route handler has to (no cross-site posts).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return answer({ status: "error", errors: ["Ungültige Anfrage."] }, 403);

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return tooLarge();
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (!body) return tooLarge();
  let form: FormData;
  try {
    form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return answer({ status: "error", errors: ["Ungültige Anfrage."] }, 400);
  }
  return answer(await handleSubmission(form, request.headers));
}

/** The request body, or null as soon as it grows beyond `cap` (stops reading there). */
async function readCapped(request: Request, cap: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(new ArrayBuffer(0));
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
