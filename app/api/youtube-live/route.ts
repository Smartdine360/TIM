import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { DEFAULT_CHANNEL_ID, fetchChannelStatus } from "@/lib/youtube";

// Cached at the CDN so visitors polling every 30s don't each hit YouTube / Blob.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

type LiveResponse = {
  status: "live" | "replay" | "offline";
  embedUrl: string | null;
  title: string;
  previousMessages: Array<{ title: string; embedUrl: string }>;
};

export async function GET() {
  try {
    const settings = await readSettings();
    const channelId = settings.channelId || process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID;

    const { live, streams } = await fetchChannelStatus(channelId);

    // Priority: actually live on YouTube > URL pinned in admin panel > latest past stream.
    let body: LiveResponse;
    if (live) {
      body = { status: "live", embedUrl: live.embedUrl, title: live.title, previousMessages: [] };
    } else if (settings.customLiveUrl) {
      body = { status: "live", embedUrl: settings.customLiveUrl, title: settings.liveTitle, previousMessages: [] };
    } else if (streams[0]) {
      body = { status: "replay", embedUrl: streams[0].embedUrl, title: streams[0].title, previousMessages: [] };
    } else {
      body = { status: "offline", embedUrl: null, title: "", previousMessages: [] };
    }

    const pastStreams = streams.length
      ? streams.map(({ title, embedUrl }) => ({ title, embedUrl }))
      : settings.liveHistory.map(({ title, embedUrl }) => ({ title, embedUrl }));
    body.previousMessages = pastStreams.filter((item) => item.embedUrl !== body.embedUrl).slice(0, 3);

    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json(
      { status: "offline", embedUrl: null, title: "", previousMessages: [] },
      { status: 500 }
    );
  }
}
