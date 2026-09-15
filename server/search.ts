import Groq from "groq-sdk";
import * as cheerio from "cheerio";
import { logger } from "./logger";

/**
 * Key Rotation Helper: Picks a random key from a comma-separated string
 */
function getRotatedKey(keyString: string | undefined): string | null {
  if (!keyString) return null;
  const keys = keyString.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

/**
 * Performs a high-precision research task with triple fallback.
 */
export async function performSearch(query: string, groq: Groq): Promise<string> {
  logger.info("Search", `[NEURAL] Initiating high-precision search for: "${query}"`);
  
  // 1. Try Tavily (Primary - AI Optimized)
  const tavilyKey = getRotatedKey(process.env.TAVILY_API_KEY);
  if (tavilyKey) {
    try {
      logger.info("Search", "[TRY] Tavily AI Research Engine");
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query,
          search_depth: "basic",
          include_answer: false,
          max_results: 3 // Token Optimization: only top 3
        })
      });
      if (response.ok) {
        const data = await response.json();
        const results = data.results.map((r: any) => `[${r.title}](${r.url}): ${r.content}`).join("\n\n");
        logger.info("Search", "[SUCCESS] Tavily AI results acquired.");
        return await summarizeResults(query, results, groq);
      }
    } catch (e: any) {
      logger.warn("Search", `Tavily failed: ${e.message}. Falling back...`);
    }
  }

  // 2. Try SerpAPI (Secondary - Google Search)
  const serpKey = getRotatedKey(process.env.SERPAPI_API_KEY);
  if (serpKey) {
    try {
      logger.info("Search", "[TRY] SerpAPI Google Search Engine");
      const response = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpKey}`);
      if (response.ok) {
        const data = await response.json();
        const snippets = data.organic_results?.slice(0, 3).map((r: any) => r.snippet).join("\n\n");
        if (snippets) {
          logger.info("Search", "[SUCCESS] SerpAPI Google results acquired.");
          return await summarizeResults(query, snippets, groq);
        }
      }
    } catch (e: any) {
      logger.warn("Search", `SerpAPI failed: ${e.message}. Falling back...`);
    }
  }

  // 3. Try DuckDuckGo (Tertiary - Scraper Fallback)
  try {
    logger.info("Search", "[TRY] DuckDuckGo (Free Fallback)");
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);
      const results: string[] = [];
      $('.result__snippet').each((i, el) => { if (i < 3) results.push($(el).text().trim()); });
      if (results.length > 0) {
        logger.info("Search", "[SUCCESS] DuckDuckGo results acquired.");
        return await summarizeResults(query, results.join("\n\n"), groq);
      }
    }
  } catch (e: any) {
    logger.error("Search", `[FATAL] All search engines failed: ${e.message}`);
  }

  return "I apologize Boss, but I'm having trouble accessing my internet uplink at the moment.";
}

/**
 * Token-optimized summarization
 */
async function summarizeResults(query: string, results: string, groq: Groq): Promise<string> {
  const summaryResponse = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant", // High speed, low token cost
    messages: [
      { role: "system", content: "Summarize search results into 3 bullet points. Be extremely concise. JARVIS style." },
      { role: "user", content: `Query: ${query}\n\nData:\n${results}` }
    ],
    max_tokens: 200 // Hard limit for token efficiency
  });
  return summaryResponse.choices[0]?.message?.content || results;
}
