"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Builds the embed URL for a start offset in seconds. */
  embedUrl: (startS: number) => string;
  title: string;
  startSeconds: (durationS?: number) => number;
  /** Needed to loop: the iframe is restarted when the recording would end. */
  durationS: number | null;
  loop?: boolean;
  onEnded?: () => void;
}

/**
 * Iframe embed without a JS API (Dailymotion, Vimeo): the start offset goes
 * into the URL; looping restarts the iframe at the end of the known duration.
 */
export function IframePlayer({ embedUrl, title, startSeconds, durationS, loop, onEnded }: Props) {
  const [round, setRound] = useState(0);
  const [startS] = useState(() => startSeconds(durationS ?? undefined));
  const offset = round === 0 ? startS : 0;
  // The parent re-renders every second; keep callbacks out of the timer's deps.
  const callbacks = useRef({ loop, onEnded });
  callbacks.current = { loop, onEnded };

  useEffect(() => {
    if (!durationS) return;
    const t = setTimeout(
      () => {
        callbacks.current.onEnded?.();
        if (callbacks.current.loop) setRound((r) => r + 1);
      },
      Math.max(1, durationS - offset) * 1000,
    );
    return () => clearTimeout(t);
  }, [round, durationS, offset]);

  // No `sandbox` yet: Vimeo plays with "allow-scripts allow-same-origin allow-presentation", but
  // Dailymotion can't be checked without a player ID (DAILYMOTION_PLAYER_ID); add it once both are verified.
  return (
    <iframe
      key={round}
      className="player"
      src={embedUrl(offset)}
      title={`Video: ${title}`}
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
