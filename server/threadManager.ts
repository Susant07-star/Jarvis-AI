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
}

export class ThreadManager {
  /**
   * Retrieves the last N messages for a given thread.
   */
  static async getHistory(threadId: string, limit: number = 20): Promise<ThreadMessage[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("memory_store")
          .select("value")
          .eq("key", threadId)
          .single();

        if (error && error.code !== "PGRST116") { // PGRST116 is 'not found'
          logger.error("ThreadManager", `Supabase getHistory error for ${threadId}`, error);
        }
        
        if (data && data.value) {
          const history: ThreadMessage[] = data.value;
          return history.slice(-limit);
        }
        return [];
      } catch (err) {
        logger.error("ThreadManager", `Failed to read history from Supabase for ${threadId}`, err);
      }
    }

    // Fallback to local
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const history: ThreadMessage[] = JSON.parse(data);
      return history.slice(-limit);
    } catch (err) {
      logger.error("ThreadManager", `Failed to read local history for ${threadId}`, err);
      return [];
    }
  }

  /**
   * Appends a new message to the thread history.
   */
  static async appendMessage(threadId: string, message: ThreadMessage) {
    const history = await this.getHistory(threadId, 100); // Keep up to 100 in deep memory
    history.push(message);

    if (supabase) {
      try {
        const { error } = await supabase
          .from("memory_store")
          .upsert({ 
            key: threadId, 
            value: history,
            updated_at: new Date().toISOString()
          });

        if (error) {
          logger.error("ThreadManager", `Supabase save history error for ${threadId}`, error);
        } else {
          return; // Successfully saved to Supabase
        }
      } catch (err) {
        logger.error("ThreadManager", `Failed to save history to Supabase for ${threadId}`, err);
      }
    }

    // Fallback to local
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    } catch (err) {
      logger.error("ThreadManager", `Failed to save local history for ${threadId}`, err);
    }
  }

  /**
   * Clears a thread's history.
   */
  static async clearThread(threadId: string) {
    if (supabase) {
      try {
        await supabase.from("memory_store").delete().eq("key", threadId);
      } catch (err) {
        logger.error("ThreadManager", `Failed to delete from Supabase: ${threadId}`, err);
      }
    }

    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    logger.info("ThreadManager", `Cleared thread: ${threadId}`);
  }
}
