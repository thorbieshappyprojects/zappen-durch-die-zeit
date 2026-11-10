# Chronik – events and their material

The **Chronik** tab shows one event at a time as its own programme: every station that has recordings
from the days around the event gets a channel and shows each of them once, at the time of day it aired
(recordings of the same slot from several days follow each other, in airing order). Code:
core `packages/core/src/events.ts` (`HISTORY_EVENTS`, `eventVideos`, `eventDay`), database
`packages/db/src/events.ts`, route `/tag/<date>/lueckenlos?ereignis=<id>`, list page P400 in the teletext.

## How recordings are chosen (automatic)

A recording belongs to an event when all of this holds:

1. It is linked as **exact** (🟢: this very broadcast) – an episode from another day says nothing about the event.
2. It **aired in the event's window**: from `daysBefore` (default 1) before to `daysAfter` (default 10) after the date.
3. Its show title is of a **reporting kind** (core `eventGenreOf`): news (Tagesschau, heute, RTL aktuell, …),
   specials (Brennpunkt, ZDF spezial, Sondersendung, live, Wahl …), magazines (Spiegel TV, stern TV, Explosiv,
   Monitor …), talk shows – or matches the event's own `extra` pattern (e.g. sport shows for the World Cup final,
   music shows for Take That). Never: Aktenzeichen XY, Sesamstraße, Lotto and the like.
4. It is approved, embeddable, not blocked, and not taken out of this event by a moderator.

A Tagesschau from the evening of an event almost always reports on it; a talk show from the same week may not.
That is accepted on purpose (owner decision 10 Nov 2026: automatic first, filter in production):

- Viewers press **„✗ Passt nicht zum Ereignis"** under the picture → a `media_report` with reason `off_topic` and the event id.
- `/admin/meldungen` shows these per event; **„Aus diesem Ereignis nehmen"** writes `event_exclusion (event_id, url)`.
  The video leaves only that event; on the normal TV it stays. Exclusions survive re-imports (keyed by URL).

## Events

Status: ✅ built (in `HISTORY_EVENTS`) · 🟡 material only days later or thin · ❌ no material yet.
Material = exact recordings of a reporting kind found on 10 Nov 2026 (from a day before to 10 days after).
○ = lighter event (pop culture, sport).

| Date | Event | Status | Material (10 Nov 2026) |
|---|---|---|---|
| 18.03.1990 | Volkskammerwahl in der DDR | ✅ | 2 stations, 2 videos: Tagesschau, Spiegel TV the same evening |
| 25.04.1990 | Attack on Oskar Lafontaine | 🟡 | only stern TV a week later |
| 01.07.1990 | Währungsunion | ✅ | 2 stations, 6 videos: heute the same day, Tagesschau, heute-journal |
| 08.07.1990 | ○ World Cup final, Germany world champion | ✅ | 2 stations, 5 videos: Tagesschau/heute the day before and after |
| 02.08.1990 | Iraq invades Kuwait | ✅ | 1 station, 2 videos: Tagesschau and Tagesthemen the same day |
| 31.08.1990 | Unification treaty signed | ❌ | nothing of a reporting kind |
| 03.10.1990 | **Deutsche Einheit** | 🟡 | heute on 2 Oct, RTL aktuell Extra on 12 Oct – nothing from the day itself |
| 02.12.1990 | First all-German Bundestag election | ✅ | 3 stations, 3 videos |
| 17.01.1991 | Gulf War begins | ✅ | 3 stations, 6 videos: Tagesschau and Tagesthemen 16 Jan, Tagesschau 17 Jan, RTL aktuell, heute (window +14 days) |
| 28.02.1991 | Gulf War ceasefire | 🟡 | Tagesschau 3 Mar |
| 13.03.1991 | Honecker flown to Moscow | 🟡 | our seed day, but only heute a week later |
| 01.04.1991 | Detlev Rohwedder murdered | ✅ | 2 stations, 5 videos: Tagesschau and heute the next day |
| 20.06.1991 | Bundestag votes for Berlin | 🟡 | ZDF Die Reportage the same day, heute days later |
| 19.08.1991 | Coup in Moscow | ✅ | 1 station, 2 videos: RTL aktuell the same day, Spiegel TV |
| 17.09.1991 | Hoyerswerda | ✅ | 1 station, 2 videos: Tagesschau 19 and 24 Sep |
| 25.12.1991 | End of the Soviet Union | ❌ | |
| 06.04.1992 | War in Bosnia begins | ✅ | 2 stations, 2 videos: heute 7 Apr |
| 25.07.1992 | ○ Olympic Games Barcelona | ❌ | |
| 22.08.1992 | Rostock-Lichtenhagen | 🟡 | only heute a week later |
| 23.11.1992 | Arson attack in Mölln | 🟡 | Tagesschau a week later |
| 30.04.1993 | ○ Monica Seles stabbed | ✅ | 3 stations, 4 videos: MDR aktuell the same day, RTL aktuell, heute |
| 29.05.1993 | Arson attack in Solingen | ❌ | |
| 05.02.1994 | Markale massacre, Sarajevo | ❌ | |
| 12.02.1994 | ○ Olympic Games Lillehammer | 🟡 | one Tagesschau |
| 06.04.1994 | Rwanda genocide begins | 🟡 | heute-journal, heute 9/10 Apr |
| 16.10.1994 | Bundestag election 1994 | 🟡 | ProSieben Nachrichten days later |
| 13.11.1994 | ○ Schumacher's first title | 🟡 | Nachtjournal (night before), SAT.1 morning show after |
| 24.06.1995 | ○ Christo wraps the Reichstag | 🟡 | MTV News |
| 11.07.1995 | Srebrenica | ❌ | |
| 22.10.1995 | ○ Schumacher's second title | ❌ | |
| 04.11.1995 | Rabin assassinated | 🟡 | WDR aktuell a week later |
| 13.02.1996 | ○ Take That split | ✅ | 3 stations, 6 videos: Schreinemakers live, heute nacht, Nachtjournal, daily talk shows (to be filtered) |
| 30.06.1996 | ○ European Championship title | ❌ | |
| 13.08.1996 | Dutroux case | ❌ | |
| 02.05.1997 | Tony Blair becomes Prime Minister | ❌ | |
| 20.07.1997 | Oder flood | 🟡 | ProSieben Nachrichten 29 Jul |
| 31.08.1997 | Death of Princess Diana | ✅ | 3 stations, 5 videos: Exclusiv, Explosiv, Tagesschau |
| Nov 1997 | ○ Tic Tac Toe press conference | ❓ | date still to be verified (assumed 20 Nov: a heute-journal that day) |
| 10.04.1998 | Good Friday Agreement | 🟡 | RTL aktuell 15/16 Apr |
| 03.06.1998 | ICE disaster at Eschede | ✅ | 2 stations, 2 videos: Tagesschau the same day |
| 27.09.1998 | Bundestag election, Schröder wins | ✅ | 2 stations, 3 videos: Tagesschau and heute the same evening |
| 19.12.1998 | Clinton impeachment | ✅ | 2 stations, 2 videos: RTL aktuell the same day, Spiegel TV |
| 01.01.1999 | Euro introduced (book money) | ❌ | |
| 15.01.1999 | Račak / Kosovo | ❌ | |
| 24.03.1999 | Kosovo war | 🟡 | MDR aktuell three days later |
| 11.08.1999 | ○ Total solar eclipse | ✅ | 4 stations, 6 videos: mittwochs live, ZDF spezial, Tagesschau, RTL aktuell |
| 31.12.1999 | Millennium / Yeltsin resigns | ✅ | 3 stations, 5 videos: Tagesschau, „2000 Live – The Final Countdown", Tigerenten Club spezial |

## Adding an event

1. Check the material: exact recordings of a reporting kind in the window (the query in `listEventPool` plus
   `eventGenreOf`). Without at least one, the Chronik would show an empty event – don't add it yet.
2. Add it to `HISTORY_EVENTS` (oldest first, unique `id`, a one-sentence `summary`, `extra` for show titles
   that only report on this kind of event).
3. Update the table above. For new material, link recordings the usual way (`seed/media-library.json`,
   uploader checks from CLAUDE.md) – the Chronik picks them up by itself.
