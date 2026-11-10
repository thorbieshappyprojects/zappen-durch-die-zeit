import { listOpenReportGroups } from "@zdz/db";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AdminGate } from "../AdminGate";
import { AdminNav } from "../AdminNav";
import { Pager, PAGE_SIZE, pageOf } from "../Pager";
import { decideReports } from "./actions";

export const metadata: Metadata = { title: "Video-Meldungen – Zappen durch die Zeit", robots: { index: false } };
export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  unavailable: "nicht verfügbar",
  wrong_programme: "falsche Sendung",
  wrong_offset: "falsche Stelle/Zeit",
  other: "anderes",
};

export default async function AdminReports(props: Props) {
  return (
    <AdminGate title="Video-Meldungen" next="/admin/meldungen">
      <Inner {...props} />
    </AdminGate>
  );
}

type Props = { searchParams: Promise<{ seite?: string }> };

async function Inner({ searchParams }: Props) {
  const all = await listOpenReportGroups((await db()).db);
  const page = pageOf((await searchParams).seite, all.length);
  const groups = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pager = <Pager page={page} total={all.length} href={(n) => `/admin/meldungen?seite=${n}`} />;
  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Video-Meldungen</h1>
        <AdminNav current="/admin/meldungen" />
      </header>
      <p>
        <Link href="/admin/gesperrt">Gesperrte Videos ansehen und entsperren →</Link>
      </p>
      <p className="admin-flag">
        Meldungen ändern nichts automatisch – außer: ab 3 Meldungen „nicht verfügbar“ in 7 Tagen und fehlgeschlagener
        Prüfung wird ein Video von selbst gesperrt.
      </p>
      {all.length === 0 && <p>Keine offenen Meldungen.</p>}
      {pager}
      {groups.map((g) => (
        <article key={g.url} className="admin-item">
          <header>
            <strong>{g.reports}× gemeldet</strong>
            {g.automatic > 0 && <small> (davon {g.automatic} automatisch vom Player)</small>}
            {g.blocked && <small> · bereits gesperrt</small>}
            {" · "}
            {Object.entries(g.reasons)
              .map(([r, n]) => `${REASON_LABEL[r] ?? r} ${n}×`)
              .join(", ")}
          </header>
          <p>
            <a className="contrib-link" href={g.url} target="_blank" rel="noopener noreferrer nofollow">
              {g.url}
            </a>
          </p>
          <p>
            Zuletzt gesehen: {g.latest.tvDate ?? "?"} · {g.latest.channel ?? "?"} {g.latest.broadcastStart ?? ""}{" "}
            {g.latest.broadcastTitle ? `· ${g.latest.broadcastTitle}` : ""}
            {g.latest.tvDate && (
              <>
                {" "}
                ·{" "}
                <Link href={`/tag/${g.latest.tvDate}?${new URLSearchParams({ ...(g.latest.channel ? { sender: g.latest.channel } : {}), ...(g.latest.broadcastStart ? { zeit: g.latest.broadcastStart } : {}) })}`}>
                  im Fernseher öffnen
                </Link>
              </>
            )}
          </p>
          {g.notes.length > 0 && <p className="admin-body">{g.notes.join("\n")}</p>}
          <div className="admin-actions">
            {(
              [
                ["dead", "Als defekt markieren"],
                ["ignored", "Ignorieren"],
                ["review", "Zur Prüfung"],
              ] as const
            ).map(([action, label]) => (
              <AdminForm key={action} action={decideReports}>
                <input type="hidden" name="url" value={g.url} />
                <input type="hidden" name="action" value={action} />
                {action === "dead" ? <ConfirmButton className="play">{label}</ConfirmButton> : <button className="btn">{label}</button>}
              </AdminForm>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
