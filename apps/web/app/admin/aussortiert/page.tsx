import { STATIONS } from "@zdz/core";
import { listUploadDecisions } from "@zdz/db";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { AdminGate } from "../AdminGate";
import { AdminNav } from "../AdminNav";
import { decideUploadGroup } from "./actions";
import { loadSeedUrls, loadUploadReview } from "./review";

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
  const [review, decisions, seedUrls] = await Promise.all([loadUploadReview(), listUploadDecisions((await db()).db), loadSeedUrls()]);
  // Undecided first, then included, then left out; groups that can't be included at the end.
  const rank = (g: (typeof review.groups)[number]) =>
    !g.canInclude ? 3 : !decisions[g.id] ? 0 : decisions[g.id]!.decision === "include" ? 1 : 2;
  const groups = [...review.groups].sort((a, b) => rank(a) - rank(b));
  const open = groups.filter((g) => g.canInclude && !decisions[g.id]).length;
  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Aussortierte Uploads</h1>
        <AdminNav current="/admin/aussortiert" />
      </header>
      <p className="admin-flag">
        Bei der Video-Suche aussortiert – mit Begründung. „Aufnehmen“ übernimmt die neuen Einträge einer Gruppe beim nächsten Daten-Update (
        <code>pnpm ingest review-apply</code>, dann Neuimport); der Name des Uploaders erscheint dabei nirgends im Fernseher. Die Links
        unten führen direkt zur Quelle, zum Prüfen.
      </p>
      {review.groups.length === 0 && <p>Keine Daten: Die Datei mit den aussortierten Uploads fehlt (UPLOAD_REVIEW_FILE).</p>}
      {review.groups.length > 0 && (
        <p>
          <strong>
            {open ? `${open} ${open === 1 ? "Gruppe wartet" : "Gruppen warten"} auf eine Entscheidung` : "Alle Gruppen sind entschieden."}
          </strong>{" "}
          Entschiedene Gruppen stehen eingeklappt darunter.
        </p>
      )}
      {groups.map((g) => {
        const d = decisions[g.id];
        const fresh = g.items.filter((i) => !i.covered);
        // Included, but not yet in the seed files of this version: review-export → review-apply → data update.
        const pending = d?.decision === "include" ? fresh.filter((i) => !seedUrls.has(i.entry.url)).length : 0;
        const Wrap = d ? "details" : "div";
        return (
          <article key={g.id} className={`admin-item review-group${d ? ` decided-${d.decision}` : ""}`}>
            <header>
              <strong>{g.source}</strong> <small>· {g.platform}</small>{" "}
              <span className={`badge review-${g.category}`}>{CATEGORY_LABEL[g.category]}</span>
              {d && (
                <span className="review-state">
                  {d.decision === "include" ? "✓ aufgenommen" : "✗ draußen"} am {d.decidedAt.toLocaleDateString("de-DE")}
                  {d.note && ` – „${d.note}“`}
                </span>
              )}
            </header>
            {pending > 0 && (
              <p className="admin-flag review-pending">
                Entscheidung noch nicht übernommen: {pending} {pending === 1 ? "Eintrag kommt" : "Einträge kommen"} erst mit dem nächsten
                Daten-Update in den Fernseher (<code>pnpm ingest review-export</code> auf dem Server, <code>review-apply --decisions</code>,
                Neuimport).
              </p>
            )}
            <Wrap className="review-body">
              {d && <summary>Details und Einträge</summary>}
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
            </Wrap>
          </article>
        );
      })}
    </div>
  );
}
