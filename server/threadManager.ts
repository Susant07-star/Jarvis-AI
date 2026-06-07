import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { supabase } from "./supabaseClient";

const THREADS_DIR = path.join(process.cwd(), "data", "threads");

// Ensure directory exists for local fallback
if (!fs.existsSync(THREADS_DIR)) {
  fs.mkdirSync(THREADS_DIR, { recursive: true });
}

export interface ThreadMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export class ThreadManager {
  /**
   * Helper to convert text into a 768-dimension vector
   */
  static async getEmbedding(text: string): Promise<number[] | null> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });
      return response.embeddings?.[0]?.values || null;
    } catch (e) {
      logger.error("ThreadManager", "Embedding failed", e);
      return null;
    }
  }

  /**
   * Retrieves the last N messages for a given thread (Short-Term Memory)
   */
  static async getHistory(threadId: string, limit: number = 20): Promise<ThreadMessage[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("memory_store")
          .select("content, metadata")
          .eq("metadata->>thread_id", threadId)
          .order("metadata->>timestamp", { ascending: false })
          .limit(limit);

        if (error) throw error;
        
        if (data && data.length > 0) {
          // Data is descending (newest first). Reverse it for chat history context.
          return data.reverse().map(row => ({
            role: row.metadata?.role || "user",
            content: row.content,
            timestamp: row.metadata?.timestamp
          }));
        }
        return [];
      } catch (err) {
        logger.error("ThreadManager", `Failed to read history from Supabase for ${threadId}`, err);
      }
    }

    // Fallback to local
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const history: ThreadMessage[] = JSON.parse(data);
      return history.slice(-limit);
    } catch (err) {
      return [];
    }
  }

  /**
   * Appends a new message to the thread history and embeds it in the Vector DB (Long-Term Memory)
   */
  static async appendMessage(threadId: string, message: ThreadMessage) {
    if (!message.content || !message.content.trim()) return;

    if (supabase) {
      try {
        const timestamp = message.timestamp || new Date().toISOString();
        const embedding = await this.getEmbedding(message.content);
        
        await supabase
          .from("memory_store")
          .insert({
            content: message.content,
            metadata: {
              thread_id: threadId,
              role: message.role,
              timestamp: timestamp
            },
            embedding: embedding || null
          });
      } catch (err) {
        logger.error("ThreadManager", `Failed to save vector history for ${threadId}`, err);
      }
    }

    // Fallback local backup (keeping rolling window of 100)
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    let localHistory: ThreadMessage[] = [];
    if (fs.existsSync(filePath)) {
      try { localHistory = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch(e){}
    }
    localHistory.push(message);
    if (localHistory.length > 100) localHistory = localHistory.slice(-100);
    fs.writeFileSync(filePath, JSON.stringify(localHistory, null, 2));
  }

  /**
   * Semantic Vector Search: Finds most relevant past memories matching a query
   */
  static async searchMemory(query: string, limit: number = 3): Promise<string[]> {
    if (!supabase || !process.env.GEMINI_API_KEY) return [];
    
    try {
      const queryEmbedding = await this.getEmbedding(query);
      if (!queryEmbedding) return [];

      // Requires Supabase RPC `match_memories`
      const { data, error } = await supabase.rpc('match_memories', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5, // Return memories with > 50% similarity
        match_count: limit
      });

      if (error) {
        logger.warn("ThreadManager", "Vector search RPC failed. Has the SQL script been run?", error);
        return [];
      }

      return data.map((row: any) => `[Past Memory - ${new Date(row.metadata?.timestamp || Date.now()).toLocaleString()}]: ${row.content}`);
    } catch (err) {
      logger.error("ThreadManager", "Search memory failed", err);
      return [];
    }
  }

  /**
   * Clears a thread's history.
   */
  static async clearThread(threadId: string) {
    if (supabase) {
      try {
        await supabase.from("memory_store").delete().eq("metadata->>thread_id", threadId);
      } catch (err) {}
    }

    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    logger.info("ThreadManager", `Cleared thread: ${threadId}`);
  }
}
