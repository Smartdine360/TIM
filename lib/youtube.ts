// Live status and past streams for the YouTube channel.
//
// On the hosted site this uses the official YouTube Data API (YOUTUBE_API_KEY):
// YouTube blocks cloud servers like Vercel from its public pages and feeds
// (feeds return 404, pages return a "confirm you're not a bot" page).
// Without a key (e.g. local dev) it falls back to reading those public pages.

export const DEFAULT_CHANNEL_ID = "UCfOEmJcvrqo61ok8Uo1q0Tg"; // youtube.com/@PastorKalebu

// Responses are cached for this long and shared by all visitors, so the API is
// called about once a minute (~3 quota units each, well under the 10,000/day free quota).
const REVALIDATE_SECONDS = 60;
const API_KEY = process.env.YOUTUBE_API_KEY;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type YoutubeVideo = {
  videoId: string;
  title: string;
  embedUrl: string;
  publishedAt: string;
};

export type ChannelStatus = {
  live: YoutubeVideo | null; // streaming right now
  streams: YoutubeVideo[]; // finished live streams, newest first
};

function embedUrlFor(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

function toVideo(videoId: string, title: string, publishedAt = ""): YoutubeVideo {
  return { videoId, title, embedUrl: embedUrlFor(videoId), publishedAt };
}

export async function fetchChannelStatus(channelId: string): Promise<ChannelStatus> {
  return API_KEY ? fetchViaApi(channelId, API_KEY) : fetchViaPublicPages(channelId);
}

// ---------- YouTube Data API ----------

async function api<T>(path: string, params: Record<string, string>, key: string): Promise<T | null> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!response.ok) {
      console.error(`YouTube API ${path} failed: ${response.status} ${await response.text()}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`YouTube API ${path} failed:`, error);
    return null;
  }
}

async function playlistVideoIds(playlistId: string, max: number, key: string): Promise<string[]> {
  const data = await api<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(
    "playlistItems",
    { part: "contentDetails", playlistId, maxResults: String(max) },
    key
  );
  return (data?.items ?? []).map((item) => item.contentDetails?.videoId ?? "").filter(Boolean);
}

async function fetchViaApi(channelId: string, key: string): Promise<ChannelStatus> {
  const suffix = channelId.replace(/^UC/, "");
  // UULV = the channel's "Live" tab; UU = all uploads (a stream in progress shows at the top).
  const [streamIds, uploadIds] = await Promise.all([
    playlistVideoIds(`UULV${suffix}`, 15, key),
    playlistVideoIds(`UU${suffix}`, 5, key)
  ]);
  const ids = [...new Set([...uploadIds, ...streamIds])];
  if (!ids.length) return { live: null, streams: [] };

  const data = await api<{
    items?: Array<{
      id: string;
      snippet?: { title?: string; publishedAt?: string; liveBroadcastContent?: string };
      liveStreamingDetails?: { actualStartTime?: string };
    }>;
  }>("videos", { part: "snippet,liveStreamingDetails", id: ids.join(","), maxResults: "50" }, key);

  const videos = data?.items ?? [];
  const liveItem = videos.find((video) => video.snippet?.liveBroadcastContent === "live");
  const streamIdSet = new Set(streamIds);

  const streams = videos
    .filter((video) => streamIdSet.has(video.id) && video.snippet?.liveBroadcastContent === "none")
    .map((video) =>
      toVideo(
        video.id,
        video.snippet?.title ?? "",
        video.liveStreamingDetails?.actualStartTime ?? video.snippet?.publishedAt ?? ""
      )
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    live: liveItem ? toVideo(liveItem.id, liveItem.snippet?.title ?? "") : null,
    streams
  };
}

// ---------- Public pages (no key; works locally, blocked on cloud hosts) ----------

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

async function fetchViaPublicPages(channelId: string): Promise<ChannelStatus> {
  const [live, streams] = await Promise.all([fetchLiveFromPage(channelId), fetchStreamsFromFeed(channelId)]);
  return { live, streams };
}

async function fetchStreamsFromFeed(channelId: string): Promise<YoutubeVideo[]> {
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
      return toVideo(videoId, title, publishedAt);
    })
    .filter((video) => video.videoId);
}

// youtube.com/channel/<id>/live also points at scheduled (upcoming) streams, so those are ignored.
async function fetchLiveFromPage(channelId: string): Promise<YoutubeVideo | null> {
  const html = await fetchText(`https://www.youtube.com/channel/${channelId}/live`);
  if (!html) return null;

  const videoId = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
  if (!videoId) return null;

  const isLiveNow = /"isLiveNow":true/.test(html);
  const isUpcoming = /"isUpcoming":true/.test(html);
  if (!isLiveNow && (isUpcoming || !/"isLive":true/.test(html))) return null;

  const title = decodeXml(html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? "");
  return toVideo(videoId, title);
}
