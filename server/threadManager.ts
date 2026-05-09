import fs from "fs";
import path from "path";
import { logger } from "./logger";

const THREADS_DIR = path.join(process.cwd(), "data", "threads");

// Ensure directory exists
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
  static getHistory(threadId: string, limit: number = 20): ThreadMessage[] {
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const history: ThreadMessage[] = JSON.parse(data);
      return history.slice(-limit);
    } catch (err) {
      logger.error("ThreadManager", `Failed to read history for ${threadId}`, err);
      return [];
    }
  }

  /**
   * Appends a new message to the thread history.
   */
  static appendMessage(threadId: string, message: ThreadMessage) {
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    const history = this.getHistory(threadId, 100); // Keep up to 100 in file for deep memory
    
    history.push(message);

    try {
      fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    } catch (err) {
      logger.error("ThreadManager", `Failed to save history for ${threadId}`, err);
    }
  }

  /**
   * Clears a thread's history.
   */
  static clearThread(threadId: string) {
    const filePath = path.join(THREADS_DIR, `${threadId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info("ThreadManager", `Cleared thread: ${threadId}`);
    }
  }
}
