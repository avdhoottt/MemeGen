import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

const styleGuideSchema = z.object({
  topTopics: z
    .array(
      z.object({
        topic: z.string(),
        count: z.number(),
        relatedTopics: z.array(z.string()),
      })
    )
    .describe("Top topics found in the memes with related subtopics"),

  humorPatterns: z
    .array(
      z.object({
        pattern: z.string(),
        description: z.string(),
        example: z.string(),
        effectiveness: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("Common humor patterns that work well"),

  toneGuidelines: z
    .array(
      z.object({
        tone: z.string(),
        whenToUse: z.string(),
        examplePhrasing: z.string(),
      })
    )
    .describe("Tone guidelines based on what performs well"),

  imageGuidelines: z
    .object({
      preferredFormats: z.array(z.string()),
      effectiveImageTypes: z.array(z.string()),
      textImageRelationship: z.string(),
    })
    .describe("Guidelines for using images effectively"),

  writingStyle: z
    .object({
      sentenceLength: z.string(),
      punctuationStyle: z.string(),
      capitalization: z.string(),
      commonPhrases: z.array(z.string()),
    })
    .describe("Writing style patterns that work"),

  doAndDont: z
    .object({
      do: z.array(z.string()),
      dont: z.array(z.string()),
    })
    .describe("Quick reference do's and don'ts"),
});

// GET: Retrieve current style guide
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guideType = searchParams.get("type") || "comprehensive";

    const { data: guide, error } = await supabase
      .from("style_guides")
      .select("*")
      .eq("guide_type", guideType)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json(
        { success: false, error: "Failed to fetch style guide" },
        { status: 500 }
      );
    }

    if (!guide) {
      return NextResponse.json({
        success: true,
        guide: null,
        message: "No style guide generated yet. POST to generate one.",
      });
    }

    return NextResponse.json({
      success: true,
      guide,
    });
  } catch (error) {
    console.error("Style guide fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch style guide" },
      { status: 500 }
    );
  }
}

// POST: Generate or update style guide from all analyzed memes
export async function POST(request: NextRequest) {
  try {
    // Fetch all analyzed memes
    const { data: memes, error: fetchError } = await supabase
      .from("memes")
      .select("*")
      .not("analyzed_at", "is", null)
      .order("collected_at", { ascending: false });

    if (fetchError || !memes || memes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No analyzed memes found. Analyze some memes first.",
        },
        { status: 400 }
      );
    }

    // Build a condensed summary of all memes for analysis
    const memeSummaries = memes
      .map((m, i) => {
        return `[${i + 1}] ${m.text?.slice(0, 100) || "No text"}... | Topics: ${
          m.topics?.join(", ") || "none"
        } | Humor: ${m.humor_type || "unknown"} | Tone: ${
          m.tone || "unknown"
        } | Structure: ${m.joke_structure || "unknown"} | Image: ${
          m.image_analysis?.slice(0, 50) || "none"
        }`;
      })
      .join("\n");

    // Count statistics
    const topicCounts: Record<string, number> = {};
    const humorCounts: Record<string, number> = {};
    const toneCounts: Record<string, number> = {};
    const formatCounts: Record<string, number> = {};

    memes.forEach((m) => {
      m.topics?.forEach((t: string) => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
      if (m.humor_type)
        humorCounts[m.humor_type] = (humorCounts[m.humor_type] || 0) + 1;
      if (m.tone) toneCounts[m.tone] = (toneCounts[m.tone] || 0) + 1;
      if (m.format) formatCounts[m.format] = (formatCounts[m.format] || 0) + 1;
    });

    const sortedTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const sortedHumor = Object.entries(humorCounts).sort((a, b) => b[1] - a[1]);
    const sortedTones = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]);

    const statsContext = `
STATISTICS FROM ${memes.length} ANALYZED MEMES:

Top Topics: ${sortedTopics.map(([t, c]) => `${t}(${c})`).join(", ")}
Humor Types: ${sortedHumor.map(([t, c]) => `${t}(${c})`).join(", ")}
Tones: ${sortedTones.map(([t, c]) => `${t}(${c})`).join(", ")}
Formats: ${Object.entries(formatCounts)
      .map(([t, c]) => `${t}(${c})`)
      .join(", ")}

MEME EXAMPLES:
${memeSummaries}
`;

    console.log(`Generating style guide from ${memes.length} memes...`);

    const { object: styleGuide } = await generateObject({
      model: anthropic("claude-3-5-haiku-20241022"),
      schema: styleGuideSchema,
      prompt: `You are a meme analysis expert. Based on this collection of analyzed memes, create a comprehensive style guide that captures what makes these memes work. Extract patterns, common themes, and guidelines for creating similar content.

${statsContext}

Create a detailed style guide that someone could use to create memes in this same style without seeing all the original memes. Focus on:
1. What topics resonate most
2. What humor patterns work best
3. How to structure jokes effectively
4. Tone and voice guidelines
5. Image usage patterns
6. Common do's and don'ts`,
    });

    // Save the style guide
    const { data: savedGuide, error: saveError } = await supabase
      .from("style_guides")
      .insert({
        guide_type: "comprehensive",
        content: styleGuide,
        meme_count: memes.length,
        topics: sortedTopics.map(([t]) => t),
        humor_patterns: sortedHumor.map(([h]) => h),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save style guide:", saveError);
      return NextResponse.json({
        success: true,
        guide: styleGuide,
        saved: false,
        message: "Style guide generated but failed to save",
      });
    }

    return NextResponse.json({
      success: true,
      guide: savedGuide,
      memeCount: memes.length,
      message: `Style guide generated from ${memes.length} analyzed memes`,
    });
  } catch (error) {
    console.error("Style guide generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate style guide" },
      { status: 500 }
    );
  }
}
