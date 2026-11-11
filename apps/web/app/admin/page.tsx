import { coverageScore, formatTvDayDate, STATIONS, stationRecommendations, tvDayDateOf } from "@zdz/core";
import { getSiteSettings, listHiddenStations, listSnapshots } from "@zdz/db";
import type { Metadata } from "next";
import Link from "next/link";
import { db, getDashboardFigures } from "@/lib/db";
import { AdminForm } from "@/components/AdminForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { setSwitch, toggleStation } from "./actions";
import { AdminGate } from "./AdminGate";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Admin – Zappen durch die Zeit", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ jahr?: string; angenommen?: string }> };

export default async function AdminHome(props: Props) {
  return (
    <AdminGate title="Admin" next="/admin">
      <Dashboard {...props} />
    </AdminGate>
  );
}

// Sequential single-hue ramp (blue, dataviz reference palette) for coverage on the dark surface:
// near zero recedes into the background (dark), high coverage stands out (light).
const RAMP = ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6"];
/** Coverage at which a cell reaches the lightest step (exact 10 / same year 3 / similar 1 of 10: all same-year = 0.3). */
const FULL = 0.25;
const rampColor = (score: number) => RAMP[Math.min(RAMP.length - 1, Math.round((Math.min(score, FULL) / FULL) * (RAMP.length - 1)))]!;
const pct = (x: number) => (x > 0 && x < 0.01 ? "< 1 %" : `${Math.round(x * 100)} %`);
const num = (n: number) => n.toLocaleString("de-DE");

async function Dashboard({ searchParams }: Props) {
  const handle = (await db()).db;
  const today = tvDayDateOf(new Date());
  // Key figures and coverage are cached (lib/db): they take seconds to compute over all days.
  const figures = getDashboardFigures();
  const [{ stats, videoCounts }, cells, snapshots, hidden, settings] = await Promise.all([
    figures.data,
    figures.channels,
    listSnapshots(handle),
    listHiddenStations(handle),
    getSiteSettings(handle),
  ]);
  const { jahr, angenommen } = await searchParams;
  const withAssumed = angenommen === "1";

  // Per station: real days, broadcasts, coverage.
  const perStation = STATIONS.map((st) => {
    const rows = cells.filter((c) => c.channel === st.slug && !c.assumed);
    const broadcasts = rows.reduce((s, r) => s + r.broadcasts, 0);
    const points = rows.reduce((s, r) => s + r.points, 0);
    const counts = videoCounts.find((v) => v.slug === st.slug);
    return {
      ...st,
      days: rows.length,
      broadcasts,
      score: coverageScore(points, broadcasts),
      hidden: hidden.includes(st.slug),
      videos: counts?.videos ?? 0,
      shows: counts?.shows ?? 0,
    };
  });
  const recommendations = stationRecommendations(perStation);

  const years = [...new Set(cells.map((c) => c.date.slice(0, 4)))].sort();
  const year = years.includes(jahr ?? "") ? jahr! : (years.find((y) => y === "1991") ?? years[0] ?? "");
  const yearCells = cells.filter((c) => c.date.startsWith(year) && (withAssumed || !c.assumed));
  const dates = [...new Set(yearCells.map((c) => c.date))].sort();
  const cellOf = new Map(yearCells.map((c) => [`${c.date}|${c.channel}`, c]));
  const stationCols = STATIONS.filter((st) => yearCells.some((c) => c.channel === st.slug));

  const share = stats.broadcastsReal ? stats.broadcastsWithVideo / stats.broadcastsReal : 0;
  const exactShare = stats.broadcastsReal ? stats.broadcastsExact / stats.broadcastsReal : 0;

  return (
    <div className="wrap contrib admin dash">
      <header className="page-header">
        <h1>Admin</h1>
        <AdminNav current="/admin" />
      </header>

      <section aria-label="Stand heute">
        <h2>Stand {formatTvDayDate(today)}</h2>
        <div className="stat-tiles">
          <Tile label="Tage mit Programm" value={num(stats.daysReal)} sub={`+ ${num(stats.daysAssumed)} angenommen`} />
          <Tile label="Sendungen (echte Tage)" value={num(stats.broadcastsReal)} />
          <Tile label="davon mit Video" value={pct(share)} sub={`${num(stats.broadcastsWithVideo)} Sendungen`} />
          <Tile label="genau diese Sendung" value={pct(exactShare)} sub={`${num(stats.broadcastsExact)} Sendungen`} />
          <Tile
            label="Sendungen (angenommene Tage)"
            value={num(stats.broadcastsAssumed)}
            sub={`${pct(stats.broadcastsAssumed ? stats.broadcastsAssumedWithVideo / stats.broadcastsAssumed : 0)} mit Video · ${num(stats.broadcastsAssumedExact)} genau`}
          />
          <Tile label="verlinkte Videos" value={num(stats.videos)} sub={`${num(stats.blockedVideos)} gesperrt`} />
          <Tile label="Zwischenspiele" value={num(stats.interstitials)} />
        </div>
      </section>

      <section aria-label="Entwicklung">
        <h2>Entwicklung</h2>
        <p className="admin-flag">
          Ein Messpunkt pro Tag (gespeichert beim Öffnen dieser Seite und nach Importen). {snapshots.length < 2 && "Die Reihe beginnt heute."}
        </p>
        <div className="trend-grid">
          <Trend title="Tage mit Programm" points={snapshots.map((s) => [s.day, s.data.daysReal])} format={num} />
          <Trend title="Sendungen mit Video" points={snapshots.map((s) => [s.day, s.data.broadcastsWithVideo])} format={num} />
          {/* Measured since 11 Nov 2026: older snapshots don't have it. */}
          <Trend
            title="… auf angenommenen Tagen"
            points={snapshots.filter((s) => s.data.broadcastsAssumedWithVideo !== undefined).map((s) => [s.day, s.data.broadcastsAssumedWithVideo])}
            format={num}
          />
          <Trend
            title="Anteil mit Video"
            points={snapshots.map((s) => [s.day, s.data.broadcastsReal ? s.data.broadcastsWithVideo / s.data.broadcastsReal : 0])}
            format={pct}
          />
          <Trend title="Verlinkte Videos" points={snapshots.map((s) => [s.day, s.data.videos])} format={num} />
        </div>
      </section>

      <section aria-label="Fernseher">
        <h2>Fernseher</h2>
        <p className="admin-flag">Gilt für alle Besucher; der Fernseher selbst hat dafür keine Schalter mehr.</p>
        <div className="admin-switches">
          {(
            [
              ["crtFilter", "Röhrenfilter", "Zeilen und Vignette über dem Bild (nicht bei Archiv-Dateien bis 480 Zeilen)"],
              ["sounds", "Geräusche", "Rauschen beim Umschalten, Einschaltgeräusch"],
            ] as const
          ).map(([key, label, hint]) => (
            <AdminForm key={key} action={setSwitch} className="admin-switch">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="on" value={settings[key] ? "0" : "1"} />
              <span>
                <strong>{label}:</strong> {settings[key] ? "an" : "aus"} <small>({hint})</small>
              </span>
              <button className={settings[key] ? "btn" : "play"}>{settings[key] ? "Ausschalten" : "Einschalten"}</button>
            </AdminForm>
          ))}
        </div>
      </section>

      {recommendations.length > 0 && (
        <section aria-label="Empfehlungen">
          <h2>Empfehlungen</h2>
          <p className="admin-flag">
            Ausgeblendete Sender, sobald sie genug Material haben: Einblenden lohnt sich, wenn alle drei Punkte erfüllt sind (Videos und
            Sendungen über alle Tage, Abdeckung nur echte Tage).
          </p>
          <ul className="admin-recs">
            {recommendations.map((r) => (
              <li key={r.slug} className={r.ready ? "ready" : ""}>
                <strong>{r.name}</strong>{" "}
                {r.ready ? "– genug Material: Einblenden empfohlen." : "– noch ausgeblendet lassen."}
                <span className="rec-checks">
                  {r.checks.map((c) => (
                    <span key={c.label} className={c.met ? "met" : "unmet"}>
                      {c.met ? "✓" : "✗"} {c.label}: {c.value}
                    </span>
                  ))}
                </span>
                {r.ready && (
                  <AdminForm action={toggleStation}>
                    <input type="hidden" name="slug" value={r.slug} />
                    <input type="hidden" name="hidden" value="0" />
                    <button className="play">Einblenden</button>
                  </AdminForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Sender">
        <h2>Sender</h2>
        <p className="admin-flag">
          Abdeckung = Punkte je Sendung (genau 10, gleiches Jahr 3, ähnlich 1) im Verhältnis zum Höchstwert, nur echte Tage. Ausgeblendete
          Sender verschwinden aus der Senderliste, aus der Übersicht P300 und beim Umschalten (per Link bleiben sie erreichbar).
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Platz</th>
              <th>Sender</th>
              <th>Tage</th>
              <th>Sendungen</th>
              <th>Videos</th>
              <th>Abdeckung</th>
              <th>Im Menü</th>
            </tr>
          </thead>
          <tbody>
            {perStation.map((s) => (
              <tr key={s.slug} className={s.hidden ? "row-hidden" : ""}>
                <td>{s.slot}</td>
                <td>{s.name}</td>
                <td>{num(s.days)}</td>
                <td>{num(s.broadcasts)}</td>
                <td title={`${num(s.shows)} verschiedene Sendungen`}>{num(s.videos)}</td>
                <td>
                  <span className="cov-bar" aria-hidden>
                    <span style={{ width: `${Math.min(100, (s.score / FULL) * 100)}%`, background: rampColor(s.score) }} />
                  </span>{" "}
                  {s.broadcasts ? pct(s.score) : "–"}
                </td>
                <td>
                  <AdminForm action={toggleStation}>
                    <input type="hidden" name="slug" value={s.slug} />
                    <input type="hidden" name="hidden" value={s.hidden ? "0" : "1"} />
                    {s.hidden ? <button className="play">Einblenden</button> : <ConfirmButton>Ausblenden</ConfirmButton>}
                  </AdminForm>
                  {s.hidden && <small> ausgeblendet</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="Tage und Sender">
        <h2>Tage × Sender {year}</h2>
        <nav className="contrib-tabs year-tabs">
          {years.map((y) => (
            <Link key={y} className={`btn${y === year ? " on" : ""}`} href={`/admin?jahr=${y}${withAssumed ? "&angenommen=1" : ""}`}>
              {y}
            </Link>
          ))}
          <Link className="btn" href={`/admin?jahr=${year}${withAssumed ? "" : "&angenommen=1"}`}>
            {withAssumed ? "Nur echte Tage" : "Mit angenommenen Tagen"}
          </Link>
        </nav>
        <p className="matrix-legend">
          Abdeckung: <i className="ramp" style={{ background: `linear-gradient(90deg, ${RAMP[0]}, ${RAMP[RAMP.length - 1]})` }} /> 0 % … {Math.round(FULL * 100)} %+ ·{" "}
          <i className="swatch none" /> kein Programm{withAssumed && " · gestrichelt = angenommen"}. Klick öffnet den Tag im Fernseher.
        </p>
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Tag</th>
                {stationCols.map((st) => (
                  <th key={st.slug} title={st.name}>
                    {st.slot}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}>
                  <th>
                    <Link href={`/tag/${d}`}>{d.slice(8, 10)}.{d.slice(5, 7)}.</Link>
                  </th>
                  {stationCols.map((st) => {
                    const c = cellOf.get(`${d}|${st.slug}`);
                    if (!c) return <td key={st.slug} className="none" title={`${st.name}, ${d}: kein Programm`} />;
                    const score = coverageScore(c.points, c.broadcasts);
                    return (
                      <td key={st.slug} className={c.assumed ? "assumed" : ""}>
                        <Link
                          href={`/tag/${d}?sender=${st.slug}`}
                          style={{ background: rampColor(score) }}
                          title={`${st.name}, ${formatTvDayDate(d)}: ${pct(score)} (${c.broadcasts} Sendungen${c.assumed ? ", angenommen" : ""})`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** One small line chart per figure (small multiples: one axis each, no dual axes). */
function Trend({ title, points, format }: { title: string; points: [string, number][]; format: (n: number) => string }) {
  const W = 300;
  const H = 90;
  const pad = 8;
  const values = points.map((p) => p[1]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 1e-9);
  const x = (i: number) => (points.length < 2 ? W / 2 : pad + (i * (W - 2 * pad)) / (points.length - 1));
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  const last = points[points.length - 1];
  return (
    <figure className="trend">
      <figcaption>
        {title}
        <strong>{last ? format(last[1]) : "–"}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map(([d, v]) => `${d} ${format(v)}`).join(", ")}`}>
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="trend-axis" />
        {points.length > 1 && (
          <polyline fill="none" className="trend-line" points={points.map(([, v], i) => `${x(i)},${y(v)}`).join(" ")} />
        )}
        {points.map(([d, v], i) => (
          <g key={d}>
            <circle cx={x(i)} cy={y(v)} r={4} className="trend-dot" />
            {/* Larger invisible hit target with the exact value as tooltip. */}
            <circle cx={x(i)} cy={y(v)} r={12} fill="transparent">
              <title>{`${d.split("-").reverse().join(".")}: ${format(v)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </figure>
  );
}
