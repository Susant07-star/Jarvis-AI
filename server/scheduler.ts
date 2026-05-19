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
  /**
   * Returns all active pending tasks for a given chatId as a readable summary.
   */
  public getActiveTasks(chatId: number): ScheduledTask[] {
    const result: ScheduledTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.chatId === chatId) result.push(task);
    }
    return result;
  }

  /**
   * Cancels a specific task by ID, clears its timer, and marks it as cancelled in Supabase.
   */
  public cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    clearTimeout(task.timer);
    this.tasks.delete(taskId);
    logger.info("Scheduler", `[CANCEL] Task ${taskId} ("${task.content}") cancelled.`);
    if (supabase) {
      supabase.from("tasks").update({ status: "cancelled" }).eq("task_id", taskId).then();
    }
    return true;
  }

  public async parseAndSchedule(userInput: string, chatId: number): Promise<{ success: boolean; message: string; taskId?: string }> {
    try {
      logger.info("Scheduler", `[DirectParse] Parsing scheduling request: "${userInput}"`);
      const tz = getTimezone ? getTimezone() : "Asia/Kathmandu";
      const now = new Date();
      const timeContext = `Current Time Context: Timezone=${tz}, Date=${now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" })}, Time=${now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`;

      // Build active tasks context so LLM can cancel/modify existing ones
      const activeTasks = this.getActiveTasks(chatId);
      const activeTasksSummary = activeTasks.length > 0
        ? `\n\nACTIVE TASKS (Boss currently has these scheduled):\n${activeTasks.map(t =>
            `- ID: "${t.id}" | Type: ${t.type} | Content: "${t.content}" | Fires in: ${Math.round((t.executionTime - Date.now()) / 1000)}s`
          ).join("\n")}`
        : `\n\nACTIVE TASKS: None currently scheduled.`;

      const systemPrompt = `You are J.A.R.V.I.S., the ultimate Susant assistant.
Your job is to parse a user's scheduling/alarm/reminder request into structured JSON.

ABSOLUTE RULE — You MUST return ONLY a valid JSON object with the following fields:
- "action": Choose EXACTLY "create" (new task), "cancel" (cancel an existing task), or "modify" (cancel and replace an existing task).
- "type": Choose EXACTLY "alarm", "message", or "call". Required for "create" and "modify".
- "content": A clean, concise summary of the reminder. Required for "create" and "modify".
- "delay_seconds": Seconds from NOW before executing. Required for "create" and "modify". Calculate carefully.
- "target_task_id": The ID of the existing task to cancel. Required ONLY for "cancel" and "modify".

${timeContext}${activeTasksSummary}

Examples:
Input: "remind me in 5 minutes to drink water"
Output: { "action": "create", "type": "message", "content": "Drink water", "delay_seconds": 300 }

Input: "cancel my drink water alarm" (assuming active task with id task_123)
Output: { "action": "cancel", "target_task_id": "task_123" }

Input: "change my drink water alarm to a message in 3 minutes" (assuming active task with id task_123)
Output: { "action": "modify", "target_task_id": "task_123", "type": "message", "content": "Drink water", "delay_seconds": 180 }`;

      const { callChatWithCascade } = await import("./llmRouter");
      const result = await callChatWithCascade([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Parse this scheduling request: "${userInput}"` }
      ]);

      // Extract JSON from the response (LLM may wrap it in markdown or conversational text)
      let jsonStr = result.content.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in LLM response.");
      jsonStr = jsonMatch[0];

      const parsed = JSON.parse(jsonStr);
      const action = parsed.action || "create";

      // --- CANCEL action ---
      if (action === "cancel") {
        if (!parsed.target_task_id) throw new Error("cancel action requires target_task_id.");
        const cancelled = this.cancelTask(parsed.target_task_id);
        const cancelledTask = activeTasks.find(t => t.id === parsed.target_task_id);
        const msg = cancelled
          ? `✅ Considered it cancelled, Boss. The scheduled task "${cancelledTask?.content ?? parsed.target_task_id}" has been removed from my queue.`
          : `⚠️ I couldn't find that task in my active queue, Boss. It may have already executed or never existed.`;
        return { success: cancelled, message: msg };
      }

      // --- MODIFY action ---
      if (action === "modify") {
        if (!parsed.target_task_id) throw new Error("modify action requires target_task_id.");
        this.cancelTask(parsed.target_task_id);
        // Fall through to create the replacement task below
      }

      // --- CREATE (or replacement after MODIFY) ---
      if (!parsed.type || !parsed.content || parsed.delay_seconds === undefined) {
        throw new Error("Parsed JSON is missing required fields for create/modify.");
      }

      const taskId = this.schedule(chatId, parsed.type, parsed.content, parsed.delay_seconds);

      // Generate a witty J.A.R.V.I.S. confirmation message
      const isModify = action === "modify";
      const confirmSystem = `You are J.A.R.V.I.S., the wittily sarcastic AI butler created by Susant, your boss.
Draft a classy, witty, and highly reassuring confirmation message.
${isModify ? "Confirm that you have MODIFIED an existing task and" : "Confirm that you have"} scheduled a "${parsed.type}" action to: "${parsed.content}" in exactly ${Math.round(parsed.delay_seconds / 60)} minute(s).
Keep it under 60 words.`;

      const confirmResult = await callChatWithCascade([
        { role: "system", content: confirmSystem },
        { role: "user", content: "Write the confirmation reply." }
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

          // 2. Generate a highly custom, witty alarm briefing from JARVIS using LLM
          const tz = getTimezone ? getTimezone() : "Asia/Kathmandu";
          const now = new Date();
          const currentTime = now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
          
          let alarmBrief = `🚨 **J.A.R.V.I.S. ALARM PROTOCOL**\n\nBoss, it is ${currentTime}. Here is your directive:\n🎯 *"${task.content}"*`;

          try {
            const systemPrompt = `You are J.A.R.V.I.S., the wittily sarcastic, hyper-intelligent AI butler created by Susant, your boss.
You are directly speaking to him right now because an alarm is ringing.
The current time is ${currentTime}.
Your objective is to:
1. Alert him to his scheduled directive/task: "${task.content}".
2. Be witty, classy, and highly motivational (classic JARVIS style). If the task is a wake-up call, command him to get out of bed. If it's a general reminder, urge him to complete it immediately.
3. Keep your response under 100 words. Do not use generic placeholders.`;

            const result = await callChatWithCascade([
              { role: "system", content: systemPrompt },
              { role: "user", content: "The alarm is ringing. Write my briefing based on the directive." }
            ]);
            if (result && result.content) {
              alarmBrief = `🚨 **J.A.R.V.I.S. ALARM PROTOCOL**\n\n${result.content}\n\n_Reply to confirm you have received this._`;
            }
          } catch (err) {
            logger.warn("Scheduler", "LLM cascade failed to generate alarm brief. Using default template.");
          }

          // 3. Send alarm brief to Telegram
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            await this.sendTelegramMessage(token, task.chatId, alarmBrief);
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

  public async ackAlarm(chatId: number): Promise<boolean> {
    const watchdogId = `watchdog_${chatId}`;
    const active = this.activeWatchdogs.get(watchdogId);
    if (active) {
      clearTimeout(active.timer);
      this.activeWatchdogs.delete(watchdogId);
      logger.info("Scheduler", `🚨 Alarm watchdog disarmed for ChatID ${chatId}`);

      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        await this.sendTelegramMessage(
          token,
          chatId,
          `✅ **J.A.R.V.I.S. ALARM DISARMED**\n\nWatchdog cleared for task: "${active.content}". I've silenced the alarm loop, Boss! 🚀`
        );
      }
      return true;
    }
    return false;
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
        `🚨 **ALARM WARNING #${active.attempts}**\n\nBoss, you have not acknowledged the alarm for: "${active.content}"! Ringing your physical phone again.\n\n_Send any message to this chat to silence the alarm._`
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

  private async triggerMacrodroid(delaySeconds: number = 0): Promise<boolean> {
    if (!this.macrodroidWebhookUrl) {
      logger.warn("Scheduler", "MacroDroid Webhook URL not configured. Skipping physical ring.");
      return false;
    }

    try {
      let url = this.macrodroidWebhookUrl;

      // If passing a delay to set a native alarm, calculate the target time
      if (delaySeconds > 0) {
        const targetDate = new Date(Date.now() + (delaySeconds * 1000));
        const hour = targetDate.getHours();
        const minute = targetDate.getMinutes();
        
        url += url.includes('?') ? `&hour=${hour}&minute=${minute}` : `?hour=${hour}&minute=${minute}`;
        logger.info("Scheduler", `[API] Passing target time to MacroDroid: ${hour}:${minute.toString().padStart(2, '0')}`);
      }

      logger.info("Scheduler", `[API] Hitting MacroDroid Webhook: ${url}`);
      const res = await fetch(url);
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
