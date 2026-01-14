import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types for our database
export interface Meme {
  id: string;
  url: string;
  text: string | null;
  author: string | null;
  platform: string;
  images: string[];
  likes: number;
  retweets: number;
  collected_at: string;
  topics: string[];
  humor_type: string | null;
  format: string | null;
  template: string | null;
  joke_structure: string | null;
  tone: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export interface GeneratedMeme {
  id: string;
  topic: string;
  style: string | null;
  format: string | null;
  template: string | null;
  text_content: string | null;
  image_url: string | null;
  reference_meme_ids: string[];
  created_at: string;
}

export interface MemeTemplate {
  id: string;
  name: string;
  image_url: string;
  text_positions: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}
