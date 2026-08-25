import { logger } from "./logger";
import * as cron from "node-cron";
import { triggerProactiveCall } from "./telegramBot";
import https from "https";
import dns from "dns";
import { supabase } from "./supabaseClient";
import { callChatWithCascade } from "./llmRouter";
import { getTimezone } from "./timezoneStore";
import { ThreadManager } from "./threadManager";

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

type RoutineType = "research" | "reminder" | "message";
type ScheduleScope = "one_time" | "recurring";

interface ResearchJobRecord {
  id: string;
  topic: string;
  time_of_day: string;
  chat_id: number;
  is_active: boolean;
}

interface ParsedRoutineTopic {
  type: RoutineType;
  content: string;
}

export const ROUTINE_PREFIX = "__JARVIS_ROUTINE__:";

export function encodeRoutineTopic(type: RoutineType, content: string): string {
  return `${ROUTINE_PREFIX}${JSON.stringify({ version: 1, type, content })}`;
}

export function parseRoutineTopic(topic: string): ParsedRoutineTopic {
  if (topic.startsWith(ROUTINE_PREFIX)) {
    try {
      const payload = JSON.parse(topic.slice(ROUTINE_PREFIX.length));
      if (["research", "reminder", "message"].includes(payload.type) && typeof payload.content === "string") {
        return { type: payload.type, content: payload.content.trim() };
      }
    } catch {
      // Old/manual rows should gracefully fall back to research below.
    }
  }

  return { type: "research", content: topic };
}

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeRoutineType(value: unknown): RoutineType | undefined {
  if (value === "research" || value === "reminder" || value === "message") return value;
  return undefined;
}

function normalizeTaskType(value: unknown): "call" | "message" | "alarm" | undefined {
  if (value === "call" || value === "message" || value === "alarm") return value;
  if (value === "reminder") return "message";
  return undefined;
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
   * Returns all active pending tasks across all chats (for the UI dashboard).
   */
  public getAllJobs(): Omit<ScheduledTask, 'timer'>[] {
    const result: Omit<ScheduledTask, 'timer'>[] = [];
    for (const task of this.tasks.values()) {
      const { timer, ...serializableTask } = task;
      result.push(serializableTask);
    }
    return result;
  }

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

  public async parseAndSchedule(userInput: string, chatId: number): Promise<{ success: boolean; message: string; taskId?: string; jobIds?: string[] }> {
    try {
      logger.info("Scheduler", `[DirectParse] Parsing scheduling request: "${userInput}"`);
      const tz = getTimezone ? getTimezone() : "Asia/Kathmandu";
      const now = new Date();
      const timeContext = `Current Time Context: Timezone=${tz}, Date=${now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" })}, Time=${now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`;

      const activeTasks = this.getActiveTasks(chatId);
      const activeTasksSummary = activeTasks.length > 0
        ? activeTasks.map(t => `- ${t.id} | one_time | ${t.type} | "${t.content}" | fires_in_seconds=${Math.max(0, Math.round((t.executionTime - Date.now()) / 1000))}`).join("\n")
        : "None";

      const recurringRoutines = await this.getRecurringRoutineRecords();
      const recurringSummary = recurringRoutines.length > 0
        ? recurringRoutines.map(job => {
            const routine = parseRoutineTopic(job.topic);
            return `- ${job.id} | recurring | ${routine.type} | active=${job.is_active} | cron="${job.time_of_day}" | content="${routine.content}"`;
          }).join("\n")
        : "None";

      const systemPrompt = `You are J.A.R.V.I.S. scheduling control for Boss Susant.
Parse the user's request into STRICT JSON only. No markdown, no prose.

${timeContext}

ACTIVE ONE-TIME TASKS:
${activeTasksSummary}

ACTIVE RECURRING ROUTINES/JOBS:
${recurringSummary}

JSON schema:
{
  "action": "create" | "cancel" | "modify" | "list",
  "scope": "one_time" | "recurring",
  "type": "alarm" | "call" | "message" | "reminder" | "research",
  "content": "clean user intent, if creating or changing content",
  "delay_seconds": number,
  "cron_expression": "5-field cron, if recurring",
  "target_task_ids": ["one-time task ids to cancel/modify"],
  "target_routine_ids": ["recurring routine ids to cancel/modify"],
  "is_active": boolean
}

Rules:
- If the user says every, daily, each, weekly, monthly, routine, job, regular, every morning, every day, or equivalent Nepali wording like हरेक/दैनिक/प्रत्येक, use scope="recurring".
- If the user says in X minutes/hours, tomorrow, today at a time, or a single future time without repeat wording, use scope="one_time".
- Recurring cron_expression must be 5 fields. Daily at 08:00 = "0 8 * * *". Daily at 10:30 = "30 10 * * *". Every 6 hours = "0 */6 * * *".
- For recurring research/news/latest/updates, type="research". For simple recurring good morning/text, type="message". For medicine/water/task nudges, type="reminder".
- For one-time reminders, type="message" unless the user explicitly asks for alarm or call.
- For cancel/modify, choose exact ids from the active lists. If the user says both/all matching items, include all matching ids.
- If the user asks what is set, action="list".
- Never pretend a recurring routine was created as a one-time task.`;

      const result = await callChatWithCascade([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Parse this scheduling request: "${userInput}"` }
      ]);

      let jsonStr = result.content.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in LLM response.");
      jsonStr = jsonMatch[0];

      const parsed = JSON.parse(jsonStr);
      const action = parsed.action || "create";
      const scope: ScheduleScope = parsed.scope === "recurring" ? "recurring" : "one_time";

      if (action === "list") {
        return { success: true, message: this.formatScheduleInventory(activeTasks, recurringRoutines) };
      }

      if (scope === "recurring") {
        return await this.handleRecurringRoutineCommand(parsed, chatId, recurringRoutines);
      }

      return await this.handleOneTimeScheduleCommand(parsed, chatId, activeTasks);
    } catch (err: any) {
      logger.error("Scheduler", `DirectParse failed: ${err.message}`);
      return {
        success: false,
        message: "I could not safely update the schedule, Boss. Please say the time, repeat pattern, and what to send/remind again."
      };
    }
  }

  private async getRecurringRoutineRecords(): Promise<ResearchJobRecord[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("research_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      logger.warn("Scheduler", `Failed to load recurring routines: ${error.message}`);
      return [];
    }
    return (data || []) as ResearchJobRecord[];
  }

  private formatScheduleInventory(tasks: ScheduledTask[], routines: ResearchJobRecord[]): string {
    const oneTime = tasks.length
      ? tasks.map(t => `- ${t.id}: ${t.type} "${t.content}" in ${Math.max(0, Math.round((t.executionTime - Date.now()) / 1000))}s`).join("\n")
      : "- None";

    const recurring = routines.length
      ? routines.map(job => {
          const routine = parseRoutineTopic(job.topic);
          return `- ${job.id}: ${routine.type} "${routine.content}" at ${job.time_of_day} (${job.is_active ? "active" : "paused"})`;
        }).join("\n")
      : "- None";

    return `Current schedule, Boss:\n\nOne-time tasks:\n${oneTime}\n\nRecurring routines:\n${recurring}`;
  }

  private async handleRecurringRoutineCommand(parsed: any, chatId: number, routines: ResearchJobRecord[]): Promise<{ success: boolean; message: string; jobIds?: string[] }> {
    if (!supabase) {
      return { success: false, message: "Recurring routines need Supabase, Boss, but Supabase is not configured on this server." };
    }

    const action = parsed.action || "create";
    const targetChatId = chatId || this.cachedAdminChatId || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || "0");

    if (action === "cancel") {
      const ids = normalizeIdList(parsed.target_routine_ids).concat(normalizeIdList(parsed.target_routine_id));
      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length === 0) {
        return { success: false, message: `I need to know which recurring routine to delete, Boss.\n\n${this.formatScheduleInventory([], routines)}` };
      }

      const { cronJobManager } = await import("./cronJobs");
      for (const id of uniqueIds) {
        const { error } = await supabase.from("research_jobs").delete().eq("id", id);
        if (error) throw error;
        cronJobManager.unscheduleJob(id);
      }

      return { success: true, message: `Done, Boss. Deleted ${uniqueIds.length} recurring routine${uniqueIds.length === 1 ? "" : "s"}.`, jobIds: uniqueIds };
    }

    if (action === "modify") {
      const ids = normalizeIdList(parsed.target_routine_ids).concat(normalizeIdList(parsed.target_routine_id));
      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length === 0) {
        return { success: false, message: `I need the routine to edit, Boss.\n\n${this.formatScheduleInventory([], routines)}` };
      }

      const { cronJobManager } = await import("./cronJobs");
      const updatedIds: string[] = [];

      for (const id of uniqueIds) {
        const existing = routines.find(r => r.id === id);
        if (!existing) continue;
        const current = parseRoutineTopic(existing.topic);
        const nextType = normalizeRoutineType(parsed.type) || normalizeRoutineType(parsed.routine_type) || current.type;
        const nextContent = typeof parsed.content === "string" && parsed.content.trim() ? parsed.content.trim() : current.content;
        const nextCron = typeof parsed.cron_expression === "string" && parsed.cron_expression.trim() ? parsed.cron_expression.trim() : existing.time_of_day;

        if (!cron.validate(nextCron)) {
          return { success: false, message: `That repeat schedule is not a valid cron expression, Boss: ${nextCron}` };
        }

        const updates: any = {
          topic: encodeRoutineTopic(nextType, nextContent),
          time_of_day: nextCron
        };
        if (typeof parsed.is_active === "boolean") updates.is_active = parsed.is_active;

        const { data, error } = await supabase
          .from("research_jobs")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        if (data.is_active) cronJobManager.scheduleJob(data);
        else cronJobManager.unscheduleJob(id);
        updatedIds.push(id);
      }

      return { success: true, message: `Done, Boss. Updated ${updatedIds.length} recurring routine${updatedIds.length === 1 ? "" : "s"}.`, jobIds: updatedIds };
    }

    const routineType = normalizeRoutineType(parsed.type) || normalizeRoutineType(parsed.routine_type) || "reminder";
    const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
    const cronExpression = typeof parsed.cron_expression === "string" ? parsed.cron_expression.trim() : "";

    if (!content || !cronExpression) {
      return { success: false, message: "I need both the routine content and repeat time, Boss." };
    }
    if (!cron.validate(cronExpression)) {
      return { success: false, message: `That repeat schedule is not valid yet, Boss: ${cronExpression}` };
    }

    const { data, error } = await supabase
      .from("research_jobs")
      .insert({ topic: encodeRoutineTopic(routineType, content), time_of_day: cronExpression, chat_id: targetChatId || 0, is_active: true })
      .select()
      .single();
    if (error) throw error;

    const { cronJobManager } = await import("./cronJobs");
    cronJobManager.scheduleJob(data);

    return { success: true, message: `Done, Boss. Created a recurring ${routineType} routine for "${content}".`, jobIds: [data.id] };
  }

  private async handleOneTimeScheduleCommand(parsed: any, chatId: number, activeTasks: ScheduledTask[]): Promise<{ success: boolean; message: string; taskId?: string }> {
    const action = parsed.action || "create";

    if (action === "cancel") {
      const ids = normalizeIdList(parsed.target_task_ids).concat(normalizeIdList(parsed.target_task_id));
      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length === 0) {
        return { success: false, message: `I need to know which one-time task to cancel, Boss.\n\n${this.formatScheduleInventory(activeTasks, [])}` };
      }
      let cancelled = 0;
      for (const id of uniqueIds) {
        if (this.cancelTask(id)) cancelled += 1;
      }
      return { success: cancelled > 0, message: `Done, Boss. Cancelled ${cancelled} one-time task${cancelled === 1 ? "" : "s"}.` };
    }

    if (action === "modify") {
      const ids = normalizeIdList(parsed.target_task_ids).concat(normalizeIdList(parsed.target_task_id));
      const targetId = ids[0];
      const original = activeTasks.find(t => t.id === targetId);
      if (!original) {
        return { success: false, message: `I could not find that one-time task, Boss.\n\n${this.formatScheduleInventory(activeTasks, [])}` };
      }

      const nextType = normalizeTaskType(parsed.type) || original.type;
      const nextContent = typeof parsed.content === "string" && parsed.content.trim() ? parsed.content.trim() : original.content;
      const nextDelay = typeof parsed.delay_seconds === "number" ? parsed.delay_seconds : Math.max(0, Math.round((original.executionTime - Date.now()) / 1000));
      this.cancelTask(targetId);
      const newTaskId = this.schedule(original.chatId, nextType, nextContent, nextDelay);
      return { success: true, message: `Done, Boss. Updated the one-time ${nextType} task.`, taskId: newTaskId };
    }

    const type = normalizeTaskType(parsed.type) || "message";
    const content = typeof parsed.content === "string" && parsed.content.trim() ? parsed.content.trim() : "Scheduled Voice Action";
    if (typeof parsed.delay_seconds !== "number") {
      return { success: false, message: "I need a single future time for that one-time task, Boss." };
    }

    const taskId = this.schedule(chatId, type, content, parsed.delay_seconds);
    return { success: true, message: `Done, Boss. Scheduled the one-time ${type} task.`, taskId };
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
          const localAlarmSuccess = await this.triggerMacrodroid();

          // 2. Generate a highly custom, witty alarm briefing from JARVIS using LLM
          const tz = getTimezone ? getTimezone() : "Asia/Kathmandu";
          const now = new Date();
          const currentTime = now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
          
          let alarmBrief = `🚨 **J.A.R.V.I.S. ALARM PROTOCOL**\n\nBoss, it is ${currentTime}. Here is your directive:\n🎯 *"${task.content}"*`;

          try {
            const systemPrompt = `You are J.A.R.V.I.S., a highly efficient and direct AI assistant created by Susant.
An alarm has just triggered for your boss.
The current time is ${currentTime}.
${localAlarmSuccess ? "The physical phone alarm successfully rang." : "WARNING: The physical phone alarm FAILED to ring locally."}

Your objective is to:
1. Directly state the alarm/reminder: "${task.content}".
2. Be brief, clear, and sound like a human reminding him. DO NOT be overly poetic, overly sassy, or use complex words. Just give the facts clearly.
3. Keep your response under 40 words.`;

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

      // Inject into J.A.R.V.I.S. ThreadManager for Total Awareness
      const threadId = task.chatId ? `tg_${task.chatId}` : "default_chat";
      ThreadManager.appendMessage(threadId, { 
        role: "user", 
        content: `[SYSTEM NOTIFICATION: You just fired a scheduled ${task.type} with the content: "${task.content}". You do not need to reply to this unless the user asks.]` 
      }).catch(e => logger.warn("Scheduler", "Failed to inject awareness to ThreadManager", e));

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
      // Connect directly to Telegram's verified IP to bypass ISP-level DNS hijacking (Nepal)
      const TELEGRAM_IP = "149.154.167.220";
      const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });
      const req = https.request(
        {
          hostname: TELEGRAM_IP,
          port: 443,
          path: `/bot${token}/sendMessage`,
          method: "POST",
          headers: {
            "Host": "api.telegram.org",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          agent
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            logger.info("Scheduler", `[API] Telegram response status: ${res.statusCode} — ${data.substring(0, 120)}`);
            if (res.statusCode === 200) resolve();
            else reject(new Error(`Telegram API error: ${res.statusCode} — ${data.substring(0, 200)}`));
          });
        }
      );
      req.on("error", (e) => {
        logger.error("Scheduler", `[API] Request error: ${e.message}`);
        reject(e);
      });
      req.setTimeout(30000, () => { req.destroy(); reject(new Error("Telegram request timed out")); });
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
