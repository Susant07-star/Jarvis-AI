import { supabase } from "./supabaseClient";
import { ThreadManager } from "./threadManager";
import { logger } from "./logger";

export class KnowledgeManager {
  /**
   * Saves a document or note to the long-term knowledge base.
   */
  static async saveKnowledge(title: string, content: string, tags: string[] = []): Promise<boolean> {
    if (!supabase) {
      logger.error("KnowledgeManager", "Supabase is not configured.");
      return false;
    }

    try {
      const embedding = await ThreadManager.getEmbedding(content);
      if (!embedding) {
        logger.error("KnowledgeManager", "Failed to generate embedding for knowledge.");
        return false;
      }

      const { error } = await supabase.from("knowledge_base").insert({
        title,
        content,
        tags,
        embedding
      });

      if (error) {
        logger.error("KnowledgeManager", `Database error saving knowledge: ${error.message}`);
        return false;
      }

      logger.info("KnowledgeManager", `Saved knowledge: "${title}"`);
      return true;
    } catch (err: any) {
      logger.error("KnowledgeManager", `Failed to save knowledge: ${err.message}`);
      return false;
    }
  }

  /**
   * Searches the knowledge base using semantic vector search.
   */
  static async searchKnowledge(query: string, limit: number = 3): Promise<string> {
    if (!supabase) {
      return "System Error: Knowledge base (Supabase) is disconnected.";
    }

    try {
      const queryEmbedding = await ThreadManager.getEmbedding(query);
      if (!queryEmbedding) {
        return "System Error: Failed to generate search embedding.";
      }

      const { data, error } = await supabase.rpc("match_knowledge", {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: limit
      });

      if (error) {
        logger.error("KnowledgeManager", `Vector search failed: ${error.message}`);
        return "Failed to search the knowledge base. The database function might be missing.";
      }

      if (!data || data.length === 0) {
        return "No relevant information found in the knowledge base.";
      }

      const results = data.map((row: any) => {
        return `[Match Score: ${Math.round(row.similarity * 100)}%] Title: ${row.title}\nTags: ${row.tags ? row.tags.join(', ') : 'none'}\nContent: ${row.content}`;
      });

      return `Knowledge Base Results:\n\n${results.join("\n\n---\n\n")}`;
    } catch (err: any) {
      logger.error("KnowledgeManager", `Search knowledge failed: ${err.message}`);
      return "An error occurred while searching the knowledge base.";
    }
  }
}
