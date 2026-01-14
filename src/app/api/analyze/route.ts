import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

// Create a searchable text representation of the meme analysis
function createSearchableText(meme: any, analysis: any): string {
  const parts = [
    meme.text || "",
    analysis.topics?.join(" ") || "",
    analysis.humor_type || "",
    analysis.format || "",
    analysis.template || "",
    analysis.joke_structure || "",
    analysis.tone || "",
    analysis.image_description || "",
    analysis.why_funny || "",
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

const analysisSchema = z.object({
  topics: z
    .array(z.string())
    .describe(
      'Main topics/themes of the meme (e.g., "VCs", "AI", "founders", "startups")'
    ),
  humor_type: z
    .enum([
      "ironic",
      "sarcastic",
      "absurd",
      "relatable",
      "observational",
      "self-deprecating",
      "dark",
      "wholesome",
    ])
    .describe("The type of humor used"),
  format: z
    .enum(["text-only", "image-meme", "screenshot", "quote-tweet", "thread"])
    .describe("The format of the meme"),
  template: z
    .string()
    .nullable()
    .describe(
      'If it uses a known meme template (e.g., "Drake", "Expanding Brain"), otherwise null'
    ),
  joke_structure: z
    .string()
    .describe(
      'How the joke works (e.g., "contrast/hypocrisy", "subverted expectations", "relatable exaggeration")'
    ),
  tone: z
    .enum([
      "playful",
      "cynical",
      "deadpan",
      "enthusiastic",
      "frustrated",
      "confused",
    ])
    .describe("The overall tone"),
  image_description: z
    .string()
    .nullable()
    .describe(
      "Detailed description of the image content and how it relates to the humor. Null if no image."
    ),
  why_funny: z
    .string()
    .describe(
      "Explain specifically why this meme is funny, what makes it work, and what cultural context makes it resonate"
    ),
});

// POST: Analyze a single meme or batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { memeIds } = body;

    if (!memeIds || !Array.isArray(memeIds) || memeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "memeIds array is required" },
        { status: 400 }
      );
    }

    // Fetch memes to analyze
    const { data: memes, error: fetchError } = await supabase
      .from("memes")
      .select("*")
      .in("id", memeIds);

    if (fetchError || !memes) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch memes" },
        { status: 500 }
      );
    }

    const results = [];

    for (const meme of memes) {
      try {
        // Build multimodal content for Claude vision
        const messages: any[] = [];
        const content: any[] = [];

        // Add text context
        let textContext = `Analyze this meme/post from ${
          meme.platform === "twitter" ? "X (Twitter)" : "LinkedIn"
        }:\n\n`;

        if (meme.text) {
          textContext += `Tweet text: "${meme.text}"\n`;
        }

        if (meme.author) {
          textContext += `Author: ${meme.author}\n`;
        }

        textContext += `\nAnalyze the humor, topics, and structure. If there's an image, describe what's in it and how the text + image work together to create the joke. Be specific about why it's funny.`;

        content.push({ type: "text", text: textContext });

        // Add images if present (Claude vision)
        if (meme.images && meme.images.length > 0) {
          for (const imageUrl of meme.images) {
            content.push({
              type: "image",
              image: imageUrl,
            });
          }
        }

        const { object: analysis } = await generateObject({
          model: anthropic("claude-3-5-haiku-20241022"),
          schema: analysisSchema,
          messages: [{ role: "user", content }],
        });

        // Create searchable text for this meme
        const searchableText = createSearchableText(meme, analysis);

        // Update meme with analysis including image description and searchable text
        const { error: updateError } = await supabase
          .from("memes")
          .update({
            topics: analysis.topics,
            humor_type: analysis.humor_type,
            format: analysis.format,
            template: analysis.template,
            joke_structure: analysis.joke_structure,
            tone: analysis.tone,
            image_analysis: analysis.image_description,
            searchable_text: searchableText,
            analyzed_at: new Date().toISOString(),
          })
          .eq("id", meme.id);

        if (updateError) {
          results.push({
            id: meme.id,
            success: false,
            error: updateError.message,
          });
        } else {
          results.push({ id: meme.id, success: true, analysis });
        }
      } catch (analyzeError) {
        console.error(`Failed to analyze meme ${meme.id}:`, analyzeError);
        results.push({ id: meme.id, success: false, error: "Analysis failed" });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: true,
      message: `Analyzed ${successCount}/${memes.length} memes`,
      results,
    });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze memes" },
      { status: 500 }
    );
  }
}
