import { describe, expect, it } from "vitest";
import { isEmbeddable, providerOf, videoIdOf, youtubeVideoId } from "./providers";

describe("providers", () => {
  it("detects providers by host", () => {
    expect(providerOf("https://www.youtube.com/watch?v=L9j0jrUADG0")).toBe("youtube");
    expect(providerOf("https://www.zdf.de/video/serien/x")).toBe("zdf");
    expect(providerOf("https://example.org/")).toBe("other");
  });
  it("extracts YouTube ids", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=L9j0jrUADG0&t=5")).toBe("L9j0jrUADG0");
    expect(youtubeVideoId("https://youtu.be/L9j0jrUADG0")).toBe("L9j0jrUADG0");
    expect(youtubeVideoId("https://www.youtube-nocookie.com/embed/L9j0jrUADG0")).toBe("L9j0jrUADG0");
    expect(youtubeVideoId("https://www.youtube.com/results?search_query=x")).toBeNull();
    expect(youtubeVideoId("https://www.zdf.de/video/x")).toBeNull();
  });
});

describe("videoIdOf", () => {
  it("extracts Dailymotion ids", () => {
    expect(videoIdOf("https://www.dailymotion.com/video/x8rg5ce")).toBe("x8rg5ce");
    expect(videoIdOf("https://www.dailymotion.com/embed/video/x8rg5ce?autoplay=1")).toBe("x8rg5ce");
    expect(videoIdOf("https://dai.ly/x8rg5ce")).toBe("x8rg5ce");
  });
  it("extracts Vimeo ids", () => {
    expect(videoIdOf("https://vimeo.com/76979871")).toBe("76979871");
    expect(videoIdOf("https://player.vimeo.com/video/76979871")).toBe("76979871");
  });
  it("requires a playable file for archive.org", () => {
    const item = "tagesschau-20-clock-evening-news-1991-03-13";
    expect(videoIdOf(`https://archive.org/details/${item}/${item}.mp4`)).toBe(`${item}/${item}.mp4`);
    expect(videoIdOf(`https://archive.org/download/${item}/${item}.mp4`)).toBe(`${item}/${item}.mp4`);
    expect(videoIdOf(`https://archive.org/details/${item}`)).toBeNull();
    expect(isEmbeddable(`https://archive.org/details/${item}`)).toBe(false);
  });
  it("leaves Mediathek links as link-outs", () => {
    expect(isEmbeddable("https://www.zdf.de/video/serien/x")).toBe(false);
    expect(isEmbeddable("https://www.youtube.com/watch?v=L9j0jrUADG0")).toBe(true);
  });
});
