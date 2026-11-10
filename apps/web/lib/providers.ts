import type { Provider, TvDay } from "@zdz/core";

/**
 * Dailymotion's current player only embeds with a player ID from a (free)
 * Dailymotion partner account; its old /embed/video URLs now answer 403.
 */
export const DAILYMOTION_PLAYER_ID = process.env.NEXT_PUBLIC_DAILYMOTION_PLAYER_ID ?? null;

export function canEmbed(provider: Provider): boolean {
  return provider !== "dailymotion" || DAILYMOTION_PLAYER_ID !== null;
}

/** Marks videos this deployment cannot play in the screen as link-outs (the programme card links to them). */
export function withPlayableMedia(day: TvDay): TvDay {
  return {
    ...day,
    media: Object.fromEntries(
      Object.entries(day.media).map(([id, m]) => [id, m.embeddable && !canEmbed(m.provider) ? { ...m, embeddable: false } : m]),
    ),
    adBreaks: day.adBreaks.map((a) => (canEmbed(a.provider) ? a : { ...a, providerVideoId: null })),
  };
}
