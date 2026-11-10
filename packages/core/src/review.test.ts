import { describe, expect, it } from "vitest";
import { applyUploadReview, withheldUrls, type ReviewGroup, type UploadReviewFile } from "./review";

const group = (id: string, items: ReviewGroup["items"], canInclude = true): ReviewGroup => ({
  id,
  platform: "archive.org",
  source: id,
  sourceUrl: null,
  category: "uploader",
  reason: "",
  activity: "",
  profile: "",
  impact: "",
  canInclude,
  items,
});
const review: UploadReviewFile = {
  about: "",
  groups: [
    group("a", [
      { target: "library", covered: false, entry: { url: "https://x/1", channel: "ard" } },
      { target: "library", covered: true, entry: { url: "https://x/2", channel: "ard" } }, // we have it already
      { target: "interstitial", covered: false, entry: { url: "https://y/1", channel: "zdf" } },
    ]),
    group("b", [{ target: "library", covered: false, entry: { url: "https://x/3" } }], false),
  ],
};
const library = [{ url: "https://lib/1" }];

describe("applyUploadReview", () => {
  it("adds the new items of included groups once, marked with the group", () => {
    const out = applyUploadReview(review, new Set(["a", "b"]), library, []);
    expect(out.library).toEqual([{ url: "https://lib/1" }, { url: "https://x/1", channel: "ard", review: "a" }]);
    expect(out.interstitials).toEqual([{ url: "https://y/1", channel: "zdf", review: "a" }]);
    expect(out.added).toBe(2);
    // Applying again changes nothing.
    const again = applyUploadReview(review, new Set(["a"]), out.library, out.interstitials);
    expect([again.added, again.removed]).toEqual([0, 0]);
    expect(again.library).toEqual(out.library);
  });
  it("removes what a group added once it is no longer included", () => {
    const first = applyUploadReview(review, new Set(["a"]), library, []);
    const out = applyUploadReview(review, new Set(), first.library, first.interstitials);
    expect(out.library).toEqual(library);
    expect(out.interstitials).toEqual([]);
    expect(out.removed).toBe(2);
  });
});

describe("withheldUrls", () => {
  it("lists the items of groups that aren't included, per target", () => {
    expect([...withheldUrls(review, new Set(), "interstitial")]).toEqual(["https://y/1"]);
    expect([...withheldUrls(review, new Set(["a"]), "library")]).toEqual(["https://x/3"]);
  });
});
