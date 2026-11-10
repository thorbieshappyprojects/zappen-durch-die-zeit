import type { Provider } from "./types";

const PROVIDER_HOSTS: [RegExp, Provider][] = [
  [/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(dailymotion\.com|dai\.ly)$/, "dailymotion"],
  [/(^|\.)archive\.org$/, "archive"],
  [/(^|\.)vimeo\.com$/, "vimeo"],
  [/(^|\.)zdf\.de$/, "zdf"],
  [/(^|\.)ardmediathek\.de$|(^|\.)ard\.de$/, "ard"],
  [/(^|\.)rtlplus\.com$|(^|\.)rtl\.de$/, "rtlplus"],
  [/(^|\.)joyn\.de$/, "joyn"],
  [/(^|\.)bundestag\.de$/, "bundestag"],
  [/(^|\.)bpb\.de$/, "bpb"],
];

export function providerOf(url: string): Provider {
  const host = new URL(url).hostname;
  return PROVIDER_HOSTS.find(([re]) => re.test(host))?.[1] ?? "other";
}

/** Extracts the 11-character YouTube video id from watch, short or embed URLs. */
export function youtubeVideoId(url: string): string | null {
  const u = new URL(url);
  if (providerOf(url) !== "youtube") return null;
  const candidate = u.hostname.endsWith("youtu.be")
    ? u.pathname.slice(1)
    : (u.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([^/]+)/.exec(u.pathname)?.[1] ?? null);
  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

/**
 * Provider-specific video id for the in-screen players, or null:
 * YouTube "dQw4w9WgXcQ", Dailymotion "x8rg5ce", Vimeo "76979871",
 * archive.org "<identifier>/<file>" (a playable file is required).
 */
export function videoIdOf(url: string): string | null {
  const u = new URL(url);
  switch (providerOf(url)) {
    case "youtube":
      return youtubeVideoId(url);
    case "dailymotion": {
      const id = u.hostname.endsWith("dai.ly") ? u.pathname.slice(1) : /^\/(?:embed\/)?video\/([^/_?]+)/.exec(u.pathname)?.[1];
      return id && /^x[0-9a-z]+$/i.test(id) ? id : null;
    }
    case "vimeo":
      return /^\/(?:video\/)?(\d+)/.exec(u.pathname)?.[1] ?? null;
    case "archive": {
      const m = /^\/(?:details|download|embed)\/([^/]+)\/(.+\.(?:mp4|webm|ogv|m4v))$/i.exec(decodeURIComponent(u.pathname));
      return m ? `${m[1]}/${m[2]}` : null;
    }
    default:
      return null;
  }
}

/** Providers the TV can play in its own screen (with seeking). */
export const EMBEDDABLE_PROVIDERS: readonly Provider[] = ["youtube", "dailymotion", "archive", "vimeo"];

export function isEmbeddable(url: string): boolean {
  return EMBEDDABLE_PROVIDERS.includes(providerOf(url)) && videoIdOf(url) !== null;
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  youtube: "YouTube",
  dailymotion: "Dailymotion",
  archive: "Internet Archive",
  vimeo: "Vimeo",
  zdf: "ZDF-Mediathek",
  ard: "ARD Mediathek",
  rtlplus: "RTL+",
  joyn: "Joyn",
  bundestag: "Bundestag-Mediathek",
  bpb: "bpb-Mediathek",
  other: "Quelle",
};
