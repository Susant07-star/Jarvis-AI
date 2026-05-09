import { logger } from "./logger";
import { triggerProactiveCall } from "./telegramBot";
import https from "https";

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

  /**
   * Schedule a new task (call or message)
   * @param chatId Telegram Chat ID
   * @param type 'call' or 'message'
   * @param content The message content (for calls, it's the intent/greeting)
   * @param delaySeconds How many seconds from now to execute
   */
  public schedule(chatId: number, type: "call" | "message", content: string, delaySeconds: number): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const executionTime = Date.now() + (delaySeconds * 1000);

    logger.info("Scheduler", `[NEURAL START] 🕒 Task Registered: ${id}`);
    logger.info("Scheduler", `[NEURAL START] 🕒 Action: ${type.toUpperCase()} | Delay: ${delaySeconds}s | Target: ${chatId}`);

    const timer = setTimeout(() => {
      this.execute(id);
    }, delaySeconds * 1000);

    this.tasks.set(id, { id, chatId, type, content, executionTime, timer });
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
    } catch (err: any) {
      logger.error("Scheduler", `Task execution failed: ${err.message}`);
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
          // Using the same DNS bypass strategy if needed
          agent: false // Standard agent for simplicity unless user specifically needs bypass here too
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
