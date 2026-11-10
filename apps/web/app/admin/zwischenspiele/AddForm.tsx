"use client";

import { useActionState } from "react";
import { addInterstitial } from "./actions";

const KINDS: [string, string][] = [
  ["ad_break", "Werbung"],
  ["ident", "Senderkennung (Ident)"],
  ["announcer", "Ansage"],
  ["trailer", "Trailer"],
  ["sign_off", "Sendeschluss"],
  ["sign_on", "Programmbeginn"],
  ["test_card", "Testbild"],
];

export function AddForm({ prefill, stations }: { prefill: Record<string, string | undefined>; stations: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addInterstitial, {});
  return (
    <form action={action} className="contrib-form admin-add">
      <fieldset>
        <label className="wide">
          Link (YouTube, Dailymotion, Internet Archive, Vimeo)
          <input name="url" required defaultValue={prefill.url} />
        </label>
        <label>
          Art
          <select name="kind" defaultValue={prefill.kind ?? "ident"}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sender
          <select name="channel" defaultValue={prefill.channel ?? ""}>
            <option value="">– alle (Pool) –</option>
            {stations.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gesendet (JJJJ oder JJJJ-MM-TT)
          <input name="aired" defaultValue={prefill.aired} pattern="\d{4}(-\d{2}-\d{2})?" />
        </label>
        <label>
          Von Sekunde
          <input name="inS" type="number" min="0" step="0.1" />
        </label>
        <label>
          Bis Sekunde
          <input name="outS" type="number" min="0" step="0.1" />
        </label>
        <label className="wide">
          Notiz
          <input name="note" defaultValue={prefill.note} maxLength={300} />
        </label>
      </fieldset>
      {state.error && <p className="contrib-errors">{state.error}</p>}
      {state.ok && <p className="report-done">Gespeichert und freigegeben.</p>}
      <button className="play" disabled={pending}>
        Zwischenspiel anlegen
      </button>
    </form>
  );
}
