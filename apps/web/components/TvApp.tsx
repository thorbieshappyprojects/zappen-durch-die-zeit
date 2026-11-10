"use client";

import { advanceTvDaySeconds, broadcastsOf, findOnAir, formatClock, gapAround, formatTvDayDate, mediaFor, minutesSinceStart, offAirMessage, nextBroadcast, progressOf, PROVIDER_LABELS, searchUrlFor, seekOffsetSeconds, stationAtSlot, STATIONS, tvDaySecondsAt, upcomingBroadcast, type Broadcast, type TvDay, coverageHue, dayCoverage, stationStatus, formatTvDayShort, type ChannelDayHint, shareUrl, type ShareTarget, interstitialsFor, signOffFor, nearestVideoBroadcast, THEMES, type Channel, type ThemeId, CHRONIK, eventById, nearestEvent, eventWindow } from "@zdz/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVideoConsent } from "@/lib/consent";
import { actionForKey } from "@/lib/keymap";
import { playPowerOn, playSwitch } from "@/lib/sfx";
import { useFormToken } from "@/lib/form-token";
import { matchLabel } from "@/lib/labels";
import { HelpOverlay } from "./HelpOverlay";
import { OffTopicReport, reportFailedVideo, VideoReport } from "./VideoReport";
import { ConsentOverlay, YouTubeRefused, interstitialChip, InterstitialScreen, interstitialSkipLabel, NoSignal, OffAirScreen, PowerScreen, ProgrammeCard, TestCard } from "./Screen";
import { Teletext, TeletextChronik, TeletextOverview } from "./Teletext";
import { YearTimeline } from "./YearTimeline";
import { VideoPlayer } from "./VideoPlayer";
import { REFUSED_ERRORS } from "./YouTubePlayer";

/** Live: same Berlin wall-clock time as now. Manual: a chosen time that keeps running. */
type Clock = { mode: "live" } | { mode: "manual"; anchorTvSeconds: number; anchorRealMs: number };

const CHANNEL_KEY = "zdz-channel";
const POWER_KEY = "zdz-power";
const SWIPE_HINT_KEY = "zdz-swipe-hint";
/** How long the one-time "swipe to zap" hint stays on a touch screen. */
const SWIPE_HINT_MS = 4000;
/** Direct video files with this many picture lines or fewer (VHS rips) play without the CRT filter. */
const LOW_RES_MAX_LINES = 480;
const TAB_KEY = "zdz-tab";
const TV_MODE_KEY = "zdz-tv-mode";

/**
 * What the TV shows: "Fernsehen" (the day's TV, in one of three modes), a theme programme, or the
 * Chronik (an event's reports, core events.ts). Themes and Chronik play like live TV but any show
 * can be picked from the guide.
 */
type Tab = "tv" | ThemeId | "chronik";
/** "Fernsehen" modes: built from the videos we have, as it was, or free choice from the guide. */
type TvMode = "seamless" | "live" | "free";
/** Programmes built from the videos we have instead of the day's listing (see core seamless.ts, themes.ts). */
type BuiltKind = "seamless" | ThemeId | "chronik";
const isTheme = (v: string | null | undefined): v is ThemeId => !!v && v in THEMES;
const isTab = (v: string | null | undefined): v is Tab => v === "tv" || v === "chronik" || isTheme(v);
const isTvMode = (v: string | null): v is TvMode => v === "seamless" || v === "live" || v === "free";
const TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: "tv", label: "Fernsehen", icon: "📺" },
  ...(Object.keys(THEMES) as ThemeId[]).map((id) => ({ id, label: THEMES[id].label, icon: THEMES[id].icon })),
  { id: "chronik", label: CHRONIK.label, icon: CHRONIK.icon },
];
const OSD_MS = 3000;

/** How long the "no programme for today" notice stays on screen. */
const FALLBACK_NOTICE_MS = 6000;

export function TvApp({
  day: realDay,
  days,
  coverage,
  bestDays,
  requested,
  channelHints,
  assumedDates,
  share,
  reportToken: initialReportToken,
  hiddenStations,
  settings,
}: {
  day: TvDay;
  days: string[];
  coverage: Record<string, number>;
  bestDays: { date: string; score: number }[];
  /** "MM-DD" the start page looked for but didn't find; this day is one of the best days instead. */
  requested?: string;
  /** Per channel slug: nearest and best other day with a programme. */
  channelHints: Record<string, ChannelDayHint>;
  /** Dates with only an assumed programme (regular slots), marked in the calendar. */
  assumedDates: string[];
  /** From a shared link (?sender=…&zeit=…): channel to tune and time to start at. */
  share: ShareTarget;
  /** Signed form token for "Video defekt melden" (spam protection, see lib/contribution-security). */
  reportToken: string;
  /** Stations an admin hid (too little coverage): not in the channel list, skipped when zapping. */
  hiddenStations: string[];
  /** Admin switches: CRT look and TV sounds (the TV itself has no switches for them). */
  settings: { crtFilter: boolean; sounds: boolean };
}) {
  const [tab, setTab] = useState<Tab>("tv");
  const [tvMode, setTvMode] = useState<TvMode>("live");
  /** Chronik: the event on screen (a shared link's, else the one nearest to this day). */
  const [eventId, setEventId] = useState<string>(() => eventById(share.event)?.id ?? nearestEvent(realDay.date).id);
  const event = eventById(eventId) ?? nearestEvent(realDay.date);
  /** "Lückenlos" or a theme programme instead of the listing, loaded on demand. */
  const built: BuiltKind | null = tab !== "tv" ? tab : tvMode === "seamless" ? "seamless" : null;
  /** Which built programme is loaded: the kind, for the Chronik with its event. */
  const builtKey = built === "chronik" ? `chronik:${event.id}` : built;
  const builtLabel = (kind: BuiltKind) => (kind === "seamless" ? "Lückenlos" : kind === "chronik" ? `${CHRONIK.label} · ${event.title}` : THEMES[kind].label);
  const seamless = built !== null;
  /** Any show can be picked from the guide (and the player has its controls). */
  const freeChoice = tab !== "tv" || tvMode === "free";
  const [builtData, setBuiltData] = useState<{ key: string; date: string; channels: Channel[]; broadcasts: Broadcast[]; media: TvDay["media"] } | null>(
    null,
  );
  const seamlessReady = builtKey !== null && builtData?.key === builtKey && builtData.date === realDay.date;
  useEffect(() => {
    if (!built || !builtKey || (builtData?.key === builtKey && builtData.date === realDay.date)) return;
    let cancelled = false;
    // Nothing to show (failed, or no station has enough material): back to the real programme.
    const giveUp = () => (built === "seamless" ? setTvMode("live") : setTab("tv"));
    const query = built === "seamless" ? "" : built === "chronik" ? `?ereignis=${event.id}` : `?thema=${built}`;
    fetch(`/tag/${realDay.date}/lueckenlos${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { channels: Channel[]; broadcasts: Broadcast[]; media: TvDay["media"] }) => {
        if (cancelled) return;
        if (!d.channels.length) giveUp();
        else setBuiltData({ key: builtKey, date: realDay.date, ...d });
      })
      .catch(() => {
        if (!cancelled) giveUp();
      });
    return () => {
      cancelled = true;
    };
    // event.id is part of builtKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, builtKey, builtData?.key, builtData?.date, realDay.date]);
  // The day the TV plays: the real listing, or the built one with its own channels (only the filled ones).
  const day = useMemo(
    () => (seamlessReady ? { ...realDay, channels: builtData.channels, broadcasts: builtData.broadcasts, media: builtData.media } : realDay),
    [realDay, seamlessReady, builtData],
  );
  // Admin-hidden stations have too little real programme; theme channels only show what we have, so they count.
  const hidden = useMemo(() => new Set(seamlessReady && built !== "seamless" ? [] : hiddenStations), [hiddenStations, seamlessReady, built]);
  /** "Video defekt melden": the form token, renewed while the TV stays open (lib/form-token). */
  const { token: reportToken, refresh: refreshReportToken } = useFormToken(initialReportToken);
  // The day as the viewer sees it: hidden stations left out of channel list, zapping and P300.
  const visibleChannels = useMemo(() => day.channels.filter((c) => !hidden.has(c.id)), [day.channels, hidden]);
  const assumed = realDay.completeness === "series_only";
  const [showFallback, setShowFallback] = useState(Boolean(requested));
  // The notice covers the header: fade it out after a few seconds (it can also be closed right away).
  useEffect(() => {
    if (!showFallback) return;
    const t = setTimeout(() => setShowFallback(false), FALLBACK_NOTICE_MS);
    return () => clearTimeout(t);
  }, [showFallback]);
  const dayScore = useMemo(() => dayCoverage(realDay).score, [realDay]);
  const router = useRouter();
  const year = day.date.slice(0, 4);
  const dateLabel = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`));

  const [nowMs, setNowMs] = useState<number | null>(null);
  const [clock, setClock] = useState<Clock>({ mode: "live" });
  const [channelIdx, setChannelIdx] = useState(0);
  /** Tuned to a programme slot no channel uses on this day (e.g. 5 before RTL2 existed): snow. */
  const [emptySlot, setEmptySlot] = useState<number | null>(null);
  /** Direct files (archive.org) with too few lines: scanlines on top of a blurry VHS rip are hard to watch. */
  /** Player key of a YouTube player the viewer paused or scrubbed away from the live position. */
  const [drift, setDrift] = useState<string | null>(null);
  const [lowResVideoIds, setLowResVideoIds] = useState<ReadonlySet<string>>(() => new Set());
  const noteResolution = useCallback((videoId: string, height: number) => {
    if (height <= LOW_RES_MAX_LINES) setLowResVideoIds((prev) => (prev.has(videoId) ? prev : new Set(prev).add(videoId)));
  }, []);
  /** TV-wide sound state: switching channels keeps it (it used to reset per player). */
  const [muted, setMuted] = useState(false);
  const noSignal = emptySlot !== null;
  /** Bumped on every manual tune (channel or time) so the player remounts and re-seeks. */
  const [tuneNonce, setTuneNonce] = useState(0);
  const [osdUntil, setOsdUntil] = useState(0);
  const [staticOn, setStaticOn] = useState(false);
  const [skippedAdFor, setSkippedAdFor] = useState<string | null>(null);
  /** Videos that refused to play (removed, embedding disabled); skipped for the rest of the visit. */
  const [failedVideoIds, setFailedVideoIds] = useState<ReadonlySet<string>>(() => new Set());
  /** YouTube videos it refused to embed (bot check, 101/150): a notice with "Nochmal versuchen" instead. */
  const [refusedVideoIds, setRefusedVideoIds] = useState<ReadonlySet<string>>(() => new Set());
  /** The TV starts switched off: the power-on click is the user gesture that allows autoplay with sound. */
  const [powered, setPowered] = useState(false);
  const [switchingOn, setSwitchingOn] = useState(false);
  const consent = useVideoConsent();

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    try {
      // Remembered by slug: channel numbers differ between days. A station without a programme
      // on this day stays tuned too (empty slot with "Nächster/Bester Tag" hints), so jumping
      // to "Bester VIVA-Tag" from an empty VIVA slot lands on VIVA.
      // A shared link's channel wins over the remembered one.
      const slug = share.channelId ?? localStorage.getItem(CHANNEL_KEY);
      const saved = day.channels.findIndex((c) => c.id === slug);
      const station = slug ? STATIONS.find((s) => s.slug === slug) : undefined;
      // A hidden station only via a shared link; otherwise start on the first visible channel.
      if (saved >= 0 && (share.channelId === slug || !hidden.has(slug!))) setChannelIdx(saved);
      else if (station && !hidden.has(station.slug)) setEmptySlot(station.slot);
      else {
        const first = day.channels.findIndex((c) => !hidden.has(c.id));
        if (first >= 0) setChannelIdx(first);
      }
    } catch {}
    return () => clearInterval(id);
  }, [day.channels]);

  useEffect(() => {
    try {
      // The viewer's last choice (a shared link may override it below, without saving).
      const savedTab = localStorage.getItem(TAB_KEY);
      const savedMode = localStorage.getItem(TV_MODE_KEY);
      if (isTab(savedTab) && savedTab !== "tv") setTab(savedTab);
      if (isTvMode(savedMode)) setTvMode(savedMode);
    } catch {}
  }, []);

  // Stay switched on when moving between days (client navigation keeps the
  // page's user activation, so autoplay with sound keeps working).
  useEffect(() => {
    try {
      if (consent.granted && sessionStorage.getItem(POWER_KEY) === "on") setPowered(true);
    } catch {}
  }, [consent.granted]);

  // A built programme has its own channels: until the tuned one is found again there, the first.
  const channel = day.channels[channelIdx] ?? day.channels[0]!;
  const broadcasts = useMemo(() => broadcastsOf(day, channel.id), [day, channel.id]);

  const tvSeconds =
    nowMs === null
      ? null
      : clock.mode === "live"
        ? tvDaySecondsAt(new Date(nowMs))
        : advanceTvDaySeconds(clock.anchorTvSeconds, Math.max(0, Math.floor((nowMs - clock.anchorRealMs) / 1000)));
  const tvMin = tvSeconds === null ? null : Math.floor(tvSeconds / 60);
  const onAir = tvMin === null ? null : findOnAir(broadcasts, tvMin);
  // Screen readers: a channel change is announced once ("3 RTL – jetzt: …"), not every second.
  const onAirTitle = useRef<string | null>(null);
  onAirTitle.current = onAir?.title ?? null;
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!powered) return;
    setAnnouncement(
      emptySlot !== null ? `${emptySlot} – kein Sender` : `${channel.displayNumber} ${channel.name} – jetzt: ${onAirTitle.current ?? "Sendepause"}`,
    );
  }, [powered, channel.id, channel.displayNumber, channel.name, emptySlot]);
  // On reconstructed (partial) days a gap means "not known", not "off air": treat it as a slot of its own.
  const unknownGap =
    !onAir && tvMin !== null && day.completeness !== "full" ? gapAround(broadcasts, channel.id, tvMin) : null;
  const current = onAir ?? unknownGap;
  const next = onAir ? nextBroadcast(broadcasts, onAir) : tvMin !== null ? upcomingBroadcast(broadcasts, tvMin) : null;
  const media = current ? mediaFor(day, current) : null;
  // Prefilled community form for the broadcast on air ("Video vorschlagen").
  const suggestUrl = onAir
    ? `/mitmachen?${new URLSearchParams({ tag: day.date, sender: channel.id, zeit: formatClock(onAir.startMin), titel: onAir.title })}`
    : null;
  // Interstitials (doc M6 F4): at the end of a programme ads/ident/announcer, after the last one
  // the sign-off. Played one after another; "Weiter zum Programm" or the end skips the rest.
  const sequence = useMemo(() => {
    if (noSignal || tvMin === null) return [];
    if (onAir) return interstitialsFor(day, channel, onAir, tvMin);
    const signOff = signOffFor(day, channel, tvMin);
    return signOff ? [signOff] : [];
  }, [day, channel, onAir, tvMin, noSignal]);
  const sequenceKey = `${channel.id}|${onAir?.id ?? "end"}`;
  const [sequencePos, setSequencePos] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const sequenceIndex = sequencePos.key === sequenceKey ? sequencePos.index : 0;
  const activeSegment = skippedAdFor !== sequenceKey ? (sequence[sequenceIndex] ?? null) : null;
  const adActive = activeSegment !== null;
  const advanceSequence = useCallback(() => {
    if (sequenceIndex + 1 < sequence.length) setSequencePos({ key: sequenceKey, index: sequenceIndex + 1 });
    else setSkippedAdFor(sequenceKey);
  }, [sequenceIndex, sequence.length, sequenceKey]);

  // Visible channels whose current programme has an embeddable video, for the "Gerade mit Video" hint.
  const videoElsewhere = useMemo(() => {
    if (tvMin === null) return [];
    return visibleChannels.flatMap((c) => {
      if (c.id === channel.id) return [];
      const b = findOnAir(broadcastsOf(day, c.id), tvMin);
      const m = b ? mediaFor(day, b) : null;
      return b && m?.embeddable ? [{ displayNumber: c.displayNumber, name: c.name, title: b.title }] : [];
    });
  }, [day, visibleChannels, channel.id, tvMin]);

  // Remote-style dialing: digits collect for a second (or until Enter), shown in the corner.
  const [dialBuffer, setDialBuffer] = useState("");
  const dialTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Slot before the last tune, for "L" (Rückruf). */
  const previousSlot = useRef<number | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** TV sound effects (click/static/power-on); default on, silent while the TV sound is muted. */
  const sfxActive = useRef(true);
  sfxActive.current = settings.sounds && !muted;
  // One-screen fit on wide screens: the CSS budgets fixed heights; fonts, zoom or scrollbars can
  // add a few pixels. Measure the overflow and shrink the TV by exactly that much (no page scroll).
  useEffect(() => {
    const root = document.documentElement;
    const fit = () => {
      root.style.setProperty("--fit-extra", "0px");
      if (!window.matchMedia("(min-width: 1000px) and (orientation: landscape)").matches) return;
      for (let i = 0, extra = 0; i < 3; i++) {
        const over = root.scrollHeight - window.innerHeight;
        if (over <= 0) break;
        extra += over + 2;
        root.style.setProperty("--fit-extra", `${extra}px`);
      }
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    // The header can change height on its own (wrapping, notices); the TV's size doesn't affect it.
    const header = document.querySelector(".page-header");
    const observer = header ? new ResizeObserver(fit) : null;
    if (header) observer!.observe(header, { box: "border-box" });
    return () => {
      window.removeEventListener("resize", fit);
      observer?.disconnect();
    };
  }, []);
  /** Teletext page: the tuned channel (P301…) or the overview P300 (default on phones). */
  /** "chronik": the event list P400 (Chronik tab). */
  const [ttView, setTtView] = useState<"channel" | "overview" | "chronik">("channel");
  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) setTtView("overview");
  }, []);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const channelsRef = useRef<HTMLElement>(null);

  // Keep the tuned slot visible in the (scrollable) channel list, e.g. after zapping with the keyboard.
  useEffect(() => {
    // Only the strip's own scroll area (desktop): scrollIntoView would also scroll the page, and on a
    // phone (no scroll area) every P+/P− tap made the page jump.
    const strip = channelsRef.current;
    const on = strip?.querySelector<HTMLElement>(".ch.on");
    if (!strip || !on || strip.scrollHeight <= strip.clientHeight) return;
    const s = strip.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    if (b.top < s.top) strip.scrollTop -= s.top - b.top;
    else if (b.bottom > s.bottom) strip.scrollTop += b.bottom - s.bottom;
  }, [channelIdx, emptySlot]);
  const tvSecondsRef = useRef(tvSeconds);
  tvSecondsRef.current = tvSeconds;

  const playerKey = current ? `${current.id}:${tuneNonce}` : "";
  const ownVideo =
    media?.embeddable && media.providerVideoId && !failedVideoIds.has(media.providerVideoId) ? media : null;
  // Nothing embeddable for this slot: play the next best thing so the channel never goes quiet.
  // No substitute programme: a broadcast without a video shows its programme card ("Video vorschlagen").
  const playDurationS = ownVideo?.durationS ?? null;
  const playing = ownVideo ? { provider: ownVideo.provider, videoId: ownVideo.providerVideoId!, url: ownVideo.url } : null;
  const canEmbed = playing !== null;
  /** What a "Video defekt" report refers to: the video on screen and where it was seen. */
  const reportContext =
    playing && current
      ? { url: playing.url, tvDate: day.date, channel: channel.id, start: formatClock(current.startMin), title: current.title }
      : null;
  const videoActive = powered && canEmbed && consent.granted && !adActive && !noSignal;
  const adVideoActive = powered && adActive && consent.granted;
  const shownVideoId = adVideoActive ? activeSegment?.providerVideoId : videoActive ? playing?.videoId : undefined;
  /**
   * A YouTube player is on screen: YouTube's embed rules forbid anything on top of it, so the CRT layers,
   * the channel/clock display, the static and the buttons move out of the picture (into the panel).
   */
  const ytOnScreen = (adVideoActive && activeSegment?.provider === "youtube") || (videoActive && playing?.provider === "youtube");
  const crtFilter = settings.crtFilter && !ytOnScreen && !(shownVideoId && lowResVideoIds.has(shownVideoId));
  const programmePlayerKey = playing ? `${playerKey}:${playing.provider}:${playing.videoId}:${freeChoice}` : "";
  // Linear modes: the viewer paused or scrubbed the YouTube player; „Zurück zu jetzt“ tunes back in.
  const offLive = !freeChoice && videoActive && drift === programmePlayerKey;
  const osdVisible = powered && (!(videoActive || adVideoActive) || (nowMs !== null && nowMs < osdUntil));

  const retune = useCallback(() => {
    setTuneNonce((n) => n + 1);
    setOsdUntil(Date.now() + OSD_MS);
  }, []);

  const switchTo = useCallback(
    (idx: number) => {
      const n = day.channels.length;
      const target = ((idx % n) + n) % n;
      if (target === channelIdx && !noSignal) return;
      previousSlot.current = emptySlot ?? day.channels[channelIdx]!.displayNumber;
      setChannelIdx(target);
      setEmptySlot(null);
      try {
        localStorage.setItem(CHANNEL_KEY, day.channels[target]!.id);
      } catch {}
      setStaticOn(true);
      setTimeout(() => setStaticOn(false), 180);
      if (sfxActive.current) playSwitch();
      retune();
    },
    [channelIdx, noSignal, day.channels, retune, emptySlot],
  );

  /** Programme slots like on a real set: 1 … highest used number; unused slots show snow. */
  const slotCount = Math.max(...day.channels.map((c) => c.displayNumber), ...STATIONS.map((st) => st.slot));
  // A slot without a channel on this day: explain if the station did not exist (yet) at that date.
  const emptyStation = emptySlot !== null ? stationAtSlot(emptySlot) : undefined;
  const osdText = noSignal ? `${emptySlot} ${emptyStation?.name ?? ""}`.trim() : `${channel.displayNumber} ${channel.name}`;
  const offAir = emptyStation ? offAirMessage(emptyStation, day.date) : null;
  const tuneSlot = useCallback(
    (requested: number) => {
      // A hidden station's number is skipped like on zapping: on to the next shown channel.
      // "Lückenlos" has no empty slots: their numbers are skipped too.
      const isHidden = (n: number) => {
        const c = day.channels.find((ch) => ch.displayNumber === n);
        return hidden.has(c?.id ?? stationAtSlot(n)?.slug ?? "") || (seamless && !c);
      };
      const sorted = [...visibleChannels].sort((a, b) => a.displayNumber - b.displayNumber);
      const slot = isHidden(requested) ? (sorted.find((c) => c.displayNumber > requested) ?? sorted[0])?.displayNumber : requested;
      if (slot === undefined) return;
      const idx = day.channels.findIndex((c) => c.displayNumber === slot);
      if (idx >= 0) return switchTo(idx);
      if (slot === emptySlot) return;
      previousSlot.current = emptySlot ?? day.channels[channelIdx]?.displayNumber ?? null;
      setEmptySlot(slot);
      try {
        const station = stationAtSlot(slot);
        if (station) localStorage.setItem(CHANNEL_KEY, station.slug);
      } catch {}
      setStaticOn(true);
      setTimeout(() => setStaticOn(false), 180);
      if (sfxActive.current) playSwitch();
      retune();
    },
    [day.channels, visibleChannels, hidden, seamless, emptySlot, switchTo, retune, channelIdx],
  );

  // Switched to "Lückenlos" on a channel it leaves out (or an empty slot): on to its first channel.
  useEffect(() => {
    if (!seamlessReady || (emptySlot === null && !hidden.has(channel.id))) return;
    const first = [...visibleChannels].sort((a, b) => a.displayNumber - b.displayNumber)[0];
    if (first) switchTo(day.channels.indexOf(first));
  }, [seamlessReady, emptySlot, hidden, channel.id, visibleChannels, switchTo, day.channels]);

  /** ←/→ zap through the used slots only (unused ones are skipped, as on a real set). */
  const zap = useCallback(
    (dir: 1 | -1) => {
      const from = emptySlot ?? day.channels[channelIdx]!.displayNumber;
      const sorted = [...visibleChannels].sort((a, b) => a.displayNumber - b.displayNumber);
      if (!sorted.length) return;
      const next =
        dir === 1
          ? (sorted.find((c) => c.displayNumber > from) ?? sorted[0]!)
          : ([...sorted].reverse().find((c) => c.displayNumber < from) ?? sorted[sorted.length - 1]!);
      switchTo(day.channels.indexOf(next));
    },
    [day.channels, visibleChannels, channelIdx, emptySlot, switchTo],
  );

  const jumpTo = useCallback(
    (tvDayMin: number) => {
      setClock({ mode: "manual", anchorTvSeconds: tvDayMin * 60, anchorRealMs: Date.now() });
      setSkippedAdFor(null);
      retune();
    },
    [retune],
  );

  /** Touch screens: show once, after the first power-on, that swiping the picture zaps. */
  const [swipeHint, setSwipeHint] = useState(false);
  const powerOn = useCallback(
    (withVideos: boolean) => {
      if (withVideos) consent.grant();
      setPowered(true);
      try {
        sessionStorage.setItem(POWER_KEY, "on");
      } catch {}
      setSwitchingOn(true);
      setTimeout(() => setSwitchingOn(false), 450);
      if (sfxActive.current) playPowerOn();
      retune();
      try {
        if (matchMedia("(pointer: coarse)").matches && !localStorage.getItem(SWIPE_HINT_KEY)) {
          localStorage.setItem(SWIPE_HINT_KEY, "shown");
          setSwipeHint(true);
          setTimeout(() => setSwipeHint(false), SWIPE_HINT_MS);
        }
      } catch {}
    },
    [consent, retune],
  );

  const goLive = useCallback(() => {
    setClock({ mode: "live" });
    retune();
  }, [retune]);

  /** Switch between "Fernsehen", the theme programmes and the Chronik: each starts with what is on now. */
  const chooseTab = useCallback(
    (next: Tab) => {
      setTab(next);
      // The Chronik opens with its event list; leaving it goes back to the channel guide.
      setTtView((v) => (next === "chronik" ? "chronik" : v === "chronik" ? "channel" : v));
      try {
        localStorage.setItem(TAB_KEY, next);
      } catch {}
      if (clock.mode !== "live") goLive();
    },
    [clock.mode, goLive, setTtView],
  );
  const chooseTvMode = useCallback(
    (mode: TvMode) => {
      setTvMode(mode);
      try {
        localStorage.setItem(TV_MODE_KEY, mode);
      } catch {}
      // Back to linear TV means back to what is on right now.
      if (mode !== "free" && clock.mode !== "live") goLive();
    },
    [clock.mode, goLive],
  );

  /** Chronik: show an event (from the list P400). */
  const pickEvent = useCallback(
    (id: string) => {
      setEventId(id);
      if (tab !== "chronik") chooseTab("chronik");
      setTtView("channel");
    },
    [tab, chooseTab, setTtView],
  );
  const shortDate = (d: string) => d.split("-").reverse().join(".");

  // A shared link: its programme, and with a time a start there (in "Fernsehen" as free choice).
  // Not saved as the viewer's preference. Idempotent on purpose: React runs mount effects twice in development.
  useEffect(() => {
    if (share.event) setTab("chronik");
    else if (share.programme) setTab(share.programme);
    else if (share.tvDayMin !== undefined) {
      setTab("tv");
      setTvMode("free");
    }
    if (share.tvDayMin !== undefined) jumpTo(share.tvDayMin);
  }, [share.programme, share.event, share.tvDayMin, jumpTo]);

  // "Programm frei wählen" (and the themes): a new day or another station opens a show we have a
  // video for – the one on air, else the next, else the last earlier one. A shared link's time is
  // kept: it named a show on purpose.
  const autoPicked = useRef<string | null>(share.tvDayMin !== undefined ? "shared" : null);
  useEffect(() => {
    if (!freeChoice || tvMin === null || noSignal) return;
    const key = `${day.date}|${channel.id}|${seamlessReady}`;
    if (autoPicked.current === "shared") {
      autoPicked.current = key;
      return;
    }
    if (autoPicked.current === key) return;
    autoPicked.current = key;
    const playable = (b: Broadcast) => {
      const m = mediaFor(day, b);
      return Boolean(m?.embeddable && m.providerVideoId && !failedVideoIds.has(m.providerVideoId));
    };
    const target = nearestVideoBroadcast(day, broadcasts, tvMin, playable);
    if (target && !(onAir && target.id === onAir.id)) jumpTo(target.startMin);
    // Only on a change of day, station or programme (not every minute).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeChoice, day.date, channel.id, seamlessReady, tvMin === null, noSignal]);

  // Keep the address bar shareable: channel always, time only when not live. replaceState instead
  // of router.replace – the latter would re-render the page on the server for every channel switch.
  const tunedSlug = emptyStation?.slug ?? channel.id;
  useEffect(() => {
    const t = setTimeout(() => {
      const url = shareUrl(day.date, {
        channelId: tunedSlug,
        tvDayMin: clock.mode === "manual" ? Math.floor(clock.anchorTvSeconds / 60) : undefined,
        programme: isTheme(tab) ? tab : undefined,
        event: tab === "chronik" ? event.id : undefined,
      });
      if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, "", url);
    }, 400);
    return () => clearTimeout(t);
  }, [day.date, tunedSlug, clock, tab, event.id]);

  const [shareNote, setShareNote] = useState<string | null>(null);
  /** "Teilen" on a guide entry: that show (channel, start time, date, programme), via the share sheet or the clipboard. */
  const shareShow = useCallback(async (b: Broadcast) => {
    const programme = isTheme(tab) ? tab : undefined;
    const chronik = tab === "chronik" ? event : undefined;
    const url = shareUrl(day.date, { channelId: channel.id, tvDayMin: b.startMin, programme, event: chronik?.id }, window.location.origin);
    const title = `${formatClock(b.startMin)} ${channel.name} – ${b.title} · ${programme ? THEMES[programme].label : chronik ? `${CHRONIK.label}: ${chronik.title}` : formatTvDayDate(day.date)}`;
    try {
      if (navigator.share) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      setShareNote("Link kopiert");
    } catch {
      setShareNote(null);
    }
    setTimeout(() => setShareNote(null), 2500);
  }, [day.date, channel.id, channel.name, tab, event]);

  const commitDial = useCallback(
    (digits: string) => {
      if (dialTimer.current) clearTimeout(dialTimer.current);
      dialTimer.current = null;
      setDialBuffer("");
      const n = Number(digits);
      if (n >= 1 && n <= slotCount) tuneSlot(n);
    },
    [slotCount, tuneSlot],
  );

  const toggleFullscreen = useCallback(() => {
    const el = screenRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A dialog (help, calendar, report form) is open: it handles its own keys, Escape included.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const action = actionForKey(e.key);
      if (!action) return;
      switch (action) {
        case "dial": {
          // Like a remote: digits collect; a number that can't grow any further is tuned at once,
          // otherwise after a second (or on Enter).
          const digits = (dialBuffer + e.key).replace(/^0+/, "");
          if (!digits) return;
          if (dialTimer.current) clearTimeout(dialTimer.current);
          if (digits.length >= 2 || Number(digits) * 10 > slotCount) return commitDial(digits);
          setDialBuffer(digits);
          dialTimer.current = setTimeout(() => commitDial(digits), 1000);
          return;
        }
        case "dialCommit":
          if (dialBuffer) commitDial(dialBuffer);
          return;
        case "zapNext":
        case "zapPrev":
          e.preventDefault(); // ↑/↓ would scroll the page
          return zap(action === "zapNext" ? 1 : -1);
        case "lastChannel":
          if (previousSlot.current !== null) tuneSlot(previousSlot.current);
          return;
        case "dayPrev":
        case "dayNext": {
          const day2 = days[days.indexOf(day.date) + (action === "dayPrev" ? -1 : 1)];
          if (day2) {
            e.preventDefault();
            router.push(`/tag/${day2}`);
          }
          return;
        }
        case "mute":
          return setMuted((m) => !m);
        case "fullscreen":
          return toggleFullscreen();
        case "help":
          return setHelpOpen((o) => !o);
        case "teletext":
          return setTtView((v) => (v === "overview" ? "channel" : "overview"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slotCount, day.date, days, router, tuneSlot, zap, toggleFullscreen, commitDial, dialBuffer, helpOpen]);

  /** Swipe left/right on the picture zaps (phones have no keys). */
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(t.clientY - start.y)) zap(dx < 0 ? 1 : -1);
  };

  const startSeconds = useCallback(
    (durationS?: number) => {
      if (!current || tvSecondsRef.current === null) return 0;
      return seekOffsetSeconds(current, tvSecondsRef.current, durationS ?? playDurationS ?? undefined);
    },
    [current, playDurationS],
  );

  const programmeCard = (b: Broadcast, hideActions?: boolean) => (
    <ProgrammeCard
      broadcast={
        b === unknownGap
          ? { ...b, description: "Was zu dieser Zeit lief, ist nicht überliefert. Wer ein altes Programmheft hat, kann es unter „Mitmachen“ ergänzen." }
          : b
      }
      next={next}
      progress={tvSeconds === null ? 0 : progressOf(b, tvSeconds)}
      media={media}
      searchUrl={searchUrlFor(b, day.date)}
      year={year}
      minutesIn={tvSeconds === null ? 0 : minutesSinceStart(b, tvSeconds)}
      videoElsewhere={videoElsewhere}
      onTune={tuneSlot}
      hideActions={hideActions || b === unknownGap}
      noSignOff={tab === "chronik"}
      suggestUrl={b === onAir ? suggestUrl : null}
    />
  );

  let screen: React.ReactNode;
  if (!powered) {
    screen = <PowerScreen consentGranted={consent.granted} onPowerOn={powerOn} />;
  } else if (noSignal) {
    // Station on air but no programme for it today, or not on air yet/any more: offer days that have one.
    const hint = emptyStation ? channelHints[emptyStation.slug] : undefined;
    screen = emptyStation ? (
      <OffAirScreen
        station={emptyStation.name}
        headline={offAir?.headline ?? `Für ${emptyStation.name} fehlt uns das Programm dieses Tages.`}
        detail={offAir?.detail ?? "Vielleicht kannst du es beisteuern – oder schau an einem anderen Tag."}
      >
        <DayHintLinks station={emptyStation.name} slug={emptyStation.slug} hint={hint} />
      </OffAirScreen>
    ) : (
      <NoSignal />
    );
  } else if (tvMin === null) {
    screen = <TestCard channelName={channel.name} upcoming={null} />;
  } else if (adActive && activeSegment) {
    screen = (
      <InterstitialScreen
        segment={activeSegment}
        controlsOutside={consent.granted && activeSegment.provider === "youtube"}
        consent={consent.granted}
        onGrant={consent.grant}
        onSkip={() => setSkippedAdFor(sequenceKey)}
        player={
          <VideoPlayer
            key={`seq:${sequenceKey}:${sequenceIndex}:${freeChoice}`}
            provider={activeSegment.provider}
            videoId={activeSegment.providerVideoId}
            title={activeSegment.note || channel.name}
            muted={muted}
            live={!freeChoice}
            onAutoplayBlocked={() => setMuted(true)}
            startSeconds={() => activeSegment.inS ?? 0}
            endSeconds={activeSegment.outS}
            onEnded={advanceSequence}
            onError={advanceSequence}
            onResolution={(_w, h) => noteResolution(activeSegment.providerVideoId, h)}
          />
        }
      />
    );
  } else if (!current) {
    screen = (
      <TestCard channelName={channel.name} upcoming={upcomingBroadcast(broadcasts, tvMin) ?? broadcasts[0] ?? null} unknown={assumed} />
    );
  } else if (videoActive && playing && refusedVideoIds.has(playing.videoId)) {
    screen = (
      <>
        {programmeCard(current, true)}
        <YouTubeRefused
          url={playing.url}
          onRetry={() =>
            setRefusedVideoIds((prev) => {
              const next = new Set(prev);
              next.delete(playing.videoId);
              return next;
            })
          }
        />
      </>
    );
  } else if (videoActive && playing) {
    screen = (
      <>
        <VideoPlayer
          // Switching the mode ("Wie damals" / free choice) remounts the player with or without controls at the current position.
          key={programmePlayerKey}
          provider={playing.provider}
          videoId={playing.videoId}
          title={current.title}
          startSeconds={startSeconds}
          durationS={playDurationS}
          muted={muted}
          live={!freeChoice}
          onAutoplayBlocked={() => setMuted(true)}
          // Linear TV: a recording shorter than its slot starts again. Where shows can be picked (themes,
          // free choice) the viewer may have skipped ahead: at the end, on to the next show of the guide.
          loop={!freeChoice || !next}
          onEnded={freeChoice && next ? () => jumpTo(next.startMin) : undefined}
          onResolution={(_w, h) => noteResolution(playing.videoId, h)}
          onDrift={(drifted) => setDrift(drifted ? programmePlayerKey : null)}
          onError={(code) => {
            // Refused by YouTube (mostly its bot check): the viewer can try again; the server only keeps
            // the report if the video really can't be embedded (oEmbed), see app/melden/actions.ts.
            if (playing.provider === "youtube" && code !== undefined && REFUSED_ERRORS.has(code))
              setRefusedVideoIds((prev) => new Set(prev).add(playing.videoId));
            else setFailedVideoIds((prev) => new Set(prev).add(playing.videoId));
            if (reportContext) reportFailedVideo(reportContext, reportToken, code !== undefined ? `YouTube-Fehler ${code}` : undefined);
          }}
        />
      </>
    );
  } else if (canEmbed && !consent.granted) {
    screen = (
      <>
        {programmeCard(current, true)}
        <ConsentOverlay
          onGrant={consent.grant}
          url={playing!.url}
          label="Video im Fernseher abspielen"
        />
      </>
    );
  } else {
    screen = programmeCard(current);
  }

  // The TV modes (review §5) as teletext buttons in the guide; the explanation is each button's hover text.
  const modesBlock = (
    <>
      {tab === "tv" && (
        <div className="tt-modes" role="radiogroup" aria-label="Wie soll der Fernseher laufen?">
          {(
            [
              ["seamless", "Lückenlos", "Durchgehend Programm auf allen Sendern – aus vorhandenen Aufnahmen, nicht das echte Programm."],
              ["live", "Wie damals", `Es läuft, was am ${dateLabel} um diese Uhrzeit lief. YouTube-Videos zeigen dabei YouTubes eigene Bedienelemente.`],
              ["free", "Programm frei wählen", "Klicke im Programm auf eine Sendung."],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={tvMode === mode}
              className={tvMode === mode ? "on" : ""}
              title={hint}
              onClick={() => chooseTvMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "chronik" && (
        <div className="tt-modes">
          <button type="button" onClick={() => setTtView("chronik")} title="Alle Ereignisse (Videotext-Seite 400)">
            P400 Chronik: alle Ereignisse
          </button>
        </div>
      )}
      {built && !seamlessReady && <p className="tt-note">Programm wird zusammengestellt …</p>}
      {freeChoice && clock.mode === "manual" && (
        <p className="tt-note">
          <button type="button" onClick={goLive}>
            ◂ Zurück zu jetzt
          </button>
        </p>
      )}
    </>
  );

  return (
    <div className="wrap">
      <header className="page-header">
        <h1>
          Zappen durch die Zeit<span className="h1-sep"> · </span>
          <span className="h1-date">{built ? builtLabel(built) : formatTvDayDate(day.date)}</span>
        </h1>
        <div className="sub">
          {visibleChannels.length} Sender
          {built === "chronik" ? (
            ` · Berichte vom ${shortDate(eventWindow(event).from)} bis ${shortDate(eventWindow(event).to)}`
          ) : built ? (
            " · Programm aus vorhandenen Aufnahmen"
          ) : assumed ? (
            <span title="Aus regelmäßigen Sendeplätzen anderer Tage hergeleitet: nur Serien, Talkshows, Nachrichten usw.">
              {" "}
              · Programm angenommen
            </span>
          ) : (
            day.completeness !== "full" && " · Programm lückenhaft"
          )}

        </div>
      </header>

      {showFallback && requested && (
        <div className="fallback-note" role="status">
          Vom{" "}
          {new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" }).format(
            new Date(`2001-${requested}T12:00:00Z`),
          )}{" "}
          haben wir kein Programm – hier ist einer unserer besten Tage: {formatTvDayDate(day.date).replace(/^\S+, /, "")}.
          {share.tvDayMin !== undefined && " Du siehst eine Sendung von damals; im Programm kannst du frei wählen."}
          <button type="button" aria-label="Hinweis schließen" onClick={() => setShowFallback(false)}>
            ×
          </button>
        </div>
      )}

      <div className="layout">
        <nav className="channels" aria-label="Senderwahl" ref={channelsRef}>
          {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => {
            const c = day.channels.find((ch) => ch.displayNumber === slot);
            const station = stationAtSlot(slot);
            if (hidden.has(c?.id ?? station?.slug ?? "")) return null;
            // "Lückenlos": only the filled channels, no empty slots.
            if (seamless && !c) return null;
            const on = c ? !noSignal && c.id === channel.id : emptySlot === slot;
            // Two kinds of empty slot (review §6): no programme for an existing station vs. not on air.
            const missing = !c && station && stationStatus(station, day.date).kind === "on_air";
            return (
              <button
                key={slot}
                className={`ch${on ? " on" : ""}${c ? "" : missing ? " missing" : " empty"}`}
                title={missing ? `Für ${station!.name} fehlt uns das Programm dieses Tages` : undefined}
                onClick={() => tuneSlot(slot)}
                aria-pressed={on}
                aria-label={c ? `${slot} ${c.name}` : `${slot} ${station?.name ?? "– nicht belegt"}`}
              >
                {slot}
                <small>{c ? c.name : (station?.name ?? "–")}</small>
              </button>
            );
          })}
          {/* The site's other pages, as buttons of the set: below the stations, after a divider. */}
          <span className="ch-divider" role="separator" />
          {(
            [
              [`/info?tag=${day.date}`, "Info"],
              [`/mitmachen?tag=${day.date}`, "Mitmachen"],
              ["/impressum", "Impressum"],
              ["/datenschutz", "Datenschutz"],
            ] as const
          ).map(([href, label]) => (
            <Link key={label} className="ch ch-link" href={href}>
              {label}
            </Link>
          ))}
        </nav>

        {/* What the TV shows: the day's TV, or a theme programme (each has its own channels). Centred over the set,
            in a row of its own so the channel strip and the guide line up with the set itself. */}
        <nav className="programme-tabs" aria-label="Programm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              className={tab === t.id ? "on" : ""}
              title={
                t.id === "tv"
                  ? "Das Fernsehprogramm des Tages"
                  : t.id === "chronik"
                    ? `${CHRONIK.description} Jede Sendung lässt sich im Programm wählen.`
                    : `${THEMES[t.id].description} Aus vorhandenen Aufnahmen; jede Sendung lässt sich im Programm wählen.`
              }
              onClick={() => chooseTab(t.id)}
            >
              <span aria-hidden>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
        <section className="tv-area">
          <div className="tv">
            <div className="bezel">
              <div
                ref={screenRef}
                className={`screen${switchingOn ? " switching-on" : ""}${crtFilter ? "" : " no-crt"}${ytOnScreen ? " yt" : ""}`}
                onDoubleClick={toggleFullscreen}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                {dialBuffer && !ytOnScreen && (
                  <div className="dial-osd" aria-live="polite">
                    {dialBuffer}–
                  </div>
                )}
                {screen}
                {swipeHint && !ytOnScreen && (
                  <div className="swipe-hint" role="status">
                    ◀ wischen zum Umschalten ▶
                  </div>
                )}
                {!ytOnScreen && (
                  <>
                    <div className={`screen-clock${osdVisible ? "" : " hidden"}`}>{tvMin === null ? "--:--" : formatClock(tvMin)}</div>
                    <div className={`osd${osdVisible ? "" : " hidden"}`}>{osdText}</div>
                    {powered && !videoActive && !adActive && <div className="screen-glow" />}
                    <div className="screen-scanlines" />
                    <div className={`static${staticOn ? " on" : ""}`} />
                  </>
                )}
                {muted && (videoActive || adVideoActive) && !ytOnScreen && (
                  <button className="play unmute" onClick={() => setMuted(false)}>
                    🔇 Ton an
                  </button>
                )}
              </div>
            </div>
            <div className="panel">
              {ytOnScreen ? (
                // Channel, clock and dialled digits next to the picture instead of on it (YouTube player).
                <div className="brand panel-osd" aria-live="polite">
                  {dialBuffer ? `${dialBuffer}–` : osdText} · {tvMin === null ? "--:--" : formatClock(tvMin)}
                </div>
              ) : (
                <div className="brand">
                  ZEITFUNK<span className="brand-extra"> · STEREO</span>
                </div>
              )}
              {ytOnScreen && adVideoActive && activeSegment && (
                <button className="filter-switch" onClick={() => setSkippedAdFor(sequenceKey)} title={interstitialChip(activeSegment.kind) ?? undefined}>
                  {interstitialSkipLabel(activeSegment.kind)}
                </button>
              )}
              {offLive && (
                <button className="filter-switch on" onClick={retune} title="Pausiert oder gespult: zurück zur Stelle, an der die Sendung jetzt wäre.">
                  ◂ Zurück zu jetzt
                </button>
              )}
              {/* Zapping without keys (phones) and the sound switch: always visible. */}
              <button className="filter-switch" onClick={() => zap(-1)} title="Vorheriger Sender (Taste ←)" aria-label="Vorheriger Sender">
                P−
              </button>
              <button className="filter-switch" onClick={() => zap(1)} title="Nächster Sender (Taste →)" aria-label="Nächster Sender">
                P+
              </button>
              <button
                className={`filter-switch${muted ? "" : " on"}${muted && ytOnScreen ? " attn" : ""}`}
                onClick={() => setMuted((m) => !m)}
                aria-pressed={!muted}
                title="Ton an/aus (Taste M)"
              >
                Ton: <span className="sw-state">{muted ? "aus" : "an"}</span>
              </button>
              <button className="filter-switch" onClick={toggleFullscreen} title="Vollbild (Taste V, Doppelklick aufs Bild)" aria-label="Vollbild">
                ⛶
              </button>
              <button className="filter-switch" onClick={() => setHelpOpen(true)} title="Tastenkürzel (Taste H oder ?)" aria-label="Tastenkürzel">
                ?
              </button>
              <div className="power-led" aria-hidden />
            </div>
          </div>
        </section>

        <section className="extras">
          {videoActive && current && ownVideo && (
            <div className="now-strip" title={`${current.title} – ${ownVideo.note}`}>
              {/* Time, title, how close the video is, what it actually is, where it comes from, then the actions.
                  "Lückenlos": every slot was picked for its video, so match level and suggestions don't apply. */}
              <span className="times">{formatClock(current.startMin)}</span>
              <strong>{current.title}</strong>
              {!seamless && <span className={`badge b-${ownVideo.matchLevel}`}>{matchLabel(ownVideo.matchLevel)}</span>}
              <span>{ownVideo.note}</span>
              {ownVideo.alt && (
                <a href={ownVideo.alt.url} target="_blank" rel="noopener noreferrer">
                  {ownVideo.alt.label}
                </a>
              )}
              {playing && (
                <a className="source-chip" href={playing.url} target="_blank" rel="noopener noreferrer">
                  via {PROVIDER_LABELS[playing.provider]}
                </a>
              )}
              {playing && <VideoReport context={reportContext!} token={reportToken} refreshToken={refreshReportToken} />}
              {playing && tab === "chronik" && seamlessReady && (
                <OffTopicReport context={reportContext!} event={event.id} token={reportToken} refreshToken={refreshReportToken} />
              )}
              {suggestUrl && !seamless && ownVideo.matchLevel !== "exact" && (
                <a className="strip-action" href={suggestUrl} title="Du kennst ein besseres Video zu dieser Sendung? Hier vorschlagen.">
                  ＋ Video vorschlagen
                </a>
              )}
            </div>
          )}

        </section>

        <div className="tt-area">
          {ttView === "chronik" && tab === "chronik" ? (
            <TeletextChronik current={event.id} onPick={pickEvent} onChannelPage={() => setTtView("channel")} />
          ) : ttView === "overview" ? (
            <TeletextOverview
              day={{ ...day, channels: visibleChannels }}
              tvMin={tvMin}
              tunedSlot={emptySlot ?? channel.displayNumber}
              onTune={tuneSlot}
              onChannelPage={() => setTtView("channel")}
              label={built === "chronik" ? CHRONIK.label : built ? builtLabel(built) : undefined}
              showMatch={!seamless}
              modes={modesBlock}
            />
          ) : noSignal ? (
            <section className="tt" aria-label="Videotext">
              <div className="tt-head">
                <span>P{300 + emptySlot!}</span>
                <span>Programmplatz {emptySlot}</span>
              </div>
              <div className="tt-title">{emptyStation?.name ?? "Kein Sender"}</div>
              <p style={{ color: "var(--tt-white)", margin: "4px" }}>
                {offAir
                  ? `${offAir.headline} ${offAir.detail}.`
                  : emptyStation
                    ? `Für ${emptyStation.name} liegt für den ${dateLabel} noch kein Programm vor.`
                    : `Auf diesem Programmplatz war am ${dateLabel} kein Sender empfangbar.`}
              </p>
              {emptyStation && <DayHintLinks station={emptyStation.name} slug={emptyStation.slug} hint={channelHints[emptyStation.slug]} teletext />}
              {modesBlock}
            </section>
          ) : (
            <Teletext
              onOverview={() => setTtView("overview")}
              day={day}
              channel={channel}
              broadcasts={broadcasts}
              current={onAir}
              bestDay={channelHints[channel.id]?.best}
              bestDayHref={channelHints[channel.id]?.best ? hintHref(channelHints[channel.id]!.best!.date, channel.id, channelHints[channel.id]) : undefined}
              assumed={assumed}
              onSelect={freeChoice ? (b) => jumpTo(b.startMin) : undefined}
              label={built === "chronik" ? CHRONIK.label : built ? builtLabel(built) : undefined}
              showMatch={!seamless}
              onShare={shareShow}
              // The day listing is the real programme: not for built ones.
              listingHref={built ? undefined : `/tag/${day.date}/programm`}
              modes={modesBlock}
              summary={
                <>
                  {!seamless && (
                    <span
                      className="cov-chip"
                      style={{ "--cov-h": coverageHue(dayScore) } as React.CSSProperties}
                      title="Anteil der Sendungen dieses Tages mit Video (genaue Treffer zählen mehr)."
                    >
                      {Math.round(dayScore * 100)} % mit Video
                    </span>
                  )}
                  {shareNote && (
                    <span className="share-note" role="status">
                      {shareNote}
                    </span>
                  )}
                </>
              }
            />
          )}
        </div>
      </div>

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      <YearTimeline days={days} current={day.date} coverage={coverage} bestDays={bestDays} assumedDates={assumedDates} />
    </div>
  );
}

/** "Nächster Tag mit 3sat" / "Bester 3sat-Tag": ways out of an empty channel. */
/** Link to another day of a station: straight to that day's show with the best video, if there is one. */
function hintHref(date: string, slug: string, hint?: ChannelDayHint): string {
  return shareUrl(date, { channelId: slug, tvDayMin: hint?.videoAt?.[date] });
}

function DayHintLinks({ station, slug, hint, teletext }: { station: string; slug: string; hint?: ChannelDayHint; teletext?: boolean }) {
  if (!hint?.nearest && !hint?.best) return null;
  const sameDay = hint.best?.date === hint.nearest;
  return (
    <p className={teletext ? "tt-hints" : "day-hints"}>
      {hint.nearest && (
        <Link href={hintHref(hint.nearest, slug, hint)}>
          ▶ Nächster Tag mit {station}: {formatTvDayShort(hint.nearest)}
        </Link>
      )}
      {hint.best && !sameDay && (
        <Link href={hintHref(hint.best.date, slug, hint)}>
          ⭐ Bester {station}-Tag: {formatTvDayShort(hint.best.date)} ({Math.round(hint.best.score * 100)} % mit Video{hint.best.exact ? `, ${hint.best.exact} × genau` : ""})
        </Link>
      )}
    </p>
  );
}
