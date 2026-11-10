"use client";

import type { Provider } from "@zdz/core";
import { DAILYMOTION_PLAYER_ID } from "@/lib/providers";
import { Html5Player } from "./Html5Player";
import { IframePlayer } from "./IframePlayer";
import { YouTubePlayer } from "./YouTubePlayer";

interface Props {
  provider: Provider;
  videoId: string;
  title: string;
  startSeconds: (durationS?: number) => number;
  durationS?: number | null;
  loop?: boolean;
  onEnded?: () => void;
  onError?: () => void;
  muted: boolean;
  onAutoplayBlocked?: () => void;
  /** "Wie damals" mode: linear TV, no controls, no pausing or skipping. Off: the provider's full controls. */
  live: boolean;
  /** Stop here (seconds) and report "ended" – for a segment of a longer recording (interstitials). */
  endSeconds?: number | null;
  /** YouTube in a linear mode: the viewer paused or scrubbed away from the live position (true) or came back. */
  onDrift?: (drifted: boolean) => void;
  /** Picture size of a direct file (YouTube and other iframes don't tell). */
  onResolution?: (width: number, height: number) => void;
}

/** Plays a video from any embeddable provider at the live position. Remount with a new `key` to retune. */
export function VideoPlayer({ live, ...props }: Props) {
  return (
    <>
      <ProviderPlayer live={live} {...props} />
      {/* Live: a transparent layer swallows clicks, so the picture can't be paused or skipped. Never over YouTube:
          its embed rules forbid covering the player or blocking its controls. */}
      {live && props.provider !== "youtube" && <div className="player-shield" aria-hidden="true" />}
    </>
  );
}

function ProviderPlayer({ provider, videoId, durationS = null, muted, onAutoplayBlocked, live, endSeconds = null, onResolution, onDrift, ...rest }: Props) {
  const sound = { muted, onAutoplayBlocked, live };
  // Iframes have no API: they "end" by timer, at the segment end if there is one.
  const iframeDuration = endSeconds ?? durationS;
  switch (provider) {
    case "youtube":
      return <YouTubePlayer videoId={videoId} endSeconds={endSeconds} onDrift={onDrift} {...rest} {...sound} />;
    case "archive":
      return <Html5Player src={`https://archive.org/download/${videoId}`} endSeconds={endSeconds} onResolution={onResolution} {...rest} {...sound} />;
    case "dailymotion":
      return (
        <IframePlayer
          {...rest}
          durationS={iframeDuration}
          embedUrl={(s) =>
            `https://geo.dailymotion.com/player/${DAILYMOTION_PLAYER_ID}.html?video=${videoId}&startTime=${s}${muted ? "&mute=true" : ""}${live ? "&controls=false" : ""}`
          }
        />
      );
    case "vimeo":
      return (
        <IframePlayer
          {...rest}
          durationS={iframeDuration}
          embedUrl={(s) =>
            `https://player.vimeo.com/video/${videoId}?autoplay=1&dnt=1&controls=${live ? 0 : 1}&keyboard=${live ? 0 : 1}&title=0&byline=0&portrait=0${muted ? "&muted=1" : ""}#t=${s}s`
          }
        />
      );
    default:
      return null;
  }
}
