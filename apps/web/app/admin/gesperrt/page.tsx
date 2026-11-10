import { listBlockedVideos } from "@zdz/db";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/ConfirmButton";
import { db } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { AdminGate } from "../AdminGate";
import { AdminNav } from "../AdminNav";
import { unblock } from "./actions";

export const metadata: Metadata = { title: "Gesperrte Videos – Zappen durch die Zeit", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminBlocked() {
  return (
    <AdminGate title="Gesperrte Videos" next="/admin/gesperrt">
      <Inner />
    </AdminGate>
  );
}

async function Inner() {
  const blocked = await listBlockedVideos((await db()).db);
  return (
    <div className="wrap contrib admin">
      <header className="page-header">
        <h1>Gesperrte Videos</h1>
        <AdminNav current="/admin/gesperrt" />
      </header>
      <p className="admin-flag">
        Von Hand als defekt markiert oder automatisch gesperrt (3 Meldungen „nicht verfügbar“ und fehlgeschlagene Prüfung). Gesperrte Videos
        erscheinen nirgends im Fernseher, auch nicht nach einem Neuimport.
      </p>
      {blocked.length === 0 && <p>Keine gesperrten Videos.</p>}
      {blocked.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Gesperrt am</th>
              <th>Video</th>
              <th>Grund</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {blocked.map((b) => (
              <tr key={b.url}>
                <td>{b.createdAt.toLocaleDateString("de-DE")}</td>
                <td>
                  <a href={b.url} target="_blank" rel="noopener noreferrer nofollow">
                    {b.url}
                  </a>
                </td>
                <td>{b.reason}</td>
                <td>
                  <AdminForm action={unblock}>
                    <input type="hidden" name="url" value={b.url} />
                    <ConfirmButton>Entsperren</ConfirmButton>
                  </AdminForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
