import { providerOf, videoIdOf } from "@zdz/core";

const UA = { "User-Agent": "zappen-durch-die-zeit/0.1 (+https://zadudize.de)" };

/**
 * Is a video still there and embeddable? oEmbed for YouTube/Vimeo, the API for Dailymotion,
 * a ranged GET for Internet Archive files. Unknown providers and network trouble count as
 * "available" – a failed check must never block a video by accident.
 */
export async function videoAvailable(url: string): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(10_000);
    switch (providerOf(url)) {
      case "youtube":
        return (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { headers: UA, signal })).ok;
      case "vimeo":
        return (await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, { headers: UA, signal })).ok;
      case "dailymotion": {
        const r = await fetch(`https://api.dailymotion.com/video/${videoIdOf(url)}?fields=allow_embed`, { headers: UA, signal });
        return r.ok && ((await r.json()) as { allow_embed?: boolean }).allow_embed !== false;
      }
      case "archive": {
        const r = await fetch(url.replace("/details/", "/download/"), { headers: { ...UA, Range: "bytes=0-100" }, signal, redirect: "follow" });
        return r.status === 200 || r.status === 206;
      }
      default:
        return true;
    }
  } catch {
    return true;
  }
}
