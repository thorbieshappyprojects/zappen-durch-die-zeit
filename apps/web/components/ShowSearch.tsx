"use client";

import { SHOW_SEARCH_MIN_CHARS, shareUrl, showPath, stationBySlug, type ShowHit } from "@zdz/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/** Wait this long after the last key before asking the server. */
const DEBOUNCE_MS = 250;

const years = (h: ShowHit) =>
  h.firstDate.slice(0, 4) === h.lastDate.slice(0, 4) ? h.firstDate.slice(0, 4) : `${h.firstDate.slice(0, 4)}–${h.lastDate.slice(0, 4)}`;
const stations = (h: ShowHit) => h.channels.map((c) => stationBySlug(c)?.name ?? c).join(", ");

/**
 * "Sendung suchen" above the guide: shows by title (core shows.ts, route /suche). Choosing a show
 * opens the day it aired, on its station at its start time (the airing with the best video);
 * "Alle Termine" opens the show's page.
 */
export function ShowSearch({ date }: { date: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ShowHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    // Too short: the list is hidden (showList), the last hits wait for the next query.
    if (q.length < SHOW_SEARCH_MIN_CHARS) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/suche?${new URLSearchParams({ q, tag: date })}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { hits: ShowHit[] }) => {
          setHits(d.hits);
          setActive(0);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") {
            setHits([]);
            setLoading(false);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, date]);

  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (h: ShowHit) => {
    setOpen(false);
    setQuery("");
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(shareUrl(h.open.date, { channelId: h.open.channelId, tvDayMin: h.open.startMin }));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open && query) setOpen(false);
      else (e.target as HTMLInputElement).blur();
      return;
    }
    if (!hits?.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (e.key === "Enter" && open && hits[active]) {
      e.preventDefault();
      choose(hits[active]!);
    }
  };

  const showList = open && query.trim().length >= SHOW_SEARCH_MIN_CHARS && hits !== null;
  return (
    <div className="tt-search" ref={boxRef}>
      <label className="visually-hidden" htmlFor={`${listId}-input`}>
        Sendung suchen
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits?.[active] ? `${listId}-${active}` : undefined}
        placeholder="🔍 Sendung suchen …"
        autoComplete="off"
        spellCheck={false}
        maxLength={60}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="tt-search-list" id={listId} role="listbox" aria-label="Gefundene Sendungen" aria-busy={loading}>
          {hits.length === 0 && !loading && <li className="tt-search-empty">Keine Sendung gefunden.</li>}
          {hits.map((h, i) => (
            <li
              key={h.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : ""}
              onPointerEnter={() => setActive(i)}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => choose(h)}
                title={`Einschalten: ${stationBySlug(h.open.channelId)?.name ?? h.open.channelId}, ${h.open.date.split("-").reverse().join(".")}`}
              >
                <span className="ts-title">{h.title}</span>
                <span className="ts-meta">
                  {h.airings}× · {h.withVideo ? `${h.withVideo} mit Video` : "ohne Video"} · {years(h)} · {stations(h)}
                </span>
              </button>
              <Link
                className="ts-all"
                href={`${showPath(h.key)}?tag=${date}`}
                onClick={() => setOpen(false)}
                title={`Alle Termine von „${h.title}“`}
              >
                Termine ▸
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
