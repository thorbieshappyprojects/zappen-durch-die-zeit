import type { Metadata } from "next";
import Link from "next/link";
import { KeyTable } from "@/components/HelpOverlay";
import { ConsentRevoke } from "@/components/ConsentRevoke";
import { SiteFooter } from "@/components/LegalLinks";
import { getAssumedDates, getTvDayDates } from "@/lib/db";
import { owner, sourceUrl } from "@/lib/owner";
import { matchLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Info – Zappen durch die Zeit" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tag?: string }> };

export default async function InfoPage({ searchParams }: Props) {
  const { tag } = await searchParams;
  const date = tag && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? tag : undefined;
  // How many days have a real listing and how many an assumed one (from the database, stays current).
  const [allDays, assumedDays] = await Promise.all([getTvDayDates(), getAssumedDates()]);
  const realCount = allDays.length - assumedDays.length;
  const num = (n: number) => n.toLocaleString("de-DE");
  const back = date ? `/tag/${date}` : "/";
  const { email } = owner();
  return (
    <div className="wrap contrib info">
      <header className="page-header">
        <h1>Info &amp; Quellen</h1>
        <Link className="sub" href={back}>
          ← zurück zum Fernseher
        </Link>
      </header>

      <section>
        <h2>So funktioniert&apos;s</h2>
        <p>
          Der Fernseher zeigt, was an einem Tag zwischen 1990 und 1999 zur gleichen Uhrzeit wie jetzt lief – wie
          lineares Fernsehen. Videos starten an der Stelle, an der die Sendung gerade wäre. Gibt es zu einer Sendung kein
          Video, zeigt der Fernseher die Programmankündigung – und du kannst eine Aufnahme vorschlagen. Mit „Programm frei wählen“ (rechts unter dem Programm)
          kannst du jede Sendung des Tages anklicken; „Wie damals“ schaltet zurück. „Lückenlos“ stellt aus den Aufnahmen, die
          wir zu einem Sender haben, ein durchgehendes Programm zusammen – Sendungen aus den Monaten und Jahren um den Tag, dazu
          Werbung und Ansagen. Dann läuft auf jedem Sender immer etwas, aber eben nicht das echte Programm des Tages; im
          Programm steht bei jeder Sendung, von welchem Tag die Aufnahme stammt. Unter „Themen“ gibt es dasselbe für eine Sorte
          Programm aus dem ganzen Jahrzehnt: „Kinderprogramm“ (Zeichentrick und Kindersendungen) und „Talk Shows“
          (Nachmittags-Talkshows und Gerichtsshows im Wechsel). Die „Chronik“ zeigt Ereignisse der 90er so, wie das
          Fernsehen darüber berichtete: Jeder Sender bringt seine Nachrichten, Sondersendungen und Talkshows aus den Tagen
          um das Ereignis. Die Auswahl geschieht automatisch nach Sendetag und Sendung – passt ein Video nicht, hilft
          „✗ Passt nicht zum Ereignis“ unter dem Bild.
        </p>
        <KeyTable />
        <p>Am Handy: auf dem Bild nach links/rechts wischen zum Umschalten.</p>
      </section>

      <section>
        <h2>Zeichen im Programm</h2>
        <p className="info-badges">
          <span className="badge b-exact">{matchLabel("exact")}</span>
          <span className="badge b-same_show_period">{matchLabel("same_show_period")}</span>
          <span className="badge b-same_show">{matchLabel("same_show")}</span>
          <span className="badge b-none">{matchLabel("none")}</span>
        </p>
        <p>🟢 genau diese Sendung · 🟡 dieselbe Sendung aus demselben Jahr · 🔵 ähnliches Video (andere Folge, oder dieselbe Sendung von einem anderen Sender, mit anderem Kommentar oder in anderer Sprache) · ❌ kein Video gefunden (es gibt einen Link
          zur YouTube-Suche und „Video vorschlagen“, um die Sammlung zu vervollständigen)</p>
        <p>
          Läuft dieselbe Sendung auf zwei Sendern, ist das meist kein Fehler: ARD und ZDF zeigten vormittags (bis 13:45 Uhr) ein
          gemeinsames Programm, und auch die Dritten übernahmen oft Sendungen des Ersten.
        </p>
      </section>

      <section>
        <h2>Programmdaten</h2>
        <p>
          Ein <strong>echtes Programm</strong> haben wir für {num(realCount)} von {num(allDays.length)} Tagen. Fast alle davon
          stammen von <strong>tvprogramme.net</strong>: Dort haben Freiwillige über viele Jahre alte Programmzeitschriften
          abgetippt; wir haben Inhalte dieser Website übernommen und für den Fernseher aufbereitet. Danke an alle, die dort
          mitgeschrieben haben. Einzelne Tage haben wir selbst aus öffentlichen Quellen rekonstruiert. Wo ein Tag nicht alle
          Sender oder Uhrzeiten enthält, steht im Kopf „Programm lückenhaft“.
        </p>
        <p>
          Für die übrigen {num(assumedDays.length)} Tage – die meisten – gibt es nur ein <strong>angenommenes Programm</strong>:
          Sendungen, die regelmäßig zur selben Zeit liefen – etwa „Marienhof“ werktags um 18:25 Uhr im Ersten oder „Hans
          Meiser“ um 16:00 Uhr bei RTL –, setzen wir für die Tage zwischen zwei Belegen ein, außer an Feiertagen. Die festen
          Sendeplätze stammen aus den echten Tagen und aus eigener Recherche; dazu kommen Sendungen, von denen es eine datierte
          Aufnahme gibt. Mehr kennen wir an solchen Tagen nicht; im Kalender sind sie gestrichelt, im Kopf steht „Programm
          angenommen“.
        </p>
      </section>

      <section id="videos">
        <h2>Videos &amp; Datenschutz</h2>
        <p>
          Wir hosten keine Videos, sondern verlinken bzw. betten vorhandene Kopien ein: YouTube im erweiterten
          Datenschutzmodus, Dailymotion, Internet Archive, Vimeo; Mediatheken als Link. Bei Sendungen ohne Fund führt ein
          Link zur YouTube-Suche. Videos werden erst nach deiner Zustimmung geladen. YouTube-Videos laufen in jedem Modus mit
          YouTubes eigenem Player und seinen Bedienelementen; hast du pausiert oder gespult, bringt dich „Zurück zu jetzt“ neben
          dem Bild wieder an die Stelle, an der die Sendung gerade wäre.
        </p>
        <p>
          Du hast Rechte an einer verlinkten Aufnahme und möchtest sie hier nicht sehen? Schreib uns an{" "}
          {email ? <a href={`mailto:${email}`}>{email}</a> : <Link href="/impressum">die Adresse im Impressum</Link>} oder über das{" "}
          <Link href="/mitmachen">Mitmachen-Formular</Link> (mit Datum, Sender und Uhrzeit) – wir entfernen den Link umgehend.
        </p>
        <p>
          <ConsentRevoke />
        </p>
      </section>

      <section>
        <h2>Mitmachen</h2>
        <p>
          Du kennst eine Aufnahme, hast eine alte Programmzeitschrift oder einen Fehler entdeckt?{" "}
          <Link href={`/mitmachen${date ? `?tag=${date}` : ""}`}>Videos, Programme oder Hinweise einreichen</Link>.
        </p>
      </section>
      <section>
        <h2>Über das Projekt</h2>
        <p>Ein privates, nicht-kommerzielles Projekt: keine Werbung, keine Analyse-Dienste, keine Spendenaufrufe.</p>
        <p>
          zadudize = <strong>Za</strong>ppen <strong>du</strong>rch <strong>di</strong>e <strong>Ze</strong>it.
        </p>
        <p>
          <a href={sourceUrl()}>Quellcode</a> (GNU Affero General Public License 3.0).
        </p>
      </section>
      <SiteFooter />
    </div>
  );
}
