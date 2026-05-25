/**
 * butlerQueue.ts — Asynchronous Butler Architecture
 * ===================================================
 * Dispatches long-running tasks (research, browser actions) to background workers.
 * Zoya replies instantly ("I'm on it, Boss") and keeps talking.
 * When the task completes, the result is:
 *   1. Stored in a "completed results" queue for the frontend to poll
 *   2. Sent as a Telegram message to the user
 *
 * The frontend (zoyaLiveService) polls GET /api/butler/results every few seconds.
 * When it finds a completed result, it injects it into the active Gemini Live session
 * via sendRealtimeInput({ text }), so Zoya naturally says "Boss, the research is done!"
 */

import { logger } from "./logger";
import { callResearchWithCascade } from "./llmRouter";
import { ThreadManager } from "./threadManager";

interface ButlerTask {
  id: string;
  type: "research" | "browser_action";
  query: string;
  chatId: number;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  startedAt: number;
  completedAt?: number;
}

interface CompletedResult {
  taskId: string;
  type: string;
  query: string;
  result: string;
}

class ButlerQueue {
  private tasks: Map<string, ButlerTask> = new Map();
  private completedResults: CompletedResult[] = [];

  /**
   * Dispatch a task for background execution. Returns immediately with a task ID.
   */
  public dispatch(type: "research" | "browser_action", query: string, chatId: number): string {
    const id = `butler_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const task: ButlerTask = {
      id,
      type,
      query,
      chatId,
      status: "pending",
      startedAt: Date.now()
    };

    this.tasks.set(id, task);
    logger.info("Butler", `[DISPATCH] Task ${id} | Type: ${type} | Query: "${query}"`);

    // Fire-and-forget background execution
    this.executeInBackground(task);

    return id;
  }

  /**
   * Collect and drain all completed results (for frontend polling).
   * Returns the results and clears them from the queue.
   */
  public collectCompleted(): CompletedResult[] {
    const results = [...this.completedResults];
    this.completedResults = [];
    return results;
  }

  /**
   * Manually inject a completed result into the queue (e.g. for local browser/voice reminders).
   */
  public pushLocalReminder(query: string, result: string) {
    this.completedResults.push({
      taskId: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: "reminder",
      query,
      result
    });
    logger.info("Butler", `[MANUAL INJECTION] Added local reminder to completed results.`);
  }

  private async executeInBackground(task: ButlerTask) {
    task.status = "running";
    logger.info("Butler", `[RUNNING] Task ${task.id} started...`);

    try {
      if (task.type === "research") {
        const result = await callResearchWithCascade(task.query);
        task.result = result.content;
        task.status = "done";
        task.completedAt = Date.now();

        const elapsed = ((task.completedAt - task.startedAt) / 1000).toFixed(1);
        logger.info("Butler", `[DONE] Task ${task.id} completed in ${elapsed}s | Result: ${task.result.substring(0, 200)}...`);

        // 1. Push to completed results queue (for frontend Gemini Live injection)
        this.completedResults.push({
          taskId: task.id,
          type: task.type,
          query: task.query,
          result: task.result
        });

        // 2. Send Telegram message with the result
        await this.deliverViaTelegram(task);

        // 3. Inject into J.A.R.V.I.S. ThreadManager for Total Awareness
        const threadId = task.chatId ? `tg_${task.chatId}` : "default_chat";
        ThreadManager.appendMessage(threadId, {
          role: "user",
          content: `[SYSTEM NOTIFICATION: Background research for "${task.query}" has completed. Findings:\n${task.result}\n\nYou do not need to reply to this unless the user asks about it.]`
        }).catch(e => logger.warn("Butler", "Failed to inject awareness to ThreadManager", e));
      }
    } catch (err: any) {
      task.status = "failed";
      logger.error("Butler", `[FAILED] Task ${task.id}: ${err.message}`);
      
      // Inject failure into J.A.R.V.I.S. ThreadManager for Total Awareness
      const threadId = task.chatId ? `tg_${task.chatId}` : "default_chat";
      ThreadManager.appendMessage(threadId, {
        role: "user",
        content: `[SYSTEM NOTIFICATION: Background research for "${task.query}" FAILED with error: ${err.message}]`
      }).catch(e => logger.warn("Butler", "Failed to inject awareness to ThreadManager", e));
    } finally {
      // Clean up old tasks after 5 minutes
      setTimeout(() => this.tasks.delete(task.id), 5 * 60 * 1000);
    }
  }

  private async deliverViaTelegram(task: ButlerTask) {
    try {
      const { jarvisScheduler } = await import("./scheduler");
      const chatId = task.chatId || jarvisScheduler.getAdminChatId();
      if (!chatId) {
        logger.warn("Butler", `No Telegram Chat ID available for delivery of task ${task.id}`);
        return;
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return;

      const https = await import("https");
      const message = `🔍 **Research Complete**\n\n**Query**: ${task.query}\n\n${task.result}`;

      // Truncate if too long for Telegram
      const truncated = message.length > 4000 ? message.substring(0, 3950) + "\n\n_(truncated)_" : message;

      const payload = JSON.stringify({ chat_id: chatId, text: truncated, parse_mode: "Markdown" });
      
      return new Promise<void>((resolve, reject) => {
        const req = https.request(
          {
            hostname: "api.telegram.org",
            port: 443,
            path: `/bot${token}/sendMessage`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
              "Host": "api.telegram.org"
            },
            agent: false
          },
          (res: any) => {
            logger.info("Butler", `[TELEGRAM] Delivered task ${task.id} result. Status: ${res.statusCode}`);
            resolve();
          }
        );
        req.on("error", (e: any) => {
          logger.error("Butler", `[TELEGRAM] Delivery failed: ${e.message}`);
          reject(e);
        });
        req.write(payload);
        req.end();
      });
    } catch (err: any) {
      logger.error("Butler", `Telegram delivery error: ${err.message}`);
    }
  }
}

export const butlerQueue = new ButlerQueue();
