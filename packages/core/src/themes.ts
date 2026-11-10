/**
 * Theme channels: like "Lückenlos" (see seamless.ts), but only one kind of programme, from the
 * whole decade. It's about the feeling, not the date: Saturday-morning cartoons and the kids' hour,
 * or the afternoon of talk and court shows. Each station plays its own recordings of the genre, so
 * the private stations bring their cartoons and ARD/ZDF their children's programmes.
 */
import { seamlessDay, type PoolVideo } from "./seamless";
import { STATIONS } from "./stations";
import type { Channel, TvDay } from "./types";

export type ThemeId = "kinder" | "talk";

export interface Theme {
  id: ThemeId;
  /** Channel-strip entry and header ("Zappen durch die Zeit · Kinderprogramm"). */
  label: string;
  icon: string;
  description: string;
  /** Genre → title pattern; a video belongs to the theme if its broadcast title matches one. */
  genres: Record<string, RegExp>;
}

export const THEMES: Record<ThemeId, Theme> = {
  kinder: {
    id: "kinder",
    label: "Kinderprogramm",
    icon: "🧸",
    description: "Zeichentrick und Kindersendungen, rund um die Uhr.",
    genres: {
      // Cartoons, mostly on the private stations (the Disney blocks of ARD, RTL and Super RTL).
      cartoon:
        /disney|gummibären|duck ?tales|darkwing|käpt'?n balu|chip (und|&) chap|timon (und|&) pumbaa|goofy|micky|mickey|pokémon|pokemon|sailor moon|dragon ?ball|vampy|simpsons|lucky luke|bugs bunny|schweinchen dick|feuerstein|he-man|masters of the universe|bravestarr|saber rider|turtles|alfred j\.? kwak|ottifanten|asterix|charlie brown|peanuts|rascal|niklaas|trickfilm|li-la-launebär|hotzpotz|bim bam bino|boing|nickelodeon|tom (und|&) jerry|biene maja|wickie|heidi|captain planet|inspe[ck]tor gadget|garfield|batman|spider-?man|x-men|digimon|rugrats|animaniacs|pinky (und|&) brain|tiny toon|gargoyles|schlümpfe|barbapapa|calimero|tabaluga|blaubär|kinderprogramm|cartoon|bonkers|marsupilami|disneys doug|^doug$|trickserie|extreme dinosaurs|mummies alive|mystic knights|hey arnold|rockos|bumpety boo|bea (und|&) bruno|pow ?wow|pepper ann|quack pack|101 dalmatiner|winnie puuh|mighty ducks|camp candy|noahs kids|oz kids|space ?cats|neds bösenachtgeschichte|^die dinos$/i,
      // Children's programmes, mostly ARD/ZDF.
      kids: /sendung mit der maus|sesamstraße|löwenzahn|sandmännchen|1,? ?-? ?2 oder 3|logo!|tigerenten|kinder-?wetten|hallo spencer|\bart attack|kinder ruck zuck|pfiff|siebenstein|pumuckl|rappelkiste|neues aus uhlenbusch|dingsda|kinderquatsch|mini playback show|bärenbude|super,? metty|super toy club|muuh|die sendung mit dem elefanten/i,
    },
  },
  talk: {
    id: "talk",
    label: "Talk Shows",
    icon: "🎙",
    description: "Talk- und Gerichtsshows im Wechsel, wie am Nachmittag.",
    genres: {
      talk: /hans meiser|ilona christen|bärbel schäfer|arabella|andreas türck|vera am mittag|^vera$|birte karalus|^sonja$|jörg pilawa|fliege|^nicole$|^sabrina$|kerner|schreinemakers|oliver gei(ss|ß)en|^britt$|peter imhof|^ricky!?$|mensch ohrner|kiesbauer/i,
      court: /barbara salesch|richterin|richter alexander hold|alexander hold|streit um drei|jugendgericht|familiengericht|verkehrsgericht|ehen vor gericht|kallwass|lenßen|gerichtsshow/i,
    },
  },
};

/** The theme genre of a broadcast title, or null. */
export function themeGenreOf(theme: ThemeId, title: string): string | null {
  for (const [genre, rx] of Object.entries(THEMES[theme].genres)) if (rx.test(title)) return genre;
  return null;
}

/** A station needs this many different shows of the theme to get a channel (two alternate). */
export const THEME_MIN_TITLES = 2;

export const PUBLIC_STATIONS = new Set(["ard", "zdf", "3sat", "n3", "wdr", "mdr", "br", "hr", "swr", "orb", "kika", "arte", "phoenix"]);

/**
 * The theme programme for a day: one channel per station with enough recordings of the theme,
 * filled 06:00–06:00 from the whole pool (any time of day; talk and court shows alternate).
 * The date only seeds the order, so another day gives another mix.
 */
export function themeDay(day: TvDay, pool: readonly PoolVideo[], theme: ThemeId): TvDay {
  const themed = pool.filter((v) => themeGenreOf(theme, v.title) !== null);
  const channels: Channel[] = STATIONS.filter((st) => themed.some((v) => v.channelId === st.slug)).map((st) => ({
    id: st.slug,
    name: st.name,
    displayNumber: st.slot,
    isPrivate: !PUBLIC_STATIONS.has(st.slug),
  }));
  return seamlessDay({ ...day, channels, broadcasts: [], media: {} }, themed, {
    minTitles: THEME_MIN_TITLES,
    timeOfDay: 0,
    kindOf: (v) => themeGenreOf(theme, v.title) ?? "",
  });
}
