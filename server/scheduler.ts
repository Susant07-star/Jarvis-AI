import { logger } from "./logger";
import { triggerProactiveCall } from "./telegramBot";
import https from "https";
import { supabase } from "./supabaseClient";
import { callChatWithCascade } from "./llmRouter";
import { getTimezone } from "./timezoneStore";

interface ScheduledTask {
  id: string;
  chatId: number;
  type: "call" | "message" | "alarm";
  content: string;
  executionTime: number;
  timer: NodeJS.Timeout;
}

interface ActiveWatchdog {
  taskId: string;
  chatId: number;
  content: string;
  attempts: number;
  timer: NodeJS.Timeout;
}

class JarvisScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private activeWatchdogs: Map<string, ActiveWatchdog> = new Map();
  private cachedAdminChatId: number = 0;
  private macrodroidWebhookUrl: string = process.env.MACRODROID_WEBHOOK_URL || "";

  /**
   * High-precision LLM parser to extract alarm/reminder parameters and schedule them directly.
   * Eliminates the need for visual browser agent planning for scheduling actions.
   */
  public async parseAndSchedule(userInput: string, chatId: number): Promise<{ success: boolean; message: string; taskId?: string }> {
    try {
      logger.info("Scheduler", `[DirectParse] Parsing scheduling request: "${userInput}"`);
      const tz = getTimezone ? getTimezone() : "Asia/Kathmandu";
      const now = new Date();
      const timeContext = `Current Time Context: Timezone=${tz}, Date=${now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" })}, Time=${now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`;

      const systemPrompt = `You are J.A.R.V.I.S., the ultimate Stark assistant.
Your job is to parse a user's scheduling/alarm/reminder request into structured JSON.

ABSOLUTE RULE — You MUST return ONLY a valid JSON object with the following fields:
- "type": Choose EXACTLY "alarm" (for wake up/alarm clock requests), "message" (for reminders to do tasks later), or "call" (for voice calls).
- "content": A clean, concise summary of the action/work (e.g. "Drink water", "Read Chapter 4").
- "delay_seconds": The number of seconds to wait from NOW before executing. Calculate this carefully based on the current time context.

${timeContext}

Example input: "remind me in 5 minutes to drink water"
Example output: { "type": "message", "content": "Drink water", "delay_seconds": 300 }

Example input: "wake me up at 5:00 AM to read" (if current time is 4:58 AM)
Example output: { "type": "alarm", "content": "Read", "delay_seconds": 120 }`;

      const { callChatWithCascade } = await import("./llmRouter");
      const result = await callChatWithCascade([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Parse this scheduling request: "${userInput}"` }
      ]);

      const parsed = JSON.parse(result.content.trim());
      if (!parsed.type || !parsed.content || parsed.delay_seconds === undefined) {
        throw new Error("Parsed JSON is missing required fields.");
      }

      const taskId = this.schedule(chatId, parsed.type, parsed.content, parsed.delay_seconds);

      // Generate a witty J.A.R.V.I.S. confirmation message
      const confirmSystem = `You are J.A.R.V.I.S., the wittily sarcastic AI butler created by Tony Stark.
Draft a classy, witty, and highly reassuring confirmation message.
Confirm that you have scheduled a "${parsed.type}" action to: "${parsed.content}" in exactly ${Math.round(parsed.delay_seconds / 60)} minute(s).
Keep it under 60 words.`;

      const confirmResult = await callChatWithCascade([
        { role: "system", content: confirmSystem },
        { role: "user", content: "Good job. Write the confirmation reply." }
      ]);

      return {
        success: true,
        message: confirmResult.content || `Considered it done, sir! I've scheduled your reminder to: ${parsed.content}.`,
        taskId
      };

    } catch (err: any) {
      logger.error("Scheduler", `DirectParse failed: ${err.message}`);
      return {
        success: false,
        message: `I apologize, Boss, but I encountered an error while trying to process that schedule request.`
      };
    }
  }

  public setAdminChatId(id: number) {
    if (id !== 0 && this.cachedAdminChatId !== id) {
      this.cachedAdminChatId = id;
      logger.info("Scheduler", `Cached Admin Chat ID updated to: ${id}`);
    }
  }

  public getAdminChatId(): number {
    return this.cachedAdminChatId;
  }

  public getMacrodroidUrl(): string {
    return this.macrodroidWebhookUrl;
  }

  public setMacrodroidUrl(url: string) {
    this.macrodroidWebhookUrl = url;
    logger.info("Scheduler", `MacroDroid Webhook URL updated dynamically: ${url}`);
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
            type: record.type as "call" | "message" | "alarm",
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
   * Schedule a new task (call, message, or alarm)
   */
  public schedule(chatId: number, type: "call" | "message" | "alarm", content: string, delaySeconds: number): string {
    let targetChatId = chatId;
    if (!targetChatId || targetChatId === 0) {
      targetChatId = this.cachedAdminChatId || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || "0");
    }

    if (targetChatId === 0) {
      logger.info("Scheduler", `No Telegram Chat ID active yet. Registering local browser/voice reminder...`);
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
      if (task.chatId === 0) {
        logger.info("Scheduler", `[ACTION] Local browser/voice reminder triggered: "${task.content}"`);
        const { butlerQueue } = await import("./butlerQueue");
        butlerQueue.pushLocalReminder(`Local Reminder`, `Boss, here is your scheduled reminder: ${task.content}`);
      } else {
        if (task.type === "call") {
          logger.info("Scheduler", `[ACTION] Triggering Urgent Call UI for Telegram`);
          await triggerProactiveCall(task.chatId);
        } else if (task.type === "alarm") {
          logger.info("Scheduler", `[ACTION] Triggering Omega Alarm Protocol via MacroDroid & Telegram`);
          
          // 1. Ring the physical phone via MacroDroid Webhook
          await this.triggerMacrodroid();

          // 2. Generate a highly custom, witty morning briefing from JARVIS using LLM
          let morningBrief = `🌅 **GOOD MORNING, BOSS!**\n\nTime to rise and shine! Here is your morning directive:\n🎯 *"${task.content}"*`;
          
          try {
            const systemPrompt = `You are J.A.R.V.I.S., the wittily sarcastic, hyper-intelligent AI butler created by Tony Stark.
Draft an elegant, highly motivating, wittily sarcastic (classic JARVIS style) morning briefing for the Boss.
The time is 5:00 AM.
Your objective is to:
1. Command him to get out of bed in a witty, classy manner.
2. Present his scheduled morning directive/task clearly: "${task.content}".
3. Give him a positive, tech-focused motivational punch.
Keep your response under 120 words. Do not use generic placeholders.`;

            const result = await callChatWithCascade([
              { role: "system", content: systemPrompt },
              { role: "user", content: "Good morning, J.A.R.V.I.S. Write my morning briefing." }
            ]);
            if (result && result.content) {
              morningBrief = `🌅 **GOOD MORNING BRIEFING FROM J.A.R.V.I.S.**\n\n${result.content}\n\n_Reply "woke up", "i'm up", or "dismiss" to confirm you are awake._`;
            }
          } catch (err) {
            logger.warn("Scheduler", "LLM cascade failed to generate morning brief. Using default template.");
          }

          // 3. Send morning brief to Telegram
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            await this.sendTelegramMessage(token, task.chatId, morningBrief);
          }

          // 4. Setup sleep-watchdog loop (checking every 2 minutes for response)
          const watchdogId = `watchdog_${task.chatId}`;
          
          // Clear any prior active watchdog for safety
          const existing = this.activeWatchdogs.get(watchdogId);
          if (existing) clearTimeout(existing.timer);

          const timer = setTimeout(() => {
            this.runWatchdog(watchdogId);
          }, 120000); // 2 minutes

          this.activeWatchdogs.set(watchdogId, {
            taskId: task.id,
            chatId: task.chatId,
            content: task.content,
            attempts: 1,
            timer
          });

        } else {
          logger.info("Scheduler", `[ACTION] Sending Scheduled Message to Telegram: "${task.content}"`);
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            await this.sendTelegramMessage(token, task.chatId, task.content);
          }
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

  public async ackAlarm(chatId: number) {
    const watchdogId = `watchdog_${chatId}`;
    const active = this.activeWatchdogs.get(watchdogId);
    if (active) {
      clearTimeout(active.timer);
      this.activeWatchdogs.delete(watchdogId);
      logger.info("Scheduler", `🚨 Omega Alarm Protocol disarmed for ChatID ${chatId}`);
      
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        await this.sendTelegramMessage(
          token, 
          chatId, 
          `✅ **OMEGA ALARM PROTOCOL DISARMED**\n\nGood morning, Boss! Sleep watchdog cleared. I'm glad you are awake and ready. Let's conquer the day! 🚀`
        );
      }
    }
  }

  private async runWatchdog(watchdogId: string) {
    const active = this.activeWatchdogs.get(watchdogId);
    if (!active) return;

    logger.warn("Scheduler", `[WATCHDOG] Boss failed to ACK alarm! Attempt #${active.attempts}. Ringing phone again...`);

    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Trigger MacroDroid Webhook again!
    await this.triggerMacrodroid();

    if (token) {
      await this.sendTelegramMessage(
        token, 
        active.chatId, 
        `🚨 **WAKE UP WARNING #${active.attempts}**\n\nBoss, you have NOT confirmed you are awake! Ringing your physical phone again.\n\n_Reply "woke up", "i'm awake", or "dismiss" to silence me._`
      );
    }

    if (active.attempts >= 5) {
      logger.error("Scheduler", `[WATCHDOG] Reached maximum wake-up attempts (5). Disarming watchdog.`);
      this.activeWatchdogs.delete(watchdogId);
      if (token) {
        await this.sendTelegramMessage(
          token,
          active.chatId,
          `⚠️ **WATCHDOG FORCE-DISARMED**\n\nBoss, I have tried waking you up 5 times. I am disarming the protocol now to avoid battery drain. Please don't oversleep!`
        );
      }
      return;
    }

    // Reschedule next check in 2 minutes
    active.attempts += 1;
    active.timer = setTimeout(() => {
      this.runWatchdog(watchdogId);
    }, 120000); // 2 minutes
  }

  private async triggerMacrodroid(): Promise<boolean> {
    if (!this.macrodroidWebhookUrl) {
      logger.warn("Scheduler", "MacroDroid Webhook URL not configured. Skipping physical ring.");
      return false;
    }
    
    try {
      logger.info("Scheduler", `[API] Hitting MacroDroid Webhook: ${this.macrodroidWebhookUrl}`);
      const res = await fetch(this.macrodroidWebhookUrl);
      logger.info("Scheduler", `[API] MacroDroid response status: ${res.status}`);
      return res.ok;
    } catch (err: any) {
      logger.error("Scheduler", `Failed to trigger MacroDroid Webhook: ${err.message}`);
      return false;
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
