import { STATIONS } from "@zdz/core";
import { listInterstitials } from "@zdz/db";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AdminGate } from "../AdminGate";
import { AdminNav } from "../AdminNav";
import { setStatus } from "./actions";
import { AddForm } from "./AddForm";

export const metadata: Metadata = { title: "Zwischenspiele – Zappen durch die Zeit", robots: { index: false } };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  ad_break: "Werbung",
  ident: "Ident",
  announcer: "Ansage",
  trailer: "Trailer",
  sign_off: "Sendeschluss",
  sign_on: "Programmbeginn",
  test_card: "Testbild",
};
const STATUS_LABEL: Record<string, string> = { proposed: "Vorschlag", approved: "freigegeben", rejected: "abgelehnt", dead: "defekt" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function AdminInterstitials(props: Props) {
  return (
    <AdminGate title="Zwischenspiele" next="/admin/zwischenspiele">
      <Inner {...props} />
    </AdminGate>
  );
}

async function Inner({ searchParams }: Props) {
  const prefill = await searchParams;
  const rows = await listInterstitials((await db()).db);
  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Zwischenspiele</h1>
        <AdminNav current="/admin/zwischenspiele" />
      </header>
      <p className="admin-flag">
        Werbung, Senderkennungen, Ansagen und Sendeschluss zwischen den Sendungen. Nur Links auf vorhandene Videos. „Von/Bis
        Sekunde“ schneidet einen Ausschnitt aus einer längeren Aufnahme.
      </p>
      <AddForm prefill={prefill} stations={STATIONS.map((s) => ({ slug: s.slug, name: s.name }))} />
      <table className="admin-table">
        <thead>
          <tr>
            <th>Art</th>
            <th>Sender</th>
            <th>Zeit</th>
            <th>Ausschnitt</th>
            <th>Notiz / Link</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{KIND_LABEL[r.kind]}</td>
              <td>{r.channelSlug ?? "Pool"}</td>
              <td>{r.airedOn ?? r.airedPeriod ?? (r.validFrom || r.validTo ? `${r.validFrom ?? "…"}–${r.validTo ?? "…"}` : "–")}</td>
              <td>{r.inS !== null || r.outS !== null ? `${r.inS ?? 0}–${r.outS ?? "Ende"} s` : "ganz"}</td>
              <td>
                <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                  {r.notes || r.url}
                </a>
              </td>
              <td>{STATUS_LABEL[r.status]}</td>
              <td className="admin-actions">
                {(["approved", "rejected"] as const)
                  .filter((s) => s !== r.status)
                  .map((s) => (
                    <AdminForm key={s} action={setStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={s} />
                      {s === "approved" ? <button className="btn">Freigeben</button> : <ConfirmButton>Ablehnen</ConfirmButton>}
                    </AdminForm>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
