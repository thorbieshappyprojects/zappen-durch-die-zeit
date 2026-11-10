import { extractVideoUrls, parseScheduleText, STATIONS } from "@zdz/core";
import { countContributionsByStatus, listContributionFiles, listContributions, type ContributionFileRow, type ContributionRow } from "@zdz/db";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { approveVideo, removeContribution, setStatus } from "./actions";
import { AdminGate } from "../AdminGate";
import { AdminNav } from "../AdminNav";
import { Pager, PAGE_SIZE, pageOf } from "../Pager";

export const metadata: Metadata = { title: "Beiträge prüfen – Zappen durch die Zeit", robots: { index: false } };
export const dynamic = "force-dynamic";

const TABS: { status: ContributionRow["status"]; label: string }[] = [
  { status: "pending", label: "Neu" },
  { status: "spam", label: "Spam" },
  { status: "approved", label: "Freigegeben" },
  { status: "rejected", label: "Abgelehnt" },
];
const KIND_LABEL = { video_link: "Video-Link", schedule: "TV-Programm", note: "Hinweis" } as const;

type Props = { searchParams: Promise<{ status?: string; seite?: string }> };

export default async function AdminContributions(props: Props) {
  return (
    <AdminGate title="Beiträge prüfen" next="/admin/beitraege">
      <Contributions {...props} />
    </AdminGate>
  );
}

async function Contributions({ searchParams }: Props) {
  const { status: s, seite } = await searchParams;
  const status = TABS.find((t) => t.status === s)?.status ?? "pending";
  const counts = await countContributionsByStatus((await db()).db);
  const page = pageOf(seite, counts[status]);
  const rows = await listContributions((await db()).db, status, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const files = await listContributionFiles((await db()).db, rows.map((r) => r.id));
  const filesOf = (id: number) => files.filter((f) => f.contributionId === id);

  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Beiträge prüfen</h1>
        <AdminNav current="/admin/beitraege" />
      </header>
      <nav className="contrib-tabs">
        {TABS.map((t) => (
          <Link key={t.status} className={`btn${t.status === status ? " on" : ""}`} href={`/admin/beitraege?status=${t.status}`}>
            {t.label} ({counts[t.status]})
          </Link>
        ))}
      </nav>
      {rows.length === 0 && <p>Keine Beiträge.</p>}
      <Pager page={page} total={counts[status]} href={(n) => `/admin/beitraege?status=${status}&seite=${n}`} />
      {rows.map((c) => (
        <article key={c.id} className="admin-item">
          <header>
            <strong>
              #{c.id} {KIND_LABEL[c.kind]}
            </strong>{" "}
            <span className="admin-kind-auto">(automatisch erkannt)</span>{" "}
            · {c.tvDate ?? "ohne Datum"} · {c.channel ?? "–"} {c.broadcastStart ?? ""} {c.broadcastTitle ? `· ${c.broadcastTitle}` : ""}
            <small>
              {" "}
              · {c.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
              {c.contributorName && ` · von ${c.contributorName}`}
              {c.contributorEmail && ` <${c.contributorEmail}>`}
            </small>
          </header>
          {c.url && (
            <p>
              <a className="contrib-link" href={c.url} target="_blank" rel="noopener noreferrer nofollow">
                {c.url}
              </a>
            </p>
          )}
          {c.sourceInfo && <p>Quelle: {c.sourceInfo}</p>}
          {c.suggestedKind && c.url && (
            <p className="admin-flag">
              Sieht nach einem Zwischenspiel aus ({c.suggestedKind}):{" "}
              <Link
                href={`/admin/zwischenspiele?${new URLSearchParams({
                  url: c.url,
                  kind: c.suggestedKind,
                  ...(c.channel ? { channel: c.channel } : {}),
                  ...(c.tvDate ? { aired: c.tvDate } : {}),
                  note: (c.body ?? "").slice(0, 120),
                })}`}
              >
                Als Zwischenspiel anlegen
              </Link>
            </p>
          )}
          {c.kind === "schedule" && c.body && <SchedulePreview body={c.body} />}
          {c.body && (c.kind === "schedule" ? (
            <details>
              <summary>Originaltext</summary>
              <p className="admin-body">{c.body}</p>
            </details>
          ) : (
            <p className="admin-body">{c.body}</p>
          ))}
          {filesOf(c.id).length > 0 && <Attachments files={filesOf(c.id)} />}
          {c.spamReasons && <p className="admin-flag">Spam-Filter: {c.spamReasons.join(", ")}</p>}
          {c.reviewNote && <p className="admin-flag">Notiz: {c.reviewNote}</p>}
          <div className="admin-actions">
            {c.status !== "approved" && (c.url || extractVideoUrls(c.body ?? "").length > 0) && (
              <AdminForm action={approveVideo} className="admin-approve">
                <input type="hidden" name="id" value={c.id} />
                <input name="url" defaultValue={c.url ?? extractVideoUrls(c.body ?? "")[0]} placeholder="Link" required />
                <input type="date" name="tvDate" defaultValue={c.tvDate ?? ""} required />
                <select name="channel" defaultValue={c.channel ?? ""} required>
                  <option value="">Sender …</option>
                  {STATIONS.map((st) => (
                    <option key={st.slug} value={st.slug}>
                      {st.name}
                    </option>
                  ))}
                </select>
                <input name="start" defaultValue={c.broadcastStart ?? ""} placeholder="HH:MM" pattern="\d{1,2}:\d{2}" required size={5} />
                <select name="level" defaultValue="same_show_period">
                  <option value="exact">🟢 genau diese Sendung</option>
                  <option value="same_show_period">🟡 gleiche Sendung, gleiches Jahr</option>
                  <option value="same_show">🔵 ähnlich (auch: andere Folge, fremder Sender/Kommentar)</option>
                </select>
                <button className="play">Als Video freigeben</button>
              </AdminForm>
            )}
            {c.status !== "approved" && (
              <StatusButton id={c.id} status="approved" label="Erledigt (von Hand übernommen)" />
            )}
            {c.status !== "rejected" && <StatusButton id={c.id} status="rejected" label="Ablehnen" />}
            {c.status !== "spam" && <StatusButton id={c.id} status="spam" label="Spam" />}
            {c.status !== "pending" && <StatusButton id={c.id} status="pending" label="Zurück auf neu" />}
            <AdminForm action={removeContribution}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton>Endgültig löschen</ConfirmButton>
            </AdminForm>
          </div>
        </article>
      ))}
      {rows.length > 0 && <Pager page={page} total={counts[status]} href={(n) => `/admin/beitraege?status=${status}&seite=${n}`} />}
    </div>
  );
}

function StatusButton({ id, status, label }: { id: number; status: ContributionRow["status"]; label: string }) {
  // Spam and rejection act right away: ask once more.
  const destructive = status === "spam" || status === "rejected";
  return (
    <AdminForm action={setStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {destructive ? <ConfirmButton>{label}</ConfirmButton> : <button className="btn">{label}</button>}
    </AdminForm>
  );
}

function SchedulePreview({ body }: { body: string }) {
  const { entries, skipped } = parseScheduleText(body);
  return (
    <details open>
      <summary>
        {entries.length} Sendungen erkannt{skipped ? `, ${skipped} Zeilen übersprungen` : ""}
      </summary>
      <table className="admin-table">
        <tbody>
          {entries.slice(0, 80).map((e, i) => (
            <tr key={i}>
              <td>{e.start}</td>
              <td>{e.title}</td>
              <td>{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Attachments({ files }: { files: ContributionFileRow[] }) {
  return (
    <div className="admin-files">
      {files.map((f) => {
        const href = `/admin/beitraege/datei/${f.id}`;
        const kb = Math.max(1, Math.round(f.sizeBytes / 1024));
        return f.mime.startsWith("image/") && f.mime !== "image/heic" ? (
          <a key={f.id} href={href} target="_blank" rel="noopener noreferrer" title={f.originalName}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private admin-only file, not optimisable */}
            <img src={href} alt={f.originalName} />
          </a>
        ) : (
          <a key={f.id} className="btn" href={href}>
            📎 {f.originalName} ({kb} KB)
          </a>
        );
      })}
    </div>
  );
}
