import { NextResponse } from "next/server";
import { DEFAULT_CHANNEL_ID, fetchPopularSongs } from "@/lib/youtube";

// Song rankings change slowly; cache at the CDN for an hour.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

export async function GET() {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID;
    const songs = await fetchPopularSongs(channelId);
    return NextResponse.json(
      { songs: songs.map(({ title, embedUrl }) => ({ title, embedUrl })) },
      { headers: CACHE_HEADERS }
    );
  } catch {
    return NextResponse.json({ songs: [] }, { status: 500 });
  }
}
