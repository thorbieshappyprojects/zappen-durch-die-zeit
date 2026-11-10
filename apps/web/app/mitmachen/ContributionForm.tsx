"use client";

import { checkUploadsBeforeSending, RETENTION_DAYS } from "@zdz/core";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useFormToken } from "@/lib/form-token";
import type { SubmitState } from "@/lib/contribution-submit";

interface Props {
  token: string;
  /** Broadcast the visitor came from ("Video vorschlagen" in the TV), sent along as context. */
  context: { tvDate?: string; channel?: string; channelName?: string; start?: string; title?: string };
}

/**
 * The form submits itself (no `action` prop): React resets a form after every form action, also
 * on errors, which wiped a whole typed-in day. This way text, ticks and selected files all stay.
 */
export function ContributionForm({ token: initialToken, context }: Props) {
  const { token, refresh } = useFormToken(initialToken);
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(async (_prev, form) => {
    try {
      // Own route (not a server action): it refuses oversized bodies before reading them.
      const res = await fetch("/mitmachen/senden", { method: "POST", body: form });
      return (await res.json()) as SubmitState;
    } catch {
      // Too large for the server or no connection: no error page, the content stays.
      return { status: "error", errors: ["Senden hat nicht geklappt (Verbindung unterbrochen oder Anhänge zu groß). Bitte noch einmal versuchen."] };
    }
  }, { status: "idle", errors: [] });
  const [withContext, setWithContext] = useState(Boolean(context.tvDate || context.title));
  // Sent with an expired token: a fresh one for the next try.
  useEffect(() => {
    if (state.expired) void refresh().catch(() => {});
  }, [state, refresh]);
  /** Attachment problems found in the browser, before anything is sent. */
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const errors = fileErrors.length ? fileErrors : state.status === "error" ? state.errors : [];

  if (state.status === "ok")
    return (
      <div className="contrib-done" role="status">
        <p>
          <strong>Danke!</strong> Dein Beitrag ist eingegangen. Wir sehen ihn uns an, bevor etwas davon erscheint.
        </p>
        <button className="btn" onClick={() => location.reload()}>
          Noch etwas schicken
        </button>
      </div>
    );

  const contextLabel = [
    [context.start, context.title].filter(Boolean).join(" "),
    context.channelName ?? context.channel,
    context.tvDate && new Date(`${context.tvDate}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      className="contrib-form"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("files") as HTMLInputElement | null;
        const problems = checkUploadsBeforeSending(Array.from(input?.files ?? []));
        setFileErrors(problems);
        if (problems.length) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="token" value={token} />
      {/* Honeypot: hidden from people, tempting for bots. */}
      <div className="hp" aria-hidden="true">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {withContext && (
        <p className="contrib-context">
          Es geht um: <strong>{contextLabel}</strong>
          <button type="button" className="btn" aria-label="Bezug entfernen" onClick={() => setWithContext(false)}>
            ×
          </button>
          {(["tvDate", "channel", "start", "title"] as const).map((k) =>
            context[k] ? <input key={k} type="hidden" name={k} value={context[k]} /> : null,
          )}
        </p>
      )}

      <label className="wide">
        Was möchtest du uns schicken?
        <textarea
          name="body"
          rows={8}
          maxLength={20000}
          autoFocus
          placeholder={
            "Einfach hineinschreiben oder einfügen, zum Beispiel:\n" +
            "• einen Link zu einer Aufnahme (YouTube, Dailymotion, Internet Archive …)\n" +
            "• das Programm eines Tages aus einer alten Fernsehzeitschrift\n" +
            "• einen Hinweis oder eine Korrektur"
          }
        />
      </label>

      <label className="wide">
        Fotos, PDFs oder Textdateien (optional)
        <input
          type="file"
          name="files"
          multiple
          onChange={(e) => setFileErrors(checkUploadsBeforeSending(Array.from(e.target.files ?? [])))}
          accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf,.txt,.csv,.tsv,.md,text/plain,text/csv"
        />
      </label>

      <details className="contrib-more">
        <summary>Name oder E-Mail angeben (optional)</summary>
        <fieldset>
          <label>
            Name (für die Nennung)
            <input name="contributorName" maxLength={80} autoComplete="nickname" />
          </label>
          <label>
            E-Mail (nur für Rückfragen)
            <input type="email" name="contributorEmail" maxLength={120} autoComplete="email" />
          </label>
        </fieldset>
      </details>

      <label className="consent-check">
        <input type="checkbox" name="consent" required /> Einverstanden: Wir speichern deine Angaben zur Prüfung und dürfen
        Programmdaten und Links veröffentlichen (deinen Namen nur, wenn du ihn angibst). Dateien sieht nur die Moderation.
        Keine IP-Adresse, nur ein täglich wechselnder Prüfwert gegen Spam. Abgelehnte Beiträge löschen wir samt Dateien nach{" "}
        {RETENTION_DAYS.rejected} Tagen, deine E-Mail-Adresse {RETENTION_DAYS.email} Tage nach der Prüfung (
        <Link href="/datenschutz">Datenschutz</Link>).
      </label>

      {errors.length > 0 && (
        <ul className="contrib-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button className="play" type="submit" disabled={pending}>
        {pending ? "Wird gesendet …" : "Abschicken"}
      </button>
    </form>
  );
}
