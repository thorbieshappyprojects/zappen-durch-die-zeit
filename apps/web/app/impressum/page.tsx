import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/LegalLinks";
import { owner, sourceUrl } from "@/lib/owner";

export const metadata: Metadata = { title: "Impressum – Zappen durch die Zeit" };
export const dynamic = "force-dynamic";

/** Placeholder until the owner details are set (production logs a warning, instrumentation.ts). */
function Missing({ what }: { what: string }) {
  return <mark className="legal-missing">[{what} fehlt noch]</mark>;
}

export default function ImpressumPage() {
  const o = owner();
  return (
    <div className="wrap contrib info">
      <header className="page-header">
        <h1>Impressum</h1>
        <Link className="sub" href="/">
          ← zurück zum Fernseher
        </Link>
      </header>
      {!o.complete && (
        <p className="admin-flag" role="note">
          Platzhalter: Die Angaben zum Betreiber sind noch nicht eingetragen (OWNER_NAME, OWNER_ADDRESS, OWNER_EMAIL).
        </p>
      )}
      <p>Zappen durch die Zeit ist ein privates, nicht-kommerzielles Projekt.</p>
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p className="legal-address">
          {o.name ?? <Missing what="Name" />}
          <br />
          {o.address ? o.address.split(/\s*[,\n]\s*/).map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          )) : <Missing what="Anschrift" />}
        </p>
        <p>E-Mail: {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <Missing what="E-Mail-Adresse" />}</p>
      </section>
      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>{o.name ?? <Missing what="Name" />}, Anschrift wie oben.</p>
      </section>
      <section>
        <h2>Videos und Rechte</h2>
        <p>
          Wir laden keine Videos herunter und hosten keine – es werden nur vorhandene Veröffentlichungen verlinkt oder eingebettet. Wer
          Rechte an einer Aufnahme hat und sie hier nicht sehen möchte, schreibt bitte an{" "}
          {o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <Missing what="E-Mail-Adresse" />} (mit Datum, Sender und Uhrzeit oder
          dem Link) – wir entfernen den Link umgehend.
        </p>
      </section>
      <section>
        <h2>Quellcode</h2>
        <p>
          Der Quellcode dieser Website ist frei unter der GNU Affero General Public License 3.0:{" "}
          <a href={sourceUrl()}>{sourceUrl().replace(/^https?:\/\//, "")}</a>.
        </p>
      </section>
      <section>
        <h2>Programmdaten</h2>
        <p>
          Die Programmdaten stammen überwiegend von tvprogramme.net (retro-media-tv.de/tvp); Einzelheiten auf der{" "}
          <Link href="/info">Info-Seite</Link>.
        </p>
      </section>
      <SiteFooter />
    </div>
  );
}
