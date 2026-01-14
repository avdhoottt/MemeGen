import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, generateObject } from "ai";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

// Schema for image selection (Step 1)
const imageSelectionSchema = z.object({
  selectedImages: z
    .array(
      z.object({
        imageNumber: z.number().describe("The IMAGE # number"),
        reason: z
          .string()
          .describe("Brief reason why this image works for the topic"),
      })
    )
    .describe("2-3 images that would work best for this topic"),
});

// POST: Generate new memes (IMAGE-FIRST approach)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      topic,
      style = "ironic",
      format = "text-only",
      count = 3, // Reduced default since image-first produces quality over quantity
      customPrompt,
    } = body;

    if (!topic) {
      return NextResponse.json(
        { success: false, error: "Topic is required" },
        { status: 400 }
      );
    }

    // For text-only format, use the simple flow
    if (format === "text-only") {
      return handleTextOnlyGeneration({ topic, style, count, customPrompt });
    }

    // IMAGE-FIRST FLOW for "image" or "both" formats
    console.log(`Image-first generation for topic: "${topic}"`);

    // Fetch memes and filter for those with images in JS (Supabase JSON array filtering is tricky)
    const { data: allMemes } = await supabase
      .from("memes")
      .select("id, images, image_analysis, topics, text")
      .order("collected_at", { ascending: false })
      .limit(50);

    // Filter to only memes with actual images
    const memesWithImages =
      allMemes?.filter(
        (m) => m.images && Array.isArray(m.images) && m.images.length > 0
      ) || [];

    console.log(
      `Found ${memesWithImages.length} memes with images out of ${
        allMemes?.length || 0
      } total`
    );

    if (memesWithImages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No images in collection. Save some memes with images first!",
        },
        { status: 400 }
      );
    }

    // Build image catalog (text descriptions only - cheap!)
    const imagesCatalog: {
      index: number;
      url: string;
      description: string;
      originalText: string;
    }[] = [];
    memesWithImages.forEach((meme) => {
      if (meme.images && meme.images.length > 0) {
        meme.images.forEach((imgUrl: string) => {
          imagesCatalog.push({
            index: imagesCatalog.length + 1,
            url: imgUrl,
            description: meme.image_analysis || meme.text || "No description",
            originalText: meme.text || "",
          });
        });
      }
    });

    const catalogText = imagesCatalog
      .map((img) => `IMAGE #${img.index}: ${img.description}`)
      .join("\n");

    // ===== STEP 1: Select best images (TEXT ONLY - ~500 tokens) =====
    console.log(`Step 1: Selecting from ${imagesCatalog.length} images...`);

    const { object: selection } = await generateObject({
      model: anthropic("claude-3-5-haiku-20241022"), // Cheap model for selection
      schema: imageSelectionSchema,
      prompt: `You're selecting images for memes about "${topic}".

AVAILABLE IMAGES:
${catalogText}

Pick ${Math.min(
        count,
        3
      )} images that would be FUNNIEST for memes about "${topic}".
Think creatively - unexpected image+topic combos are often funnier.
Consider: reaction images, relatable situations, ironic juxtapositions.`,
    });

    if (!selection.selectedImages || selection.selectedImages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not find suitable images for this topic",
        },
        { status: 400 }
      );
    }

    console.log(
      `Selected ${selection.selectedImages.length} images:`,
      selection.selectedImages.map((s) => `#${s.imageNumber}: ${s.reason}`)
    );

    // Get the selected images
    const selectedImages = selection.selectedImages
      .map((sel) => imagesCatalog.find((img) => img.index === sel.imageNumber))
      .filter(Boolean) as typeof imagesCatalog;

    // ===== STEP 2: Generate text for selected images (VISION - focused) =====
    console.log(`Step 2: Writing memes for ${selectedImages.length} images...`);

    const styleHints: Record<string, string> = {
      ironic: "Use irony and contrast to expose contradictions.",
      sarcastic: "Be witty and sharp. Mock with a knowing tone.",
      absurd: "Go over the top. Humor from ridiculousness.",
      relatable: '"So true" energy. Shared experience.',
      observational: "Point out what everyone notices but nobody says.",
      "self-deprecating": "Make fun of yourself/in-group. Humble brag.",
    };

    // Build multimodal content with ONLY the selected images
    const content: Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    > = [];

    // Create a mapping from position (1,2,3) to actual image
    const imagePositionMap = selectedImages.map((img, idx) => ({
      position: idx + 1,
      originalIndex: img.index,
      url: img.url,
      description: img.description,
    }));

    content.push({
      type: "text",
      text: `Write meme text for each of these ${
        selectedImages.length
      } images. Topic: "${topic}"

STYLE: ${style} - ${styleHints[style] || styleHints.ironic}
${customPrompt ? `EXTRA: ${customPrompt}` : ""}

IMAGES I'M SHOWING YOU:
${imagePositionMap
  .map((img) => `Image ${img.position}: ${img.description}`)
  .join("\n")}

RULES:
- Tweet-length (under 280 chars)
- The text should work WITH the image to create the joke
- Be edgy but not offensive
- Insider tech/startup knowledge
- Sentence case, conversational
- Write ONE DIFFERENT meme for EACH image

Format (one for each image):
Image 1:
TEXT: [meme for first image]
---
Image 2:
TEXT: [meme for second image]
---
(etc for each image)`,
    });

    // Add only the selected images
    for (const img of selectedImages) {
      content.push({
        type: "image",
        image: img.url,
      });
    }

    const { text: generatedText } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      messages: [{ role: "user", content }],
    });

    console.log("Raw generated text:", generatedText);

    // Parse results - match each image position to its meme
    const memeBlocks = generatedText
      .split("---")
      .filter((block) => block.trim());

    const generatedMemes = memeBlocks
      .map((block, idx) => {
        const textMatch = block.match(/TEXT:\s*([\s\S]+?)$/m);
        // Try to match "Image 1:", "Image 2:", etc.
        const imageNumMatch = block.match(/Image\s*(\d+)/i);

        let imageUrl: string | null = null;
        let imagePosition: number | null = null;

        if (imageNumMatch) {
          imagePosition = parseInt(imageNumMatch[1]);
          // Map position (1,2,3) to actual image from our selection
          const mappedImage = imagePositionMap.find(
            (m) => m.position === imagePosition
          );
          if (mappedImage) {
            imageUrl = mappedImage.url;
          }
        }

        // Fallback: use the image in order based on block index
        if (!imageUrl && imagePositionMap[idx]) {
          imageUrl = imagePositionMap[idx].url;
          imagePosition = imagePositionMap[idx].position;
        }

        return {
          text: textMatch
            ? textMatch[1].trim()
            : block.replace(/Image\s*\d+:?/i, "").trim(),
          image_suggestion: imagePosition ? `Image ${imagePosition}` : null,
          image_url: imageUrl,
        };
      })
      .filter((m) => m.text && m.image_url); // Only return memes with actual images

    // Save generated memes
    const savedMemes = [];
    for (const meme of generatedMemes) {
      const { data, error } = await supabase
        .from("generated_memes")
        .insert({
          topic,
          style,
          format,
          text_content: meme.text,
          reference_meme_ids: [],
        })
        .select()
        .single();

      if (!error && data) {
        savedMemes.push({
          ...data,
          image_suggestion: meme.image_suggestion,
          image_url: meme.image_url,
        });
      }
    }

    return NextResponse.json({
      success: true,
      memes: generatedMemes,
      savedCount: savedMemes.length,
      imagesConsidered: imagesCatalog.length,
      imagesUsed: selectedImages.length,
      approach: "image-first",
    });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate memes" },
      { status: 500 }
    );
  }
}

// Separate handler for text-only generation (simpler, no images)
async function handleTextOnlyGeneration({
  topic,
  style,
  count,
  customPrompt,
}: {
  topic: string;
  style: string;
  count: number;
  customPrompt?: string;
}) {
  // Fetch style guide
  const { data: guide } = await supabase
    .from("style_guides")
    .select("content")
    .eq("guide_type", "comprehensive")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Fetch a few example memes
  const { data: exampleMemes } = await supabase
    .from("memes")
    .select("text, humor_type, tone")
    .not("analyzed_at", "is", null)
    .limit(5);

  const styleHints: Record<string, string> = {
    ironic: "Use irony and contrast.",
    sarcastic: "Witty and sharp.",
    absurd: "Over the top ridiculous.",
    relatable: "Shared experience energy.",
    observational: "Point out the obvious.",
    "self-deprecating": "Humble brag/self-roast.",
  };

  let context = "";
  if (guide?.content?.humorPatterns) {
    context += `Patterns: ${guide.content.humorPatterns
      .slice(0, 2)
      .map((p: { pattern: string }) => p.pattern)
      .join(", ")}\n`;
  }
  if (exampleMemes && exampleMemes.length > 0) {
    context += `Examples:\n${exampleMemes
      .slice(0, 3)
      .map((m) => `- "${m.text?.slice(0, 80)}..."`)
      .join("\n")}`;
  }

  const { text: generatedText } = await generateText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    prompt: `Generate ${count} viral text-only memes about "${topic}" for tech Twitter.

Style: ${style} - ${styleHints[style] || styleHints.ironic}
${context}
${customPrompt ? `Extra: ${customPrompt}` : ""}

Rules: Under 280 chars. Edgy not offensive. Insider knowledge. No hashtags.

Format each as:
[N]. [meme text]
---`,
  });

  const memes = generatedText
    .split("---")
    .filter((b) => b.trim())
    .map((block) => {
      const match = block.match(/\d+\.\s*([\s\S]+)/);
      return {
        text: match ? match[1].trim() : block.trim(),
        image_suggestion: null,
        image_url: null,
      };
    })
    .filter((m) => m.text);

  // Save
  for (const meme of memes) {
    await supabase.from("generated_memes").insert({
      topic,
      style,
      format: "text-only",
      text_content: meme.text,
      reference_meme_ids: [],
    });
  }

  return NextResponse.json({
    success: true,
    memes,
    savedCount: memes.length,
    approach: "text-only",
  });
}

// GET: Get previously generated memes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const topic = searchParams.get("topic");

    let query = supabase
      .from("generated_memes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (topic) {
      query = query.eq("topic", topic);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, memes: data });
  } catch (error) {
    console.error("Get generated memes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get generated memes" },
      { status: 500 }
    );
  }
}
