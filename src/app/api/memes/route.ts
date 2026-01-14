import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

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

// POST: Collect a new meme from extension
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received meme data:", body);
    const { text, images, author, url, platform, likes, retweets } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400, headers: corsHeaders }
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
          likes: likes || 0,
          retweets: retweets || 0,
          collected_at: new Date().toISOString(),
        },
        {
          onConflict: "url",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    console.log("Saved meme:", data);
    return NextResponse.json(
      { success: true, meme: data },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Collect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to collect meme" },
      { status: 500, headers: corsHeaders }
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
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, memes: data, count });
  } catch (error) {
    console.error("Get memes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get memes" },
      { status: 500 }
    );
  }
}
