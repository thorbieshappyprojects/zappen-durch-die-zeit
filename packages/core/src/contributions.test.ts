import { describe, expect, it } from "vitest";
import { classifySubmission, parseScheduleText, spamReasons, validateContribution, validateSubmission, type ContributionInput } from "./contributions";

const video: ContributionInput = {
  kind: "video_link",
  tvDate: "1997-12-01",
  channel: "rtl-plus",
  start: "20:15",
  title: "Die Feuerengel",
  url: "https://www.youtube.com/watch?v=2yZq3_ynz1E",
};

describe("validateContribution", () => {
  it("accepts a complete video link", () => {
    expect(validateContribution(video)).toEqual({ ok: true, errors: [] });
  });
  it("rejects unknown platforms and missing fields", () => {
    const r = validateContribution({ ...video, url: "https://example.com/video.mp4", start: "abends" });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
  });
  it("accepts Mediathek links as link-outs", () => {
    expect(validateContribution({ ...video, url: "https://www.zdf.de/video/serien/x" }).ok).toBe(true);
  });
  it("requires at least three schedule lines and a source", () => {
    const r = validateContribution({ kind: "schedule", tvDate: "1998-11-20", channel: "vox", body: "20:15 Film" });
    expect(r.errors).toEqual([
      "Bitte mindestens drei Sendungen im Format „HH:MM Titel“ eintragen oder ein Foto/PDF der Programmseite anhängen.",
      "Bitte die Quelle angeben (z. B. „HÖRZU 47/1998“).",
    ]);
  });
  it("accepts a schedule given only as an attached photo", () => {
    expect(validateContribution({ kind: "schedule", tvDate: "1998-11-20", channel: "vox", sourceInfo: "HÖRZU 47/1998", attachments: 1 }).ok).toBe(true);
  });
  it("checks dates, email and lengths", () => {
    const r = validateContribution({ kind: "note", body: "kurz", tvDate: "2026-01-01", contributorEmail: "nope" });
    expect(r.errors).toHaveLength(3);
  });
});

describe("spamReasons", () => {
  it("passes a normal submission", () => {
    expect(spamReasons(video, { fillSeconds: 30 })).toEqual([]);
  });
  it("flags honeypot, speed, links, spam words and markup", () => {
    const body = "Best casino https://a.b https://c.d https://e.f https://g.h https://i.j https://k.l <a href=x>";
    expect(spamReasons({ kind: "note", body }, { honeypot: "x", fillSeconds: 1 }).sort()).toEqual(
      ["honeypot", "markup", "spam-words", "too-fast", "too-many-links"].sort(),
    );
  });
  it("rejects missing or stale form tokens", () => {
    expect(spamReasons(video, {})).toContain("too-fast");
    expect(spamReasons(video, { fillSeconds: 2 * 24 * 3600 })).toContain("stale-form");
  });
});

describe("parseScheduleText", () => {
  it("parses common listing formats and attaches continuation lines", () => {
    const { entries, skipped } = parseScheduleText(
      ["Programm VOX", "18.15 Uhr Kochduell", "20:15 Tatort – Kolportage", "mit Michael Janisch", "9:05 Frühstück | Magazin"].join("\n"),
    );
    expect(skipped).toBe(1);
    expect(entries).toEqual([
      { start: "18:15", startMin: 1095, title: "Kochduell", description: null },
      { start: "20:15", startMin: 1215, title: "Tatort", description: "Kolportage · mit Michael Janisch" },
      { start: "09:05", startMin: 545, title: "Frühstück", description: "Magazin" },
    ]);
  });
});

describe("classifySubmission", () => {
  const ctx = { tvDate: "1997-12-01", channel: "vox", start: "20:15", title: "Tödliche Lüge" };
  it("detects a video link anywhere in the text", () => {
    const c = classifySubmission("Hab den Film gefunden: https://www.youtube.com/watch?v=abcdefghijk.", 0, ctx);
    expect(c).toMatchObject({ kind: "video_link", url: "https://www.youtube.com/watch?v=abcdefghijk", channel: "vox", start: "20:15" });
  });
  it("ignores links to other sites", () => {
    expect(classifySubmission("Siehe https://example.com/seite", 0).kind).toBe("note");
  });
  it("detects a pasted schedule, even with links in it", () => {
    const text = "06:00 Frühstücksfernsehen\n09:00 Vera am Mittag\n20:15 Film https://www.youtube.com/watch?v=abcdefghijk\n22:00 Talk";
    expect(classifySubmission(text, 0).kind).toBe("schedule");
  });
  it("treats files with little or no text as a schedule (photo of a TV guide)", () => {
    expect(classifySubmission("", 2).kind).toBe("schedule");
    expect(classifySubmission("HÖRZU 47/1998, Seite 12", 1).kind).toBe("schedule");
  });
  it("falls back to a note", () => {
    expect(classifySubmission("Die Tagesschau lief damals schon um 20 Uhr.", 0).kind).toBe("note");
  });
});

describe("interstitial suggestions", () => {
  it("marks links that mention an announcer, sign-off or ident", () => {
    const link = "https://www.youtube.com/watch?v=abcdefghijk";
    expect(classifySubmission(`ARD Ansagerin 1991 ${link}`, 0).suggestedKind).toBe("announcer");
    expect(classifySubmission(`ZDF Sendeschluss mit Nationalhymne ${link}`, 0).suggestedKind).toBe("sign_off");
    expect(classifySubmission(`Mainzelmännchen ${link}`, 0).suggestedKind).toBe("ident");
    expect(classifySubmission(`Die ganze Folge ${link}`, 0).suggestedKind).toBeUndefined();
  });
});

describe("validateSubmission", () => {
  it("only needs some text or a file", () => {
    expect(validateSubmission({ kind: "note", body: "ok!" }).ok).toBe(true);
    expect(validateSubmission({ kind: "schedule", attachments: 1 }).ok).toBe(true);
    expect(validateSubmission({ kind: "note", body: "" }).errors).toEqual(["Bitte etwas eintragen oder eine Datei anhängen."]);
    expect(validateSubmission({ kind: "note", body: "Hallo", contributorEmail: "x" }).ok).toBe(false);
  });
});
