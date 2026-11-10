"use client";

import { useRef, useState, type CSSProperties } from "react";
import { reportVideo, type ReportInput } from "@/app/melden/actions";
import { fetchFormToken } from "@/lib/form-token";
import { useDialog } from "@/lib/use-dialog";

const REASONS: { value: ReportInput["reason"]; label: string }[] = [
  { value: "unavailable", label: "Video nicht verfügbar" },
  { value: "wrong_programme", label: "Falsche Sendung" },
  { value: "wrong_offset", label: "Falsche Stelle/Zeit" },
  { value: "other", label: "Anderes" },
];

type Context = Pick<ReportInput, "url" | "tvDate" | "channel" | "start" | "title">;

/** A person's report needs a token at least this old (server MIN_FILL_SECONDS). */
const MIN_FILL_MS = 2100;

/**
 * "⚠ Video defekt / falsch": one click, a reason, an optional note. No name, no e-mail.
 * An "expired" answer (TV open for a day) is sent once more with a fresh token.
 */
export function VideoReport({ context, token, refreshToken }: { context: Context; token: string; refreshToken: () => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ReportInput["reason"]>("unavailable");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  // The info strip clips its overflow, so the form is placed relative to the window, above the button.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Escape closes, focus starts on the first reason and goes back to the button.
  useDialog(formRef, { open, onClose: () => setOpen(false), initialFocus: () => formRef.current?.querySelector<HTMLElement>("input[type=radio]") ?? null });
  const [pos, setPos] = useState<CSSProperties>({});
  const toggle = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 276)), bottom: window.innerHeight - r.top + 8 });
    setOpen((o) => !o);
  };

  if (sent) return <span className="report-done">Danke – wir sehen es uns an.</span>;
  return (
    <span className="report">
      <button
        ref={buttonRef}
        type="button"
        className="strip-action"
        onClick={toggle}
        aria-expanded={open}
        title="Das Video ist defekt oder zeigt die falsche Sendung? Hier melden."
      >
        ⚠ Video melden
      </button>
      {open && (
        <form
          ref={formRef}
          className="report-form"
          role="dialog"
          aria-modal="true"
          aria-label="Video melden"
          style={pos}
          onSubmit={async (e) => {
            e.preventDefault();
            const first = await reportVideo({ ...context, reason, note, token, website });
            if (first.expired) {
              const fresh = await refreshToken().catch(() => null);
              if (fresh) {
                await new Promise((r) => setTimeout(r, MIN_FILL_MS));
                await reportVideo({ ...context, reason, note, token: fresh, website });
              }
            }
            setSent(true);
          }}
        >
          {REASONS.map((r) => (
            <label key={r.value}>
              <input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} /> {r.label}
            </label>
          ))}
          <input className="report-note" placeholder="Hinweis (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          {/* Honeypot */}
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <span className="report-actions">
            <button type="submit" className="btn">
              Melden
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </span>
        </form>
      )}
    </span>
  );
}

/**
 * The player failed to load a video: report it anonymously, at most once per video, browser and day.
 */
/** URLs reported automatically today (one small map; earlier days are dropped). */
const REPORTED_KEY = "zdz-reported";

export function reportFailedVideo(context: Context, token: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // One report per video and day.
    const stored = JSON.parse(localStorage.getItem(REPORTED_KEY) ?? "{}") as { day?: string; urls?: string[] };
    const urls = stored.day === today && Array.isArray(stored.urls) ? stored.urls : [];
    if (urls.includes(context.url)) return;
    localStorage.setItem(REPORTED_KEY, JSON.stringify({ day: today, urls: [...urls, context.url].slice(-200) }));
    // Clean up the one-key-per-URL entries of earlier versions.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${REPORTED_KEY}:`)) localStorage.removeItem(k);
    }
  } catch {
    return;
  }
  // Automatic reports have no minimum fill time: an expired token is simply renewed and sent again.
  void reportVideo({ ...context, reason: "unavailable", automatic: true, token })
    .then(async (res) => {
      if (res.expired) await reportVideo({ ...context, reason: "unavailable", automatic: true, token: await fetchFormToken() });
    })
    .catch(() => {});
}
