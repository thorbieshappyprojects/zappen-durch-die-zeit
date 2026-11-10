# Sources for German TV schedules of the 1990s – research 9 Nov 2026

Goal: more days (especially 1993–1999) and more channels than tvprogramme.net. fernsehserien.de / wunschliste.de excluded (licence required). All findings are from a research pass; nothing has been harvested yet.

## Summary

1. **ZEFYS / DDR-Presse (Staatsbibliothek zu Berlin)** is by far the best free source: *Berliner Zeitung* up to 31.12.1993 and *Neue Zeit* up to 05.07.1994 (end dates checked), each issue with a daily TV page of ~12 channels. Page images (IIIF, 2400 px), **ALTO full text with word coordinates** and METS download without login; ALTO tags the TV page (`PAGECLASS="FERNSEHEN"`). Yield: ~300 days 1993 (BZ), ~255 days 1993 (NZ, overlapping), ~150 days 1994 (NZ); plus ~900 days per paper for 1990–92 with channels tvprogramme.net lacks (DFF, ORB, B1, VOX, RTL 2, n-tv, 3sat, EinsPlus).
2. **Wayback Machine snapshots of 1997–99 online guides**: structured HTML (no OCR), sparse. Confirmed: SWR Südwest daily pages 1998–99 (~400 channel-days), TV Movie Online `sender.cgi` 1997–99 (~60 channel-days incl. Kabel 1, RTL 2, VOX, MTV, VIVA, Super RTL), TV Today/AOL 1999 (~20 time-slice snapshots of ~70 channels).
3. **archive.org has almost no German TV magazines for 1993–99** (one mislabelled Bild+Funk issue = programme week 19–25.02.1994, film pages only). A few 1990–92 magazine scans exist.
4. **No free bulk source of 1995–99 newspaper/magazine scans** found. Options: licensed (East View *Neues Deutschland*), manual-only (e-newspaperarchives.ch behind Cloudflare), on-site only (Graz). Der Spiegel's weekly "Fernseh-Vorschau" gives 2–4 highlights per day.

## 1. ZEFYS DDR-Presse ★★★★★

- Calendar: `https://zefys.staatsbibliothek-berlin.de/kalender/auswahl/date/YYYY-M-D/26120215` (BZ), `…/2612273X` (NZ). *Neues Deutschland* there ends 03.10.1990.
- Issues Mon–Sat (check Saturday for Sunday's programme).
- Channels: BZ 06.07.1993 p. 28: ARD, ZDF, B1, SAT 1, RTL, EINS PLUS, VOX, n-tv, 3SAT, ORB, PRO 7, RTL 2. NZ 16.05.1994 p. 7: ARD, ZDF, MDR, ORB, SAT.1, RTL, N3, B1, VOX, PRO 7, BAYERN 3, IA.
- Files: METS `https://content.staatsbibliothek-berlin.de/zefys/SNP<ZDB>-<YYYYMMDD>-0-0-0-0.xml`; IIIF image `…-0-<page>-0-0/full/full/0/default.jpg`; ALTO `…-0-<page>-0-0.alto.xml`; per-page PDF.
- Access: plain HTTP GET, no auth (search UI needs login, content server doesn't). TV page via `PAGECLASS`, or count "hh.mm" tokens (230–300 on the TV page, 0–40 elsewhere).
- Rights: METS names the owner only, no licence; newspapers are publisher copyright → use facts only (date, time, channel, title), never republish scans or descriptive text. Ask the library's web editors (contact on staatsbibliothek-berlin.de) before bulk harvesting; keep the request rate low.
- OCR effort low–medium: ALTO text is good (e.g. "14.30 Spuk im Hochhaus, Kinderserie; 15.00 Tagesschau; …", small errors like "Magmim"). Reading order mixes columns → sort by HPOS/VPOS into channel columns anchored on the channel header bars. BZ runs entries together ("6.00 X; 9.00 Y; …"); NZ is a clean 8-column grid plus a 4-column strip.
- Samples:
  - BZ 06.07.1993 p. 28: [image](https://content.staatsbibliothek-berlin.de/zefys/SNP26120215-19930706-0-28-0-0/full/full/0/default.jpg), [ALTO](https://content.staatsbibliothek-berlin.de/zefys/SNP26120215-19930706-0-28-0-0.alto.xml)
  - NZ 16.05.1994 p. 7: [image](https://content.staatsbibliothek-berlin.de/zefys/SNP2612273X-19940516-0-7-0-0/full/full/0/default.jpg), [ALTO](https://content.staatsbibliothek-berlin.de/zefys/SNP2612273X-19940516-0-7-0-0.alto.xml)

## 2. Wayback Machine ★★★☆☆

- CDX: `https://web.archive.org/cdx/search/cdx?url=<host>/*&from=1996&to=1999&filter=statuscode:200&collapse=urlkey&fl=timestamp,original`; raw page: `https://web.archive.org/web/<ts>id_/<url>`. CDX often times out (504) → one host at a time, with pauses.
- SWR Südwest: `www.swr-online.de/tv/suedwest/programm/F3BW<MMDD>.HTML` / `F3RP<MMDD>.HTML`, full day with descriptions, ~400 snapshots 12/1998–11/1999.
- TV Movie Online: `www.tvmovie.de/cgi/sender.cgi?day=xx&p=NN`, one channel-day per page (start/end, title, episode), ~60 channel-days 1997–99.
- TV Today/AOL: `www.tvtoday.de/aol/programm.hbs?...`, ~70 channels per time slice, ~20 snapshots 09–10/1999.
- Unresolved (CDX timeouts, retry slowly): hoerzu.de, prisma-online.de, klack.de, tvtv.de, ard.de, zdf.de, wdr.de, ndr.de, mdr.de, orb.de, 3sat.de, rtl.de, rtl2.de, vox.de, sat1.de, pro7.de, kabel1.de, viva.tv, mtv.de, kinderkanal.de, arte-tv.com, n-tv.de, tvinfo.de, gong.de, funkuhr.de.
- Rights: original publishers; use facts only. Effort: one HTML parser per site template.

## 3. Der Spiegel "Fernseh-Vorschau" ★★☆☆☆

Weekly, 2–4 picks per day with times, channel, title, description (~7,500 entries for 1993–99). OCR'd issues on archive.org (uploader hifi-archiv: 12 from 1991, 13 from 1992, 1 each 1994/1995), e.g. `der-spiegel-1992-nr.-16`. The spiegel.de print archive is free but couldn't be checked automatically.

## 4. archive.org TV magazines ★☆☆☆☆ (for 1993–99)

- `bild-funk-1996-heft-1`: actually week 19–25.02.1994; film pages 27–32 (time, channel, rating), no daily grid. PDF with text layer + higher-res CBZ.
- 1990–92 OCR candidates: `tv-spielfilm-1990-1`, `funk-uhr-tv-programm-0[1-5]-ausgabe-33-07.-august-1992` (single pages, PNG), `alte-tv-zeitschrift-von-1990`, `alt-tv-zeitschrift-von-1990`, `altes-tv-radioprogramm-vom-06.-bis-12.-april-1991`, `alte-tv-programmzeitschrift-sommer-1992`, `radio-tv-programm-15-bis-21-juli-1989` (1–1.8 GB scan ZIPs).
- `ff-dabei-*`: East German listings 1989/90 only. Hör Zu / Gong: 1950s–60s only.

## 5. Licensed / manual / on-site ★★☆☆☆

East View *Neues Deutschland* (1946–2023, licence) — best single print source for 1995–99; e-newspaperarchives.ch (Cloudflare, manual only); eLiechtensteinensia (403 to automation, unverified); Le Temps (robots.txt disallows all); Steiermärkisches Zeitungsarchiv (on site); Tessmann (restricted); Deutsches Zeitungsportal (DDB): dead end for the 1990s.

## 6. Small CC0 / reference ★☆☆☆☆

Wikidata episodes with dates 1993–99 (Das Erste 365, SWR 312, Sat.1 68, ZDF 64 …; dates only), German Wikipedia episode lists (first-broadcast dates), filmportal.de (check terms).

## Checked, low or no yield

Deutsches Rundfunkarchiv (individual requests only), teletext recovery (UK only), GitHub/Zenodo/Kaggle (no historical German EPG data), IFEM/ALM research samples, Usenet, social media.

## Suggested next steps

1. ZEFYS harvester at ≤1 request/s: METS per date → TV page via `PAGECLASS` → column parsing by coordinates. Start with BZ 1993 and NZ 01/1993–07/1994, then 1990–92. Ask SBB first.
2. Slow Wayback CDX retries; parsers for the SWR, TV Movie and TV Today templates.
3. Spiegel Vorschau as a highlights layer for 1995–99.
4. Full 1995–99 coverage needs a licensed archive (East View) or scanning a magazine run ourselves.
