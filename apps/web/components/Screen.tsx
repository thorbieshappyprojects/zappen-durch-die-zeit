"use client";

import { formatClock, PROVIDER_LABELS, type Broadcast, type MediaCandidate, type Segment } from "@zdz/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { matchLabel, watchLabel } from "@/lib/labels";

export function TestCard({
  channelName,
  upcoming,
  unknown,
}: {
  channelName: string;
  upcoming: Broadcast | null;
  /** Assumed day: we only know the regular slots, so a gap is "unknown", not a broadcast break. */
  unknown?: boolean;
}) {
  return (
    <div className="testbild" role="img" aria-label={`${channelName}: ${unknown ? "Programm unbekannt" : "Sendepause"}`}>
      <div className="bars">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="lbl">
        {channelName}
        <br />
        {unknown ? "PROGRAMM UNBEKANNT" : "SENDEPAUSE"}
        {upcoming && (
          <small>
            {unknown ? "Nächste bekannte Sendung" : "Programmbeginn"} {formatClock(upcoming.startMin)} Uhr
          </small>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  broadcast: Broadcast;
  next: Broadcast | null;
  progress: number;
  media: MediaCandidate | null;
  searchUrl: string;
  year: string;
  /** Minutes since the programme started, for link-outs that cannot be seeked. */
  minutesIn: number;
  /** Prefilled community form for this broadcast. */
  suggestUrl?: string | null;
  /** Other channels currently playing an embedded video (shown when this slot has none). */
  videoElsewhere?: { displayNumber: number; name: string; title: string }[];
  onTune?: (displayNumber: number) => void;
  /** Hide the media actions, e.g. while the consent overlay offers them instead. */
  hideActions?: boolean;
}

/** Programme info screen: title, times, progress, and the best available link. */
export function ProgrammeCard({
  broadcast,
  next,
  progress,
  media,
  searchUrl,
  minutesIn,
  suggestUrl,
  videoElsewhere,
  onTune,
  hideActions,
}: CardProps) {
  const level = media?.matchLevel ?? "none";
  return (
    <div className="card">
      <div className="now-label">JETZT</div>
      <div className="card-title">{broadcast.title}</div>
      <div className="times">
        {formatClock(broadcast.startMin)} – {formatClock(broadcast.endMin)} Uhr
      </div>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      {broadcast.description && <div className="card-desc">{broadcast.description}</div>}
      {!hideActions && (
        <div className="actions">
          <span className={`badge b-${level}`}>{matchLabel(level)}</span>
          {media ? (
            <a className="play" href={media.url} target="_blank" rel="noopener noreferrer">
              ▶ {watchLabel(PROVIDER_LABELS[media.provider])}
            </a>
          ) : (
            <a className="play ghost" href={searchUrl} target="_blank" rel="noopener noreferrer">
              🔎 Auf YouTube suchen
            </a>
          )}
          {media?.alt && (
            <a className="play ghost" href={media.alt.url} target="_blank" rel="noopener noreferrer">
              {media.alt.label}
            </a>
          )}
          {suggestUrl && (
            <a className="play ghost" href={suggestUrl}>
              ＋ Video vorschlagen
            </a>
          )}
          <div className="note">
            {media
              ? media.note
              : "Zu dieser Sendung haben wir noch kein Video. Kennst du eine Aufnahme? Schlag sie vor und hilf, die Sammlung zu vervollständigen."}
            {media && !media.embeddable && minutesIn > 0 && (
              <> · Die Sendung läuft seit {minutesIn} Min. – dort ab Minute {minutesIn} vorspulen.</>
            )}
          </div>
        </div>
      )}
      {!hideActions && !media?.embeddable && videoElsewhere && videoElsewhere.length > 0 && (
        <div className="elsewhere">
          <span>Gerade mit Video:</span>
          {videoElsewhere.map((v) => (
            <button key={v.displayNumber} className="btn" onClick={() => onTune?.(v.displayNumber)} title={v.title}>
              {v.displayNumber} {v.name}
            </button>
          ))}
        </div>
      )}
      <div className="next">
        {next ? (
          <>
            Danach <b>{formatClock(next.startMin)}</b> {next.title}
          </>
        ) : (
          "Danach: Sendeschluss"
        )}
      </div>
    </div>
  );
}

/** Click-to-load overlay: nothing is requested from a video provider before the user agrees. */
export function ConsentOverlay({ onGrant, url, label }: { onGrant: () => void; url: string; label: string }) {
  return (
    <div className="consent">
      <div className="row-btns">
        <button className="play" onClick={onGrant}>
          ▶ {label}
        </button>
        <a className="play ghost" href={url} target="_blank" rel="noopener noreferrer">
          Beim Anbieter ansehen
        </a>
      </div>
      <p>
        Videos werden von YouTube (erweiterter Datenschutzmodus), Dailymotion, dem Internet Archive oder Vimeo geladen.
        Dabei werden Daten an diese Anbieter übertragen. Deine Entscheidung wird in diesem Browser gespeichert.
      </p>
    </div>
  );
}

const INTERSTITIAL_CHIP: Record<string, string | null> = {
  ad_break: "WERBUNG",
  announcer: "ANSAGE",
  trailer: "TRAILER",
  sign_off: "SENDESCHLUSS",
  sign_on: "PROGRAMMBEGINN",
  ident: null,
  test_card: null,
};

export const interstitialChip = (kind: string) => INTERSTITIAL_CHIP[kind] ?? null;
/** Commercials are skipped; idents, announcers and trailers lead on to the programme. */
export const interstitialSkipLabel = (kind: string) => (kind === "ad_break" ? "Werbung überspringen" : "Weiter zum Programm");

interface InterstitialProps {
  segment: Segment;
  consent: boolean;
  onGrant: () => void;
  onSkip: () => void;
  player: ReactNode;
  /** YouTube: nothing may cover the player, the TV shows chip and skip button in the panel. */
  controlsOutside?: boolean;
}

/** Ads, idents, announcers, sign-off between programmes (doc M6 F4). */
export function InterstitialScreen({ segment, consent, onGrant, onSkip, player, controlsOutside }: InterstitialProps) {
  const chip = interstitialChip(segment.kind);
  const skipLabel = interstitialSkipLabel(segment.kind);
  if (consent) {
    return (
      <div className="ad playing">
        {player}
        {!controlsOutside && (
          <div className="ad-chip">
            {chip && <span>{chip}</span>}
            <button className="btn" onClick={onSkip} style={{ background: "rgba(0,0,0,.7)" }}>
              {skipLabel}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="ad">
      <div className="ad-word">{chip ?? "PAUSE"}</div>
      <p>{segment.note}</p>
      <div className="row-btns">
        <button className="play" onClick={onGrant}>
          ▶ Abspielen
        </button>
        <button className="btn" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Abspielen lädt das Video vom Anbieter (z. B. YouTube, Dailymotion).</p>
    </div>
  );
}

/** Switched-off TV. Powering on is the user gesture browsers need for autoplay with sound. */
export function PowerScreen({ consentGranted, onPowerOn }: { consentGranted: boolean; onPowerOn: (withVideos: boolean) => void }) {
  return (
    <div className="power">
      <div className="power-dot" aria-hidden />
      {consentGranted ? (
        <button className="play" onClick={() => onPowerOn(true)} autoFocus>
          ⏻ Einschalten
        </button>
      ) : (
        <>
          <div className="row-btns">
            <button className="play" onClick={() => onPowerOn(true)} autoFocus>
              ⏻ Einschalten
            </button>
            <button className="play ghost" onClick={() => onPowerOn(false)}>
              Ohne Videos einschalten
            </button>
          </div>
          <p>
            Beim Einschalten werden Videos von YouTube (erweiterter Datenschutzmodus), Dailymotion, dem Internet Archive
            oder Vimeo direkt im Fernseher abgespielt. Dabei werden Daten an diese Anbieter übertragen. Die Entscheidung
            wird in diesem Browser gespeichert und lässt sich auf der <Link href="/info#videos">Info-Seite</Link> widerrufen.
          </p>
        </>
      )}
    </div>
  );
}

/** An unused programme slot: just snow, like an untuned set. */
export function NoSignal() {
  return <div className="nosignal" role="img" aria-label="Kein Signal" />;
}

/** A station that was not (or no longer) on air on this day. */
export function OffAirScreen({
  station,
  headline,
  detail,
  children,
}: {
  station: string;
  headline: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="offair" role="img" aria-label={headline}>
      <div className="nosignal dim" />
      <div className="offair-card">
        <div className="offair-name">{station}</div>
        <p>{headline}</p>
        <p className="offair-detail">{detail}</p>
        {children}
      </div>
    </div>
  );
}
