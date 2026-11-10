import { STATIONS } from "@zdz/core";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/LegalLinks";
import { issueFormToken } from "@/lib/contribution-security";
import { ContributionForm } from "./ContributionForm";

export const metadata: Metadata = { title: "Mitmachen – Zappen durch die Zeit" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MitmachenPage({ searchParams }: Props) {
  const p = await searchParams;
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const channel = one("sender");
  // Only a real date goes into the back link and the form (the parameter is caller-controlled).
  const tag = one("tag");
  const date = tag && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? tag : undefined;
  return (
    <div className="wrap contrib">
      <header className="page-header">
        <h1>Mitmachen</h1>
        <Link className="sub" href={date ? `/tag/${date}` : "/"}>
          ← zurück zum Fernseher
        </Link>
      </header>
      <p className="contrib-intro">
        Du hast eine Aufnahme gefunden, eine alte Fernsehzeitschrift im Keller oder einen Fehler entdeckt? Schick uns
        einfach, was du hast – Link, abgetipptes Programm, Foto oder ein paar Sätze. Wir sortieren es und prüfen alles
        von Hand, bevor etwas erscheint.
      </p>
      <ContributionForm
        token={issueFormToken()}
        context={{
          tvDate: date,
          channel,
          channelName: STATIONS.find((s) => s.slug === channel)?.name,
          start: one("zeit"),
          title: one("titel"),
        }}
      />
      <SiteFooter />
    </div>
  );
}
