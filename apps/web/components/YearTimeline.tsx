"use client";

import { coverageHue, COVERAGE_FULL_GREEN, formatTvDayDate } from "@zdz/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "@/lib/use-dialog";

/**
 * The product covers German TV of 1990–2005 (ARCHITECTURE.md §1); the timeline ends with the last
 * year we have a programme for, so later years appear once there is data.
 */
const FIRST_YEAR = 1990;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface Props {
  /** Available TV days, "YYYY-MM-DD", ascending. */
  days: string[];
  current: string;
  /** Video coverage per date (0…1), shown as red → green. */
  coverage: Record<string, number>;
  /** The best-covered days (see core `bestDays`); the star button picks one of them. */
  bestDays: { date: string; score: number }[];
  /** Dates with only an assumed programme: shown dashed in the calendar, skipped by the dice. */
  assumedDates: string[];
}

const hue = (score: number | undefined) => ({ "--cov-h": coverageHue(score ?? 0) }) as React.CSSProperties;
const percent = (score: number | undefined) => `${Math.round((score ?? 0) * 100)} %`;

/**
 * Fixed time-machine bar: one cell per year with a month-density strip. Clicking a year
 * opens a calendar of that year in which every day with a programme can be picked.
 */
export function YearTimeline({ days, current, coverage, bestDays, assumedDates }: Props) {
  const assumed = useMemo(() => new Set(assumedDates), [assumedDates]);
  const router = useRouter();
  const [openYear, setOpenYear] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const available = useMemo(() => new Set(days), [days]);
  // Per month: number of days and their average video coverage.
  const perMonth = useMemo(() => {
    const m = new Map<string, { n: number; score: number }>();
    for (const d of days) {
      const e = m.get(d.slice(0, 7)) ?? { n: 0, score: 0 };
      m.set(d.slice(0, 7), { n: e.n + 1, score: e.score + (coverage[d] ?? 0) });
    }
    return m;
  }, [days, coverage]);
  const years = Array.from(
    { length: Math.max(FIRST_YEAR, ...days.map((d) => Number(d.slice(0, 4)))) - FIRST_YEAR + 1 },
    (_, i) => FIRST_YEAR + i,
  );
  const yearsWithDays = years.filter((y) => days.some((d) => d.startsWith(`${y}-`)));
  const index = days.indexOf(current);
  const prev = days[index - 1];
  const next = days[index + 1];

  // Modal calendar: Escape closes, focus stays inside and goes back to the year; it opens on the
  // current day (or the year's first day). A click outside or a new day closes it too.
  useDialog(panelRef, {
    open: openYear !== null,
    onClose: () => setOpenYear(null),
    initialFocus: () =>
      panelRef.current?.querySelector<HTMLElement>(".cal-day.cur") ?? panelRef.current?.querySelector<HTMLElement>("a.cal-day") ?? null,
  });
  useEffect(() => setOpenYear(null), [current]);
  useEffect(() => {
    if (openYear === null) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!panelRef.current?.contains(t) && !t.closest(".timeline-year")) setOpenYear(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointerdown", onDown);
    };
  }, [openYear]);

  const bestDay = () => {
    const others = bestDays.filter((d) => d.date !== current);
    if (others.length) router.push(`/tag/${others[Math.floor(Math.random() * others.length)]!.date}`);
  };
  const bestList = bestDays.map((d, i) => `${i + 1}. ${formatTvDayDate(d.date)} – ${percent(d.score)} mit Video`).join("\n");
  const randomDay = () => {
    const others = days.filter((d) => d !== current && !assumed.has(d));
    if (others.length) router.push(`/tag/${others[Math.floor(Math.random() * others.length)]}`);
  };
  const stepYear = (dir: -1 | 1) => {
    const i = yearsWithDays.indexOf(openYear!);
    const y = yearsWithDays[i + dir];
    if (y) setOpenYear(y);
  };

  return (
    <nav className="timeline" aria-label="Zeitreise: Tag wählen">
      {openYear !== null && (
        <div className="cal" ref={panelRef} role="dialog" aria-modal="true" aria-label={`Kalender ${openYear}`}>
          <header className="cal-head">
            <button className="btn" onClick={() => stepYear(-1)} disabled={yearsWithDays.indexOf(openYear) <= 0} aria-label="Voriges Jahr">
              ◀
            </button>
            <strong>{openYear}</strong>
            <span className="cal-count">{days.filter((d) => d.startsWith(`${openYear}-`)).length} Tage mit Programm</span>
            <span className="cal-legend" title="Anteil der Sendungen eines Tages mit Video (genaue Treffer zählen mehr).">
              Mit Video: <i className="cov-scale" /> 0 % … {Math.round(COVERAGE_FULL_GREEN * 100)} %+
            </span>
            <span className="cal-legend" title="Aus regelmäßigen Sendeplätzen anderer Tage hergeleitet">
              <i className="cal-day has assumed cal-legend-swatch">1</i> angenommen
            </span>
            <button
              className="btn"
              onClick={() => stepYear(1)}
              disabled={yearsWithDays.indexOf(openYear) >= yearsWithDays.length - 1}
              aria-label="Nächstes Jahr"
            >
              ▶
            </button>
            <button className="btn cal-close" onClick={() => setOpenYear(null)} aria-label="Kalender schließen">
              ×
            </button>
          </header>
          <div className="cal-months">
            {MONTHS.map((name, m) => (
              <Month
                key={name}
                year={openYear}
                month={m}
                name={name}
                available={available}
                current={current}
                coverage={coverage}
                assumed={assumed}
              />
            ))}
          </div>
        </div>
      )}
      <div className="timeline-inner">
        {prev ? (
          <Link className="timeline-step" href={`/tag/${prev}`} title={formatTvDayDate(prev)} aria-label="Früherer Tag">
            ◀
          </Link>
        ) : (
          <span className="timeline-step off" aria-hidden>
            ◀
          </span>
        )}
        <ol className="timeline-years">
          {years.map((y) => {
            const count = days.filter((d) => d.startsWith(`${y}-`)).length;
            return (
              <li key={y} className={`timeline-year${count ? " has" : ""}${current.startsWith(`${y}-`) ? " now" : ""}${openYear === y ? " open" : ""}`}>
                <button
                  className="timeline-pick"
                  disabled={!count}
                  onClick={() => setOpenYear(openYear === y ? null : y)}
                  aria-expanded={openYear === y}
                  title={count ? `${y}: ${count} Tage – Kalender öffnen` : `${y}: noch keine Tage`}
                >
                  <span className="timeline-label">
                    <span className="full">{y}</span>
                    <span className="short">’{String(y).slice(2)}</span>
                  </span>
                  <span className="timeline-track" aria-hidden>
                    {MONTHS.map((_, m) => {
                      const e = perMonth.get(`${y}-${String(m + 1).padStart(2, "0")}`);
                      const cur = current.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`);
                      return (
                        <span
                          key={m}
                          className={`timeline-month${cur ? " cur" : ""}`}
                          style={{ ...hue(e ? e.score / e.n : 0), opacity: e ? Math.min(1, 0.45 + e.n / 12) : 0 }}
                        />
                      );
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {next ? (
          <Link className="timeline-step" href={`/tag/${next}`} title={formatTvDayDate(next)} aria-label="Späterer Tag">
            ▶
          </Link>
        ) : (
          <span className="timeline-step off" aria-hidden>
            ▶
          </span>
        )}
        <button
          className="timeline-step timeline-random"
          onClick={bestDay}
          disabled={!bestDays.length}
          title={`Einer der besten Tage – der am besten mit Videos abgedeckte Tag je Jahr:\n${bestList}`}
          aria-label="Einer der besten Tage"
        >
          ⭐
        </button>
        <button className="timeline-step timeline-random" onClick={randomDay} title="Zufälliger Tag" aria-label="Zufälliger Tag">
          🎲
        </button>
      </div>
    </nav>
  );
}

function Month({
  year,
  month,
  name,
  available,
  current,
  coverage,
  assumed,
}: {
  year: number;
  month: number;
  name: string;
  available: Set<string>;
  current: string;
  coverage: Record<string, number>;
  assumed: Set<string>;
}) {
  const first = new Date(Date.UTC(year, month, 1));
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const any = Array.from({ length }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`).some((d) => available.has(d));
  return (
    <section className={`cal-month${any ? "" : " empty"}`}>
      <h3>{name}</h3>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-wd">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`x${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const d = `${prefix}-${String(i + 1).padStart(2, "0")}`;
          return available.has(d) ? (
            <Link
              key={d}
              href={`/tag/${d}`}
              className={`cal-day has${assumed.has(d) ? " assumed" : ""}${d === current ? " cur" : ""}`}
              style={hue(coverage[d])}
              title={`${formatTvDayDate(d)} · ${assumed.has(d) ? "Programm angenommen · " : ""}${percent(coverage[d])} mit Video`}
              aria-current={d === current ? "date" : undefined}
            >
              {i + 1}
            </Link>
          ) : (
            <span key={d} className="cal-day">
              {i + 1}
            </span>
          );
        })}
      </div>
    </section>
  );
}
