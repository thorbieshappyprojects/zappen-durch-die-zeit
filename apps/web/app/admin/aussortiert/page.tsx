import { STATIONS } from "@zdz/core";
import { listUploadDecisions } from "@zdz/db";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { AdminGate } from "../AdminGate";
import { AdminNav } from "../AdminNav";
import { decideUploadGroup } from "./actions";
import { loadUploadReview } from "./review";

export const metadata: Metadata = { title: "Aussortierte Uploads – Zappen durch die Zeit", robots: { index: false } };
export const dynamic = "force-dynamic";

const CATEGORY_LABEL = { uploader: "wegen des Uploaders", inhalt: "wegen des Inhalts", politisch: "politische Propaganda" } as const;
const stationName = (slug?: string | null) => STATIONS.find((s) => s.slug === slug)?.name ?? slug ?? "–";
const minutes = (s?: number | null) => (s ? `${Math.round(s / 60)} Min.` : "");
const dateDe = (d?: string) => (d ? d.split("-").reverse().join(".") : "");

export default async function AdminUploadReview() {
  return (
    <AdminGate title="Aussortierte Uploads" next="/admin/aussortiert">
      <Inner />
    </AdminGate>
  );
}

async function Inner() {
  const [review, decisions] = await Promise.all([loadUploadReview(), listUploadDecisions((await db()).db)]);
  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Aussortierte Uploads</h1>
        <AdminNav current="/admin/aussortiert" />
      </header>
      <p className="admin-flag">
        Bei der Video-Suche aussortiert – mit Begründung. „Aufnehmen“ übernimmt die neuen Einträge einer Gruppe beim nächsten Daten-Update (
        <code>pnpm ingest review-apply</code>, dann Neuimport); der Name des Uploaders erscheint dabei nirgends im Fernseher. Die Links unten
        führen direkt zur Quelle, zum Prüfen.
      </p>
      {review.groups.length === 0 && <p>Keine Daten: Die Datei mit den aussortierten Uploads fehlt (UPLOAD_REVIEW_FILE).</p>}
      {review.groups.map((g) => {
        const d = decisions[g.id];
        const fresh = g.items.filter((i) => !i.covered);
        return (
          <article key={g.id} className={`admin-item review-group${d ? ` decided-${d.decision}` : ""}`}>
            <header>
              <strong>{g.source}</strong> <small>· {g.platform}</small> <span className={`badge review-${g.category}`}>{CATEGORY_LABEL[g.category]}</span>
              {d && (
                <span className="review-state">
                  {d.decision === "include" ? "✓ aufgenommen" : "✗ draußen"} am {d.decidedAt.toLocaleDateString("de-DE")}
                  {d.note && ` – „${d.note}“`}
                </span>
              )}
            </header>
            <dl className="review-facts">
              <dt>Warum aussortiert</dt>
              <dd>{g.reason}</dd>
              <dt>Aktivität</dt>
              <dd>{g.activity}</dd>
              <dt>Was das Konto sonst zeigt</dt>
              <dd>
                {g.profile}
                {g.sourceUrl && (
                  <>
                    {" "}
                    <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                      Quelle ansehen ↗
                    </a>
                  </>
                )}
              </dd>
              <dt>Was es bringen würde</dt>
              <dd>
                {g.impact}
                {g.items.length > 0 && (
                  <>
                    {" "}
                    <strong>
                      {fresh.length} neu
                      {g.items.length > fresh.length && `, ${g.items.length - fresh.length} haben wir schon aus anderer Quelle`}
                    </strong>
                    .
                  </>
                )}
              </dd>
            </dl>
            {g.items.length > 0 && (
              <details>
                <summary>Einträge ansehen ({fresh.length} neu)</summary>
                <table className="admin-table review-items">
                  <tbody>
                    {[...fresh, ...g.items.filter((i) => i.covered)].map((i) => (
                      <tr key={i.entry.url} className={i.covered ? "row-hidden" : ""}>
                        <td>{dateDe(i.entry.date ?? i.entry.airedOn) || String(i.entry.year ?? "")}</td>
                        <td>{stationName(i.entry.channel)}</td>
                        <td>
                          {Array.isArray(i.entry.titles) ? `${i.entry.titles[0]} – ` : ""}
                          {i.entry.note}
                        </td>
                        <td>{minutes(i.entry.durationS)}</td>
                        <td>
                          <a href={i.entry.url} target="_blank" rel="noopener noreferrer nofollow">
                            prüfen ↗
                          </a>
                          {i.covered && <small> schon vorhanden</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {g.canInclude ? (
              <AdminForm action={decideUploadGroup} className="review-decide">
                <input type="hidden" name="id" value={g.id} />
                <input name="note" placeholder="Notiz (optional)" defaultValue={d?.note ?? ""} maxLength={500} />
                <button className="play" name="decision" value="include" disabled={!fresh.length}>
                  Aufnehmen
                </button>
                <button className="btn" name="decision" value="exclude">
                  Draußen lassen
                </button>
                {d && (
                  <button className="btn" name="decision" value="reset">
                    Zurücksetzen
                  </button>
                )}
              </AdminForm>
            ) : (
              <p className="admin-flag">Nicht aufnehmbar – nur zur Information.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
