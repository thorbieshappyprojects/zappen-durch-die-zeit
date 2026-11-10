import { RETENTION_DAYS } from "@zdz/core";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/LegalLinks";
import { owner } from "@/lib/owner";

export const metadata: Metadata = { title: "Datenschutz – Zappen durch die Zeit" };
export const dynamic = "force-dynamic";

function Missing({ what }: { what: string }) {
  return <mark className="legal-missing">[{what} fehlt noch]</mark>;
}

/** Describes what the code actually does (keep in sync: storage keys, retention, providers). */
export default function DatenschutzPage() {
  const o = owner();
  const contact = o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <Missing what="E-Mail-Adresse" />;
  return (
    <div className="wrap contrib info">
      <header className="page-header">
        <h1>Datenschutzerklärung</h1>
        <Link className="sub" href="/">
          ← zurück zum Fernseher
        </Link>
      </header>
      {!o.complete && (
        <p className="admin-flag" role="note">
          Platzhalter: Die Angaben zum Betreiber sind noch nicht eingetragen (OWNER_NAME, OWNER_ADDRESS, OWNER_EMAIL).
        </p>
      )}

      <section>
        <h2>Verantwortlich</h2>
        <p>
          {o.name ?? <Missing what="Name" />}, {o.address ?? <Missing what="Anschrift" />}, E-Mail: {contact}
        </p>
      </section>

      <section>
        <h2>Kurz gesagt</h2>
        <p>
          Kein Tracking, keine Werbung, keine Analyse-Dienste. Das einzige Cookie ist die Anmeldung der Moderation. Videos von anderen
          Anbietern werden erst geladen, wenn du zustimmst.
        </p>
      </section>

      <section>
        <h2>Aufruf der Website (Server-Logs)</h2>
        <p>
          Beim Aufruf jeder Seite verarbeitet der Server technisch notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse,
          Browserkennung. Das dient dem Betrieb und der Sicherheit (Art. 6 Abs. 1 lit. f DSGVO). Die Anwendung selbst speichert keine
          IP-Adressen; für Missbrauchsschutz bildet sie einen täglich wechselnden Prüfwert (Hash aus Adresse, Datum und einem Geheimnis),
          der sich nicht auf die Adresse zurückrechnen lässt.
        </p>
        <p>
          Hosting: Die Website läuft auf einem Server der netcup GmbH, Karlsruhe, die als Auftragsverarbeiter in unserem Auftrag
          handelt (Art. 28 DSGVO); der Server steht in Deutschland. Die Server-Logs mit IP-Adressen bewahren wir höchstens 14 Tage auf und
          löschen sie danach.
        </p>
      </section>

      <section>
        <h2>Eingebettete Videos</h2>
        <p>
          Videos laufen über YouTube (erweiterter Datenschutzmodus, youtube-nocookie.com), Dailymotion, das Internet Archive (archive.org)
          oder Vimeo. Sie werden erst nach deiner Zustimmung beim Einschalten geladen (Art. 6 Abs. 1 lit. a DSGVO); dann überträgt dein
          Browser Daten wie IP-Adresse und Geräteinformationen an den jeweiligen Anbieter, der dafür selbst verantwortlich ist. Deine
          Entscheidung wird nur in diesem Browser gespeichert (localStorage) und lässt sich auf der{" "}
          <Link href="/info#videos">Info-Seite</Link> widerrufen. Ohne Zustimmung zeigt der Fernseher Programmankündigungen und Links.
        </p>
        <p>
          Empfänger bei YouTube-Videos ist die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland (Mutterkonzern
          Google LLC, USA; eine Übermittlung in die USA ist möglich). Es gelten die{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">Nutzungsbedingungen von YouTube</a> und
          die <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Datenschutzerklärung von Google</a>.
        </p>
      </section>

      <section>
        <h2>Speicher im Browser</h2>
        <p>
          Der Fernseher merkt sich in deinem Browser (localStorage bzw. sessionStorage), nicht bei uns: die Video-Zustimmung, den zuletzt
          gesehenen Sender, das gewählte Programm (Fernsehen, Kinderprogramm, Talk Shows) und den Modus, ob der Fernseher eingeschaltet war,
          ob der Wisch-Hinweis schon gezeigt wurde, und welche Videos heute schon automatisch als defekt gemeldet wurden. Das lässt sich in
          den Browser-Einstellungen jederzeit löschen.
        </p>
      </section>

      <section>
        <h2>Mitmachen-Formular</h2>
        <p>
          Wenn du etwas einreichst, speichern wir deinen Text, optional Name und E-Mail-Adresse, angehängte Dateien, das Datum und den
          täglich wechselnden Prüfwert (gegen Spam und für das Tageslimit) – zur Prüfung und, bei Programmdaten und Links, zur
          Veröffentlichung (Art. 6 Abs. 1 lit. a DSGVO, Einwilligung im Formular). Deinen Namen veröffentlichen wir nur, wenn du ihn angibst;
          Dateien sieht nur die Moderation.
        </p>
        <p>
          Speicherdauer: Beiträge, die der Spam-Filter aussortiert, löschen wir nach {RETENTION_DAYS.spam} Tagen, abgelehnte Beiträge samt
          Dateien nach {RETENTION_DAYS.rejected} Tagen. Die E-Mail-Adresse löschen wir {RETENTION_DAYS.email} Tage nach der Prüfung.
          Freigegebene Programmdaten und Links bleiben Teil der Sammlung. Löschen auf Wunsch jederzeit: {contact}.
        </p>
      </section>

      <section>
        <h2>„Video defekt melden“</h2>
        <p>
          Eine Meldung enthält das Video, den Grund, optional einen Hinweis, die Sendung (Tag, Sender, Uhrzeit) und den täglich
          wechselnden Prüfwert. Der Fernseher meldet ein Video auch selbst, wenn es nicht abspielt. Bearbeitete Meldungen löschen wir nach{" "}
          {RETENTION_DAYS.reports} Tagen.
        </p>
      </section>

      <section>
        <h2>Moderation</h2>
        <p>
          Für die Anmeldung der Moderation setzt die Seite ein Sitzungs-Cookie (nur unter /admin, höchstens 8 Stunden). Fehlversuche werden
          mit dem täglichen Prüfwert für 15 Minuten gespeichert, um Passwort-Rateversuche zu bremsen.
        </p>
      </section>

      <section>
        <h2>Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch
          (Art. 15–21 DSGVO) sowie das Recht, eine Einwilligung jederzeit zu widerrufen. Außerdem kannst du dich bei einer
          Datenschutz-Aufsichtsbehörde beschweren. Kontakt: {contact}.
        </p>
      </section>
      <SiteFooter />
    </div>
  );
}
