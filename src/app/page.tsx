"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";

interface Meme {
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
  analyzed_at: string | null;
}

interface Trend {
  topic: string;
  count: number;
  avgLikes: number;
}

interface GeneratedMeme {
  text: string;
  image_url: string | null;
}

interface SavedMeme {
  id: string;
  text: string;
  image_url: string | null;
  saved_at: string;
  topic: string;
}

const tabs = ["Generate", "Saved", "Collection", "Trends", "Settings"] as const;
type Tab = (typeof tabs)[number];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Generate");
  const [memes, setMemes] = useState<Meme[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedMemes, setGeneratedMemes] = useState<GeneratedMeme[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("ironic");
  const [format, setFormat] = useState("image");
  const [count, setCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [savedMemes, setSavedMemes] = useState<SavedMeme[]>([]);

  const fetchMemes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memes?limit=50");
      const data = await res.json();
      if (data.success) setMemes(data.memes);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchTrends = async () => {
    try {
      const res = await fetch("/api/trends?days=7");
      const data = await res.json();
      if (data.success) setTrends(data.trends);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMemes();
    fetchTrends();
    // Load saved memes from localStorage
    const stored = localStorage.getItem("savedMemes");
    if (stored) {
      try {
        setSavedMemes(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const analyzeAll = async () => {
    const unanalyzed = memes.filter((m) => !m.analyzed_at);
    if (!unanalyzed.length) return;
    setLoading(true);
    try {
      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memeIds: unanalyzed.map((m) => m.id) }),
      });
      fetchMemes();
      fetchTrends();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setGeneratedMemes([]);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, style, format, count }),
      });
      const data = await res.json();
      if (data.success) setGeneratedMemes(data.memes);
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  };

  const copy = async (text: string, i: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const downloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `meme-${index + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Fallback: open in new tab
      window.open(url, "_blank");
    }
  };

  const saveMeme = (meme: GeneratedMeme) => {
    const newSaved: SavedMeme = {
      id: Date.now().toString(),
      text: meme.text,
      image_url: meme.image_url,
      saved_at: new Date().toISOString(),
      topic: topic,
    };
    const updated = [newSaved, ...savedMemes];
    setSavedMemes(updated);
    localStorage.setItem("savedMemes", JSON.stringify(updated));
  };

  const deleteSavedMeme = (id: string) => {
    const updated = savedMemes.filter((m) => m.id !== id);
    setSavedMemes(updated);
    localStorage.setItem("savedMemes", JSON.stringify(updated));
  };

  const isSaved = (meme: GeneratedMeme) => {
    return savedMemes.some(
      (s) => s.text === meme.text && s.image_url === meme.image_url
    );
  };

  const analyzed = memes.filter((m) => m.analyzed_at).length;
  const unanalyzed = memes.length - analyzed;

  return (
    <div className="min-h-screen bg-neutral-950 text-white antialiased">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-neutral-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">meme.gen</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab
                      ? "bg-white text-neutral-950"
                      : "text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
            <button
              onClick={() => signOut()}
              className="text-sm text-neutral-500 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        {/* Generate */}
        {activeTab === "Generate" && (
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="grid lg:grid-cols-2 gap-16">
              {/* Left - Form */}
              <div>
                <p className="text-neutral-500 text-sm mb-2">Create</p>
                <h2 className="text-4xl font-semibold tracking-tight mb-8">
                  Generate new memes
                </h2>

                <div className="space-y-6">
                  {/* Topic */}
                  <div>
                    <label className="block text-sm text-neutral-400 mb-2">
                      Topic
                    </label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="What should the meme be about?"
                      className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-lg focus:outline-none focus:border-white/20 transition-colors placeholder:text-neutral-600"
                    />
                    {trends.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {trends.slice(0, 5).map((t) => (
                          <button
                            key={t.topic}
                            onClick={() => setTopic(t.topic)}
                            className="px-3 py-1 text-xs text-neutral-400 border border-white/[0.08] rounded-full hover:border-white/20 hover:text-white transition-colors"
                          >
                            {t.topic}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Format */}
                  <div>
                    <label className="block text-sm text-neutral-400 mb-2">
                      Output
                    </label>
                    <div className="flex gap-2">
                      {[
                        { id: "text-only", label: "Text only" },
                        { id: "image", label: "With image" },
                        { id: "both", label: "Both" },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setFormat(f.id)}
                          className={`flex-1 py-2.5 text-sm rounded-lg border transition-colors ${
                            format === f.id
                              ? "bg-white text-neutral-950 border-white"
                              : "border-white/[0.08] text-neutral-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style */}
                  <div>
                    <label className="block text-sm text-neutral-400 mb-2">
                      Style
                    </label>
                    <select
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                      className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-lg focus:outline-none focus:border-white/20 transition-colors text-sm appearance-none cursor-pointer"
                    >
                      <option value="ironic">Ironic</option>
                      <option value="sarcastic">Sarcastic</option>
                      <option value="absurd">Absurd</option>
                      <option value="relatable">Relatable</option>
                      <option value="observational">Observational</option>
                      <option value="self-deprecating">Self-deprecating</option>
                    </select>
                  </div>

                  {/* Count */}
                  <div>
                    <label className="block text-sm text-neutral-400 mb-2">
                      Count: {count}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={count}
                      onChange={(e) => setCount(parseInt(e.target.value))}
                      className="w-full accent-white"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={generate}
                    disabled={generating || !topic.trim()}
                    className="w-full py-3.5 bg-white text-neutral-950 font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {generating ? "Generating..." : "Generate"}
                  </button>
                </div>
              </div>

              {/* Right - Results */}
              <div>
                <p className="text-neutral-500 text-sm mb-2">Output</p>
                <h2 className="text-4xl font-semibold tracking-tight mb-8">
                  Results
                </h2>

                {generatedMemes.length > 0 ? (
                  <div className="space-y-4">
                    {generatedMemes.map((meme, i) => (
                      <div
                        key={i}
                        className="p-5 border border-white/[0.08] rounded-xl hover:border-white/[0.15] transition-colors"
                      >
                        {meme.image_url && (
                          <div className="relative group mb-4">
                            <img
                              src={meme.image_url}
                              alt=""
                              className="w-full h-56 object-cover rounded-lg"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-3">
                              <button
                                onClick={() =>
                                  downloadImage(meme.image_url!, i)
                                }
                                className="px-4 py-2 bg-white text-neutral-950 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors"
                              >
                                Download
                              </button>
                              <a
                                href={meme.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 border border-white text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
                              >
                                Open
                              </a>
                            </div>
                          </div>
                        )}
                        <p className="text-neutral-200 leading-relaxed mb-4">
                          {meme.text}
                        </p>
                        <div className="flex gap-4">
                          <button
                            onClick={() => copy(meme.text, i)}
                            className="text-sm text-neutral-500 hover:text-white transition-colors"
                          >
                            {copiedIndex === i ? "Copied" : "Copy text"}
                          </button>
                          {meme.image_url && (
                            <button
                              onClick={() => downloadImage(meme.image_url!, i)}
                              className="text-sm text-neutral-500 hover:text-white transition-colors"
                            >
                              Download image
                            </button>
                          )}
                          <button
                            onClick={() => saveMeme(meme)}
                            disabled={isSaved(meme)}
                            className="text-sm text-neutral-500 hover:text-white transition-colors disabled:text-emerald-500 disabled:cursor-default"
                          >
                            {isSaved(meme) ? "Saved" : "Save"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-64 border border-dashed border-white/[0.08] rounded-xl flex items-center justify-center">
                    <p className="text-neutral-600 text-sm">
                      Generated memes will appear here
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Saved */}
        {activeTab === "Saved" && (
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-neutral-500 text-sm mb-2">Your memes</p>
                <h2 className="text-4xl font-semibold tracking-tight">Saved</h2>
              </div>
              {savedMemes.length > 0 && (
                <p className="text-neutral-500 text-sm">
                  {savedMemes.length} meme{savedMemes.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {savedMemes.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {savedMemes.map((meme) => (
                  <div
                    key={meme.id}
                    className="p-5 border border-white/[0.08] rounded-xl hover:border-white/[0.15] transition-colors"
                  >
                    {meme.image_url && (
                      <div className="relative group mb-4">
                        <img
                          src={meme.image_url}
                          alt=""
                          className="w-full h-48 object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-3">
                          <button
                            onClick={() => downloadImage(meme.image_url!, 0)}
                            className="px-4 py-2 bg-white text-neutral-950 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="text-neutral-200 text-sm leading-relaxed mb-3">
                      {meme.text}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-600">
                        {meme.topic && `${meme.topic} · `}
                        {new Date(meme.saved_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => deleteSavedMeme(meme.id)}
                        className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 border border-dashed border-white/[0.08] rounded-xl flex items-center justify-center">
                <p className="text-neutral-600 text-sm">
                  Generate memes and save them here
                </p>
              </div>
            )}
          </div>
        )}

        {/* Collection */}
        {activeTab === "Collection" && (
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-neutral-500 text-sm mb-2">Library</p>
                <h2 className="text-4xl font-semibold tracking-tight">
                  Your collection
                </h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={fetchMemes}
                  className="px-4 py-2 text-sm border border-white/[0.08] rounded-lg hover:border-white/20 hover:text-white text-neutral-400 transition-colors"
                >
                  {loading ? "Loading..." : "Refresh"}
                </button>
                {unanalyzed > 0 && (
                  <button
                    onClick={analyzeAll}
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-white text-neutral-950 rounded-lg hover:bg-neutral-200 disabled:opacity-50 transition-colors"
                  >
                    Analyze {unanalyzed} memes
                  </button>
                )}
              </div>
            </div>

            <p className="text-neutral-500 text-sm mb-6">
              {analyzed} of {memes.length} analyzed
            </p>

            {memes.length > 0 ? (
              <div className="grid gap-3">
                {memes.map((meme) => (
                  <div
                    key={meme.id}
                    className="p-5 border border-white/[0.06] rounded-xl hover:border-white/[0.12] transition-colors"
                  >
                    <div className="flex gap-5">
                      {meme.images?.[0] && (
                        <img
                          src={meme.images[0]}
                          alt=""
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                          onError={(e) =>
                            ((e.target as HTMLImageElement).style.display =
                              "none")
                          }
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-medium">
                            {meme.author}
                          </span>
                          <span className="text-neutral-600">·</span>
                          <span className="text-xs text-neutral-500">
                            {new Date(meme.collected_at).toLocaleDateString()}
                          </span>
                          {meme.analyzed_at && (
                            <span className="text-xs text-emerald-500">
                              Analyzed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-300 line-clamp-2 mb-2">
                          {meme.text || "No text"}
                        </p>
                        {meme.topics?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {meme.topics.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 text-xs text-neutral-500 bg-white/[0.04] rounded"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <a
                        href={meme.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-neutral-600 hover:text-white transition-colors self-start"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 border border-dashed border-white/[0.08] rounded-xl flex items-center justify-center">
                <p className="text-neutral-600 text-sm">
                  No memes yet. Use the extension to collect some.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Trends */}
        {activeTab === "Trends" && (
          <div className="max-w-3xl mx-auto px-6 py-12">
            <p className="text-neutral-500 text-sm mb-2">Analytics</p>
            <h2 className="text-4xl font-semibold tracking-tight mb-8">
              Trending topics
            </h2>

            {trends.length > 0 ? (
              <div className="space-y-2">
                {trends.map((trend, i) => (
                  <div
                    key={trend.topic}
                    className="flex items-center gap-6 p-5 border border-white/[0.06] rounded-xl hover:border-white/[0.12] transition-colors group"
                  >
                    <span className="text-2xl font-light text-neutral-600 w-8">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{trend.topic}</h3>
                      <p className="text-sm text-neutral-500">
                        {trend.count} memes · {Math.round(trend.avgLikes)} avg
                        likes
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setTopic(trend.topic);
                        setActiveTab("Generate");
                      }}
                      className="text-sm text-neutral-600 hover:text-white transition-colors"
                    >
                      Use topic →
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 border border-dashed border-white/[0.08] rounded-xl flex items-center justify-center">
                <p className="text-neutral-600 text-sm">
                  Analyze memes to see trends
                </p>
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {activeTab === "Settings" && <SettingsPanel />}
      </main>
    </div>
  );
}

function SettingsPanel() {
  const [styleGuide, setStyleGuide] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/style-guide")
      .then((r) => r.json())
      .then((d) => d.success && d.guide && setStyleGuide(d.guide))
      .catch(console.error);
  }, []);

  const generate = async () => {
    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/style-guide", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStyleGuide(data.guide);
        setMessage(`Generated from ${data.memeCount} memes`);
      } else {
        setMessage(data.error || "Failed");
      }
    } catch {
      setMessage("Failed to generate");
    }
    setGenerating(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <p className="text-neutral-500 text-sm mb-2">Configuration</p>
      <h2 className="text-4xl font-semibold tracking-tight mb-8">Settings</h2>

      <div className="space-y-6">
        {/* Style Guide */}
        <div className="p-6 border border-white/[0.08] rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-medium mb-1">Style Guide</h3>
              <p className="text-sm text-neutral-500">
                Reduces token usage by ~70%
              </p>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="px-4 py-2 text-sm bg-white text-neutral-950 rounded-lg hover:bg-neutral-200 disabled:opacity-50 transition-colors"
            >
              {generating
                ? "Generating..."
                : styleGuide
                ? "Regenerate"
                : "Generate"}
            </button>
          </div>

          {message && (
            <p className="text-sm text-neutral-400 mb-3">{message}</p>
          )}

          {styleGuide ? (
            <div className="text-sm text-neutral-400">
              <p className="mb-2">
                Based on{" "}
                <span className="text-white">{styleGuide.meme_count}</span>{" "}
                memes
              </p>
              {styleGuide.content?.topTopics && (
                <div className="flex flex-wrap gap-1.5">
                  {styleGuide.content.topTopics.slice(0, 5).map((t: any) => (
                    <span
                      key={t.topic}
                      className="px-2 py-1 bg-white/[0.04] rounded text-xs"
                    >
                      {t.topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              No style guide generated yet
            </p>
          )}
        </div>

        {/* API */}
        <div className="p-6 border border-white/[0.08] rounded-xl">
          <h3 className="font-medium mb-1">API Key</h3>
          <p className="text-sm text-neutral-500 mb-3">
            Set in .env.local file
          </p>
          <code className="block px-4 py-3 bg-white/[0.03] rounded-lg text-xs text-neutral-400 font-mono">
            ANTHROPIC_API_KEY=sk-ant-...
          </code>
        </div>

        {/* Extension */}
        <div className="p-6 border border-white/[0.08] rounded-xl">
          <h3 className="font-medium mb-1">Chrome Extension</h3>
          <p className="text-sm text-neutral-500">
            Sends collected memes to POST /api/memes
          </p>
        </div>
      </div>
    </div>
  );
}
