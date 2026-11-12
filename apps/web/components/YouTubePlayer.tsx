"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeApi, YT_HOST, type YTPlayer } from "@/lib/youtube";

/** How long to wait for autoplay with sound before falling back to muted playback. */
const AUTOPLAY_CHECK_MS = 2500;
/** Watchdog: a player that is not playing this long after tuning gets re-seeked and nudged. */
const STALL_CHECK_MS = 4000;
/** Nudges before the video is loaded afresh. A stall is never a failure: slow buffering is not a broken video. */
const MAX_NUDGES = 3;
/** Further than this from the live position (scrubbed by the viewer): the TV offers „Zurück zu jetzt“. */
const DRIFT_TOLERANCE_S = 20;
/** YouTube error codes that mean the video can't play here at all: removed/private (100), embedding off (101, 150). */
const FATAL_ERRORS = new Set([100, 101, 150]);
/**
 * 101/150 also come with YouTube's bot check ("Melde dich an, um zu bestätigen, dass du kein Bot bist"),
 * which hits rarely watched videos at random, per request: try again a few times before giving up.
 */
export const REFUSED_ERRORS = new Set([101, 150]);
const REFUSED_RETRY_MS = [2500, 5000];

interface Props {
  videoId: string;
  /** Called at load and again once the duration is known, to seek into the programme. */
  startSeconds: (durationS?: number) => number;
  /** Restart from the beginning when the recording ends (recordings shorter than the slot). */
  loop?: boolean;
  onEnded?: () => void;
  /** YouTube's error code when it gives up (undefined: the API didn't load). */
  onError?: (code?: number) => void;
  /** The video never started, even after reloading (no error from YouTube): offer "try again" instead of looping. */
  onStalled?: () => void;
  /** TV-wide sound state; every new channel starts with it. */
  muted: boolean;
  /** The browser refused autoplay with sound (only possible before any user interaction). */
  onAutoplayBlocked?: () => void;
  /**
   * Linear modes ("Wie damals", "Lückenlos"): the player still shows YouTube's own controls (their embed rules),
   * but reports when the viewer paused or scrubbed away from the live position.
   */
  live: boolean;
  /** Live only: true while paused or away from the live position, false once back. */
  onDrift?: (drifted: boolean) => void;
  /** Stop at this second (segment of a longer recording); YouTube then reports "ended". */
  endSeconds?: number | null;
  title: string;
}

/** True once the user clicked/pressed a key on the page: autoplay with sound is allowed from then on. */
export function hasUserActivation(): boolean {
  return (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
}

/**
 * Phones and tablets (iOS above all) block autoplay with sound in an embedded player even after a tap:
 * the tap happened on our page, not in YouTube's frame. There the muted fallback is always needed.
 */
function strictAutoplay(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

/**
 * YouTube IFrame player (privacy-enhanced host) that autoplays at the live
 * position and follows the TV's sound switch. If the browser blocks autoplay
 * with sound, it plays muted and reports it. Mount with a new `key` to retune.
 */
export function YouTubePlayer({ videoId, startSeconds, loop, onEnded, onError, onStalled, muted, onAutoplayBlocked, live, endSeconds, title, onDrift }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const callbacks = useRef({ startSeconds, loop, onEnded, onError, onStalled, muted, onAutoplayBlocked, onDrift });
  callbacks.current = { startSeconds, loop, onEnded, onError, onStalled, muted, onAutoplayBlocked, onDrift };

  // Follow the TV's sound switch without reloading the video.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) p.mute();
    else p.unMute();
  }, [muted]);

  useEffect(() => {
    let cancelled = false;
    let autoplayTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    const host = hostRef.current;
    const mount = document.createElement("div");
    host?.appendChild(mount);
    let reloaded = false;
    /** The video reached "playing" at least once: from then on a stall is buffering, never a failure. */
    let started = false;
    let refusedRetries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let drifted = false;
    const checkDrift = (target: YTPlayer, paused: boolean) => {
      if (!live) return;
      const now = paused || Math.abs(target.getCurrentTime() - callbacks.current.startSeconds(target.getDuration() || undefined)) > DRIFT_TOLERANCE_S;
      if (now !== drifted) callbacks.current.onDrift?.((drifted = now));
    };
    const reload = (target: YTPlayer) => {
      reloaded = true;
      target.loadVideoById({
        videoId,
        startSeconds: callbacks.current.startSeconds(target.getDuration() || undefined),
        ...(endSeconds ? { endSeconds: Math.round(endSeconds) } : {}),
      });
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          host: YT_HOST,
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            start: callbacks.current.startSeconds(),
            ...(endSeconds ? { end: Math.round(endSeconds) } : {}),
            autoplay: 1,
            playsinline: 1,
            // YouTube's standard controls in every mode: embeds must not hide or block them.
            controls: 1,
            fs: 1,
            disablekb: 0,
            rel: 0,
            iv_load_policy: 3,
            // No auto-generated subtitles over the picture; viewers can still enable them.
            cc_load_policy: 0,
            hl: "de",
          },
          events: {
            onReady: ({ target }) => {
              if (callbacks.current.muted) target.mute();
              else target.unMute();
              // Re-seek: loading took time and the duration is now known (short recordings wrap).
              target.seekTo(callbacks.current.startSeconds(target.getDuration()), true);
              target.playVideo();
              // Muted fallback only where the browser really blocks sound: before any user interaction, and
              // always on touch devices. A slow load on desktop is no reason to mute (that used to mute the TV
              // on some channel switches).
              if ((strictAutoplay() || !hasUserActivation()) && !callbacks.current.muted) {
                autoplayTimer = setTimeout(() => {
                  const state = target.getPlayerState();
                  if (state === -1 || state === 5) {
                    target.mute();
                    target.playVideo();
                    callbacks.current.onAutoplayBlocked?.();
                  }
                }, AUTOPLAY_CHECK_MS);
              }
              // Seeking deep into long recordings occasionally hangs in "unstarted"/buffering.
              let nudges = 0;
              watchdog = setInterval(() => {
                const state = target.getPlayerState();
                if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
                  started = true;
                  nudges = 0;
                  checkDrift(target, state === YT.PlayerState.PAUSED);
                  return;
                }
                if (++nudges > MAX_NUDGES) {
                  nudges = 0;
                  // Never started (unstarted/cued, not buffering) even after a fresh load: YouTube shows its own
                  // notice in the frame without an error event (e.g. its bot check on phones). Stop reloading –
                  // every load makes the bot check likelier – and let the TV offer "try again".
                  if (reloaded && !started && (state === -1 || state === 5)) {
                    clearInterval(watchdog);
                    callbacks.current.onStalled?.();
                    return;
                  }
                  reload(target);
                  return;
                }
                target.seekTo(callbacks.current.startSeconds(target.getDuration()), true);
                target.playVideo();
              }, STALL_CHECK_MS);
            },
            onStateChange: ({ data, target }) => {
              if (data === YT.PlayerState.PLAYING) started = true;
              if (data === YT.PlayerState.PAUSED || data === YT.PlayerState.PLAYING) checkDrift(target, data === YT.PlayerState.PAUSED);
              if (data !== YT.PlayerState.ENDED) return;
              if (callbacks.current.loop) {
                target.seekTo(0, true);
                target.playVideo();
              }
              callbacks.current.onEnded?.();
            },
            // Bad parameter / HTML5 player hiccup (2, 5): load afresh once; only then, or on a fatal code, give up.
            onError: ({ data, target }) => {
              if (!FATAL_ERRORS.has(data) && !reloaded) {
                reload(target);
                return;
              }
              if (REFUSED_ERRORS.has(data) && refusedRetries < REFUSED_RETRY_MS.length) {
                retryTimer = setTimeout(() => {
                  if (!cancelled) reload(target);
                }, REFUSED_RETRY_MS[refusedRetries++]);
                return;
              }
              clearInterval(watchdog);
              callbacks.current.onError?.(data);
            },
          },
        });
      })
      .catch(() => callbacks.current.onError?.());

    return () => {
      cancelled = true;
      clearTimeout(autoplayTimer);
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      playerRef.current?.destroy();
      playerRef.current = null;
      host?.replaceChildren();
    };
  }, [videoId]);

  return <div className="player" ref={hostRef} aria-label={`Video: ${title}`} />;
}
