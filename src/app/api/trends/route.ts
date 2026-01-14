import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

interface TopicTrend {
  topic: string;
  count: number;
  avgLikes: number;
  memeIds: string[];
}

// GET: Get trending topics from analyzed memes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch analyzed memes from the period
    const { data: memes, error } = await supabase
      .from("memes")
      .select("id, topics, likes, retweets, collected_at, humor_type, format")
      .not("analyzed_at", "is", null)
      .gte("collected_at", startDate.toISOString())
      .order("collected_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!memes || memes.length === 0) {
      return NextResponse.json({
        success: true,
        trends: [],
        totalMemes: 0,
        message: "No analyzed memes found for this period",
      });
    }

    // Aggregate topics
    const topicMap = new Map<string, TopicTrend>();

    for (const meme of memes) {
      if (!meme.topics) continue;

      for (const topic of meme.topics) {
        const normalizedTopic = topic.toLowerCase().trim();
        const existing = topicMap.get(normalizedTopic);

        if (existing) {
          existing.count++;
          existing.avgLikes =
            (existing.avgLikes * (existing.count - 1) + (meme.likes || 0)) /
            existing.count;
          existing.memeIds.push(meme.id);
        } else {
          topicMap.set(normalizedTopic, {
            topic: topic,
            count: 1,
            avgLikes: meme.likes || 0,
            memeIds: [meme.id],
          });
        }
      }
    }

    // Sort by count * avgLikes (popularity score)
    const trends = Array.from(topicMap.values())
      .sort(
        (a, b) =>
          b.count * Math.log(b.avgLikes + 1) -
          a.count * Math.log(a.avgLikes + 1)
      )
      .slice(0, 20);

    // Get humor type distribution
    const humorTypes: Record<string, number> = {};
    const formats: Record<string, number> = {};

    for (const meme of memes) {
      if (meme.humor_type) {
        humorTypes[meme.humor_type] = (humorTypes[meme.humor_type] || 0) + 1;
      }
      if (meme.format) {
        formats[meme.format] = (formats[meme.format] || 0) + 1;
      }
    }

    return NextResponse.json({
      success: true,
      trends,
      totalMemes: memes.length,
      period: `Last ${days} days`,
      humorTypes,
      formats,
    });
  } catch (error) {
    console.error("Trends error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get trends" },
      { status: 500 }
    );
  }
}
