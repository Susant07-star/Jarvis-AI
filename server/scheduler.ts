import { logger } from "./logger";
import { triggerProactiveCall } from "./telegramBot";
import https from "https";
import { supabase } from "./supabaseClient";

interface ScheduledTask {
  id: string;
  chatId: number;
  type: "call" | "message";
  content: string;
  executionTime: number;
  timer: NodeJS.Timeout;
}

class JarvisScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private cachedAdminChatId: number = 0;

  public setAdminChatId(id: number) {
    if (id !== 0 && this.cachedAdminChatId !== id) {
      this.cachedAdminChatId = id;
      logger.info("Scheduler", `Cached Admin Chat ID updated to: ${id}`);
    }
  }

  public getAdminChatId(): number {
    return this.cachedAdminChatId;
  }

  /**
   * Initializes the scheduler by pulling pending tasks from Supabase (if available).
   * This ensures tasks survive server restarts.
   */
  public async init() {
    if (!supabase) return;
    
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("status", "pending");

      if (error) {
        logger.error("Scheduler", `Failed to load pending tasks from Supabase`, error);
        return;
      }

      if (data && data.length > 0) {
        logger.info("Scheduler", `Found ${data.length} pending tasks in Supabase. Resuming timers...`);
        const now = Date.now();

        for (const record of data) {
          const delayMs = Math.max(0, Number(record.execution_time) - now);
          
          const timer = setTimeout(() => {
            this.execute(record.task_id);
          }, delayMs);

          this.tasks.set(record.task_id, {
            id: record.task_id,
            chatId: Number(record.chat_id),
            type: record.type as "call" | "message",
            content: record.content,
            executionTime: Number(record.execution_time),
            timer
          });
        }
      }
    } catch (err) {
      logger.error("Scheduler", `Error initializing scheduler from Supabase`, err);
    }
  }

  /**
   * Schedule a new task (call or message)
   */
  public schedule(chatId: number, type: "call" | "message", content: string, delaySeconds: number): string {
    let targetChatId = chatId;
    if (!targetChatId || targetChatId === 0) {
      targetChatId = this.cachedAdminChatId || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || "0");
    }

    if (targetChatId === 0) {
      logger.error("Scheduler", `Cannot schedule ${type}: No valid Telegram Chat ID found. Please send a message to the Telegram bot first to link your account.`);
      return "failed_no_chat_id";
    }

    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const executionTime = Date.now() + (delaySeconds * 1000);

    logger.info("Scheduler", `[NEURAL START] 🕒 Task Registered: ${id}`);
    logger.info("Scheduler", `[NEURAL START] 🕒 Action: ${type.toUpperCase()} | Delay: ${delaySeconds}s | Target: ${targetChatId}`);

    const timer = setTimeout(() => {
      this.execute(id);
    }, delaySeconds * 1000);

    this.tasks.set(id, { id, chatId: targetChatId, type, content, executionTime, timer });

    // Persist to Supabase
    if (supabase) {
      supabase.from("tasks").insert({
        task_id: id,
        chat_id: targetChatId,
        type,
        content,
        execution_time: executionTime,
        status: "pending"
      }).then(({ error }) => {
        if (error) logger.error("Scheduler", `Failed to save task to Supabase`, error);
      });
    }

    return id;
  }

  private async execute(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;

    logger.info("Scheduler", `[TIMER] Executing ${task.type} for Boss (ChatID: ${task.chatId})`);

    try {
      if (task.type === "call") {
        logger.info("Scheduler", `[ACTION] Triggering Urgent Call UI for Telegram`);
        await triggerProactiveCall(task.chatId);
      } else {
        logger.info("Scheduler", `[ACTION] Sending Scheduled Message to Telegram: "${task.content}"`);
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (token) {
          await this.sendTelegramMessage(token, task.chatId, task.content);
        }
      }

      // Mark as completed in Supabase
      if (supabase) {
        supabase.from("tasks").update({ status: "completed" }).eq("task_id", id).then();
      }

    } catch (err: any) {
      logger.error("Scheduler", `Task execution failed: ${err.message}`);
      // Mark as failed
      if (supabase) {
        supabase.from("tasks").update({ status: "failed" }).eq("task_id", id).then();
      }
    } finally {
      this.tasks.delete(id);
    }
  }

  private sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" });
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
        (res) => {
          logger.info("Scheduler", `[API] Telegram response status: ${res.statusCode}`);
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Telegram error: ${res.statusCode}`));
        }
      );
      req.on("error", (e) => {
        logger.error("Scheduler", `[API] Request error: ${e.message}`);
        reject(e);
      });
      req.write(payload);
      req.end();
    });
  }

  public cancel(id: string) {
    const task = this.tasks.get(id);
    if (task) {
      clearTimeout(task.timer);
      this.tasks.delete(id);
      logger.info("Scheduler", `Cancelled task ${id}`);
      
      if (supabase) {
        supabase.from("tasks").update({ status: "cancelled" }).eq("task_id", id).then();
      }
    }
  }

  public getPendingTasks(chatId: number) {
    return Array.from(this.tasks.values())
      .filter(t => t.chatId === chatId)
      .map(t => ({
        id: t.id,
        type: t.type,
        content: t.content,
        executionTime: t.executionTime
      }));
  }
}

export const jarvisScheduler = new JarvisScheduler();
