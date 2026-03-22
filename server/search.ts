import Groq from "groq-sdk";
import * as cheerio from "cheerio";

/**
 * Performs a web search and uses an LLM to summarize the top results.
 */
export async function performSearch(query: string, groq: Groq): Promise<string> {
  console.log(`[Search] Initiating web search for: "${query}"`);
  
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with status: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: string[] = [];
    
    $('.result__snippet').each((i, el) => {
      if (i < 5) {
        results.push($(el).text().trim());
      }
    });
    
    const rawResults = results.length > 0 ? results.join('\n\n') : "No relevant results found.";

    if (rawResults === "No relevant results found.") {
      console.log("[Search] No results found.");
      return rawResults;
    }

    console.log(`[Search] Found ${results.length} snippets. Summarizing...`);

    // Search Agent: Summarize top 3 snippets
    const summaryResponse = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a Search Agent. Summarize the following web search results into the top 3 most relevant and concise snippets. Do not add conversational filler." },
        { role: "user", content: `Query: ${query}\n\nResults:\n${rawResults}` }
      ],
      max_tokens: 300
    });

    const summary = summaryResponse.choices[0]?.message?.content || rawResults;
    console.log(`[Search] Summary complete (${summary.length} chars).`);
    
    return summary;
  } catch (e) {
    console.error("[Search Error]", e);
    return "Search failed due to a network error.";
  }
}
