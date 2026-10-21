// Reads the channel's live status and past streams straight from YouTube, so no
// API key or quota is needed and nothing has to be entered in the admin panel.

export const DEFAULT_CHANNEL_ID = "UCfOEmJcvrqo61ok8Uo1q0Tg"; // youtube.com/@PastorKalebu

const REVALIDATE_SECONDS = 60;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type YoutubeVideo = {
  videoId: string;
  title: string;
  embedUrl: string;
  publishedAt: string;
};

function embedUrlFor(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      next: { revalidate: REVALIDATE_SECONDS }
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/**
 * Latest live streams (the channel's "Live" tab), newest first. Uses the
 * auto-generated "UULV" playlist feed, falling back to all uploads.
 */
export async function fetchChannelStreams(channelId: string): Promise<YoutubeVideo[]> {
  const suffix = channelId.replace(/^UC/, "");
  const xml =
    (await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULV${suffix}`)) ??
    (await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`));

  if (!xml) return [];

  return xml
    .split("<entry>")
    .slice(1)
    .map((entry) => {
      const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() ?? "";
      const title = decodeXml(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
      const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? "";
      return { videoId, title, embedUrl: embedUrlFor(videoId), publishedAt };
    })
    .filter((video) => video.videoId);
}

/**
 * The stream that is live right now, or null. youtube.com/channel/<id>/live also
 * points at scheduled (upcoming) streams, so those are ignored.
 */
export async function fetchCurrentLive(channelId: string): Promise<YoutubeVideo | null> {
  const html = await fetchText(`https://www.youtube.com/channel/${channelId}/live`);
  if (!html) return null;

  const videoId = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
  if (!videoId) return null;

  const isLiveNow = /"isLiveNow":true/.test(html);
  const isUpcoming = /"isUpcoming":true/.test(html);
  if (!isLiveNow && (isUpcoming || !/"isLive":true/.test(html))) return null;

  const title = decodeXml(html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? "");
  return { videoId, title, embedUrl: embedUrlFor(videoId), publishedAt: "" };
}
