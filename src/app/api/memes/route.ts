import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

// Notion config — uses direct fetch, no SDK needed
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Fire-and-forget: save post to Notion Inspiration Posts DB
async function syncToNotion(memeData: {
  text: string | null;
  url: string;
  author: string | null;
  platform: string;
  likes: number;
  retweets: number;
  views: number;
  comments: number;
}) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    console.warn(
      "Notion sync skipped: missing NOTION_API_KEY or NOTION_DATABASE_ID",
    );
    return;
  }

  try {
    const platformMap: Record<string, string> = {
      twitter: "X",
      linkedin: "LinkedIn",
    };

    const properties: Record<string, unknown> = {
      "Post Text": {
        title: [
          {
            text: {
              content: (memeData.text || "Untitled post").substring(0, 2000),
            },
          },
        ],
      },
      Author: {
        rich_text: [
          {
            text: {
              content: (memeData.author || "Unknown").substring(0, 200),
            },
          },
        ],
      },
      Platform: {
        select: { name: platformMap[memeData.platform] || "X" },
      },
      URL: {
        url: memeData.url,
      },
      Likes: { number: memeData.likes },
      Retweets: { number: memeData.retweets },
      Views: { number: memeData.views },
      Comments: { number: memeData.comments },
      "Saved At": {
        date: { start: new Date().toISOString().split("T")[0] },
      },
    };

    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Notion sync failed:", err);
      throw new Error(`Notion API ${response.status}: ${err?.message || JSON.stringify(err)}`);
    } else {
      console.log("Notion sync success");
    }
  } catch (e) {
    console.error("Notion sync error:", e);
    throw e;
  }
}

// CORS headers for extension requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle OPTIONS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Cap metric to a safe range (prevent scraping bugs sending absurd numbers)
function safeMetric(val: unknown): number {
  const n = Number(val) || 0;
  return Math.min(Math.max(n, 0), Number.MAX_SAFE_INTEGER);
}

// POST: Collect a new meme from extension
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received meme data:", body);
    const { text, images, author, url, platform } = body;
    const likes = safeMetric(body.likes);
    const retweets = safeMetric(body.retweets);
    const views = safeMetric(body.views);
    const comments = safeMetric(body.comments);
    const bookmarks = safeMetric(body.bookmarks);

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Insert or update meme
    const { data, error } = await supabase
      .from("memes")
      .upsert(
        {
          url,
          text: text || null,
          images: images || [],
          author: author || null,
          platform: platform || "twitter",
          likes,
          retweets,
          views,
          comments,
          bookmarks,
          collected_at: new Date().toISOString(),
        },
        {
          onConflict: "url",
        },
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    // Await Notion sync so we can surface errors
    let notionStatus = "skipped";
    try {
      const notionResult = await syncToNotion({
        text,
        url,
        author,
        platform,
        likes,
        retweets,
        views,
        comments,
      });
      notionStatus = "success";
    } catch (e: any) {
      notionStatus = `error: ${e?.message || e}`;
      console.error("Notion sync failed:", e);
    }

    console.log("Saved meme:", data);
    return NextResponse.json(
      { success: true, meme: data, notionSync: notionStatus, notionDbId: NOTION_DATABASE_ID?.substring(0, 8) },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Collect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to collect meme" },
      { status: 500, headers: corsHeaders },
    );
  }
}

// GET: Get all collected memes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const analyzed = searchParams.get("analyzed");

    let query = supabase
      .from("memes")
      .select("*")
      .order("collected_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (analyzed === "true") {
      query = query.not("analyzed_at", "is", null);
    } else if (analyzed === "false") {
      query = query.is("analyzed_at", null);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, memes: data, count });
  } catch (error) {
    console.error("Get memes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get memes" },
      { status: 500 },
    );
  }
}
