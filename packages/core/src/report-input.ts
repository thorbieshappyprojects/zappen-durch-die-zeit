/**
 * "Video defekt melden" arrives as a server action argument: its TypeScript type is not checked at
 * runtime. `parseReportInput` accepts only a plain object with fields of the right kind and length.
 */
export const REPORT_REASONS = ["unavailable", "wrong_programme", "wrong_offset", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface ReportInput {
  url: string;
  reason: ReportReason;
  note?: string;
  tvDate?: string;
  channel?: string;
  start?: string;
  title?: string;
  automatic?: boolean;
  token: string;
  /** Honeypot; people leave it empty. */
  website?: string;
}

const OPTIONAL_STRINGS: Record<string, number> = { note: 2000, tvDate: 10, channel: 40, start: 5, title: 300, website: 300 };

export function parseReportInput(raw: unknown): ReportInput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== "string" || !/^https?:\/\/\S{5,500}$/.test(r.url)) return null;
  if (typeof r.reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(r.reason)) return null;
  if (typeof r.token !== "string" || r.token.length > 100) return null;
  if (r.automatic !== undefined && typeof r.automatic !== "boolean") return null;
  const out: ReportInput = { url: r.url, reason: r.reason as ReportReason, token: r.token, automatic: r.automatic as boolean | undefined };
  for (const [key, max] of Object.entries(OPTIONAL_STRINGS)) {
    const v = r[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" || v.length > max) return null;
    (out as unknown as Record<string, string>)[key] = v;
  }
  return out;
}
