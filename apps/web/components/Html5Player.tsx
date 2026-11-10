"use client";

import { useEffect, useRef } from "react";

interface Props {
  src: string;
  title: string;
  /** Called once the duration is known, to seek into the programme. */
  startSeconds: (durationS?: number) => number;
  loop?: boolean;
  onEnded?: () => void;
  onError?: () => void;
  muted: boolean;
  onAutoplayBlocked?: () => void;
  /** "Wie damals" mode: no controls and no pausing. Off: the browser's video controls. */
  live: boolean;
  /** Stop at this second and report "ended" (segment of a longer recording). */
  endSeconds?: number | null;
  /** The file's picture size, once known (the TV leaves out the CRT filter on low-resolution files). */
  onResolution?: (width: number, height: number) => void;
}

/**
 * Plain <video> for direct files (Internet Archive). Same contract as the
 * YouTube player: starts at the live position, loops, follows the TV's sound
 * switch and reports when the browser blocks autoplay with sound.
 */
export function Html5Player({ src, title, startSeconds, loop, onEnded, onError, muted, onAutoplayBlocked, live, endSeconds, onResolution }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ startSeconds, onEnded, onError, onAutoplayBlocked, onResolution });
  callbacks.current = { startSeconds, onEnded, onError, onAutoplayBlocked, onResolution };

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onMeta = () => {
      if (video.videoHeight) callbacks.current.onResolution?.(video.videoWidth, video.videoHeight);
      video.currentTime = callbacks.current.startSeconds(video.duration);
      video.play().catch(() => {
        // Autoplay with sound refused (no user interaction yet): play muted and tell the TV.
        video.muted = true;
        callbacks.current.onAutoplayBlocked?.();
        video.play().catch(() => callbacks.current.onError?.());
      });
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [src]);

  return (
    <video
      ref={ref}
      className="player html5"
      src={src}
      loop={loop}
      muted={muted}
      playsInline
      controls={!live}
      preload="metadata"
      aria-label={`Video: ${title}`}
      onPause={(e) => {
        // Linear TV can't be paused (context menu, media keys): keep going.
        if (live && !e.currentTarget.ended && !e.currentTarget.dataset.segmentEnd) e.currentTarget.play().catch(() => {});
      }}
      onTimeUpdate={(e) => {
        if (endSeconds && e.currentTarget.currentTime >= endSeconds && !e.currentTarget.dataset.segmentEnd) {
          e.currentTarget.dataset.segmentEnd = "1"; // a deliberate stop: the live-mode resume below must not undo it
          e.currentTarget.pause();
          callbacks.current.onEnded?.();
        }
      }}
      onEnded={() => callbacks.current.onEnded?.()}
      onError={() => callbacks.current.onError?.()}
    />
  );
}
