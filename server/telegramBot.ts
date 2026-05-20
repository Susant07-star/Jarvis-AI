/**
 * telegramBot.ts — J.A.R.V.I.S. Telegram Integration
 * =====================================================
 * Architecture:
 *   Telegram → telegramBot.ts → determineOrchestrationMode()
 *                                  ↓ direct
 *                             callChatWithCascade()   → reply text
 *                                  ↓ agent (research)
 *                             callResearchWithCascade() → reply text
 *
 * Network: Uses a custom DNS-bypass HTTPS agent to work around ISP-level
 *          DNS hijacking of api.telegram.org (a common issue in Nepal).
 *          The Telegram IP 149.154.167.220 was manually verified as reachable.
 *
 * Polling: Uses raw https.request (NOT fetch, NOT the library's polling)
 *          because native fetch does not support custom agents in Node.js.
 */

import TelegramBot from "node-telegram-bot-api";
import https from "https";
import dns from "dns";
import fs from "fs";
import path from "path";
import Groq from "groq-sdk";
import { logger } from "./logger";
import { determineOrchestrationMode } from "./orchestrator";
import { callChatWithCascade, callResearchWithCascade, getRandomKey, silenceKey, PlannerResponse } from "./llmRouter";
import { buildPrompt } from "./agent_prompts/prompt_builder";
import { ThreadManager, ThreadMessage } from "./threadManager";

dns.setDefaultResultOrder("ipv4first");

// ── DNS Bypass Agent ──────────────────────────────────────────────────────────
// Connects directly to Telegram's verified IP, bypassing ISP DNS poisoning.

const dnsBypassAgent = new https.Agent({
  keepAlive: true,
  lookup: (hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? {} : options;
    if (hostname === "api.telegram.org") {
      return cb(null, "149.154.167.220", 4);
    }
    dns.lookup(hostname, opts, cb);
  },
} as any);

// ── Telegram HTTPS Helper ─────────────────────────────────────────────────────
// We connect DIRECTLY to the IP to bypass DNS hijacking, but we must set the 
// 'Host' header so Telegram's servers know we want api.telegram.org.

const TELEGRAM_IP = "149.154.167.220";

function telegramGet(token: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const query = new URLSearchParams(params as any).toString();
  const urlPath = `/bot${token}/${method}${query ? "?" + query : ""}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: TELEGRAM_IP,
        port: 443,
        path: urlPath,
        method: "GET",
        headers: {
          "Host": "api.telegram.org"
        },
        // We still use an agent for connection pooling
        agent: new https.Agent({ keepAlive: true, rejectUnauthorized: false })
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON from Telegram: ${data.substring(0, 100)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(35000, () => { req.destroy(); reject(new Error("Telegram request timed out")); });
    req.end();
  });
}

function telegramPost(token: string, method: string, body: Record<string, any>): Promise<any> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: TELEGRAM_IP,
        port: 443,
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: { 
          "Host": "api.telegram.org",
          "Content-Type": "application/json", 
          "Content-Length": Buffer.byteLength(payload) 
        },
        agent: new https.Agent({ keepAlive: true, rejectUnauthorized: false })
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("Invalid JSON")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Telegram POST timed out")); });
    req.write(payload);
    req.end();
  });
}

// ── File Downloader ───────────────────────────────────────────────────────────

async function downloadTelegramFile(token: string, fileId: string): Promise<string> {
  const fileInfo = await telegramGet(token, "getFile", { file_id: fileId });
  const filePath = fileInfo?.result?.file_path;
  if (!filePath) throw new Error("Telegram returned no file_path");

  const urlPath = `/file/bot${token}/${filePath}`;
  let ext = path.extname(filePath) || ".ogg";
  
  // Groq is strict about extensions. Telegram's .oga is technically .ogg
  if (ext === ".oga") ext = ".ogg";

  const tmpDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const localPath = path.join(tmpDir, `tg_voice_${Date.now()}${ext}`);

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(localPath);
    const req = https.request(
      { 
        hostname: TELEGRAM_IP, 
        port: 443,
        path: urlPath, 
        headers: { "Host": "api.telegram.org" },
        agent: new https.Agent({ keepAlive: true, rejectUnauthorized: false })
      },
      (res) => {
        res.pipe(dest);
        dest.on("finish", () => { dest.close(); resolve(localPath); });
      }
    );
    req.on("error", (e) => { fs.unlink(localPath, () => {}); reject(e); });
    req.end();
  });
}

// ── Transcription ─────────────────────────────────────────────────────────────

async function transcribeFile(filePath: string): Promise<string> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    const apiKey = getRandomKey(process.env.GROQ_API_KEY);
    if (!apiKey) throw new Error("No GROQ_API_KEY available for transcription");

    const groq = new Groq({ apiKey });
    try {
      logger.info("TelegramBot", `Transcribing (attempt ${attempt + 1}): ${filePath}`);
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3",
        prompt: "Nepali, English, JARVIS, Susant, AI Assistant", // Context hint for better accuracy
      });
      
      try { fs.unlinkSync(filePath); } catch {}
      const text = transcription.text.trim();
      logger.info("TelegramBot", `STT: "${text}"`);
      return text;
    } catch (err: any) {
      logger.warn("TelegramBot", `Transcription attempt ${attempt + 1} failed: ${err.message}`);
      if (err.message?.includes("401") || err.message?.includes("429") || err.message?.includes("quota")) {
        silenceKey(apiKey);
      }
      attempt++;
      if (attempt >= maxRetries) throw err;
    }
  }
  return "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── JARVIS Brain ──────────────────────────────────────────────────────────────

async function processMessage(userText: string, chatId: number): Promise<PlannerResponse> {
  const startTime = Date.now();
  logger.info("TelegramBot", `[NEURAL START] Processing: "${userText}" for ${chatId}`);

  const decision = await determineOrchestrationMode(userText);
  logger.info("TelegramBot", `[INTENT] Mode: ${decision.mode.toUpperCase()} | Intent: ${decision.intent} | Time: ${Date.now() - startTime}ms`);
  
  const threadId = `tg_${chatId}`;
  
  if (decision.mode === "agent") {
    try {
      const { createPlan } = await import("./browser/planner");
      const { jarvisScheduler } = await import("./scheduler");
      
      const planStartTime = Date.now();
      const plan = await createPlan(userText);
      logger.info("TelegramBot", `[PLANNER] Reasoned: ${JSON.stringify(plan.internal_steps)} | Time: ${Date.now() - planStartTime}ms`);

      // Execute any non-browser actions (like scheduling)
      const scheduleActions = plan.actions.filter(a => a.action === 'schedule_call' || a.action === 'schedule_message');
      
      for (const sa of scheduleActions) {
        const taskId = jarvisScheduler.schedule(chatId, sa.action === 'schedule_call' ? 'call' : 'message', sa.reason || sa.text || "Scheduled task", sa.delay_seconds || 0);
        logger.info("TelegramBot", `[TOOL] Scheduler registered: ${sa.action} (TaskID: ${taskId}) in ${sa.delay_seconds}s`);
      }

      // FIX: If all actions were schedule actions, the scheduler already sent its own Telegram message(s).
      // Do NOT generate a second chat confirmation — that causes double messages. Return empty string.
      if (plan.actions.length > 0 && scheduleActions.length === plan.actions.length) {
        logger.info("TelegramBot", `[NEURAL END] All actions were scheduler tasks. Scheduler handles confirmation. Suppressing chat reply.`);
        return { content: "", tokens: 0, provider: "Scheduler", model: "N/A" };
      }

      const result = await callResearchWithCascade(userText);
      result.internal_steps = plan.internal_steps;
      logger.info("TelegramBot", `[NEURAL END] [BRAIN: ${result.model}] | Time: ${Date.now() - startTime}ms | Tokens: ${result.tokens}`);
      return result;
    } catch (err: any) {
      logger.error("TelegramBot", `[FATAL] Agent task failed: ${err.message}`);
      return { content: `Sorry boss, I encountered an error while processing that task.`, tokens: 0, provider: "Error", model: "N/A" };
    }
  }

  const history = await ThreadManager.getHistory(threadId, 20);
  const basePrompt = buildPrompt("voice");
  // Enforce strict brevity for Telegram — no essays, just sharp responses
  const systemPrompt = basePrompt + `

[TELEGRAM CONCISENESS PROTOCOL]
You are responding via Telegram. Keep ALL replies under 40 words. Be direct, sharp, and witty — like the real JARVIS. No essays. No padding. No restating the question. One or two punchy sentences maximum.`;
  
  const messages: ThreadMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userText }
  ];

  try {
    const result = await callChatWithCascade(messages);
    
    // Persist the conversation
    await ThreadManager.appendMessage(threadId, { role: "user", content: userText });
    await ThreadManager.appendMessage(threadId, { role: "assistant", content: result.content });
    
    logger.info("TelegramBot", `[NEURAL END] [BRAIN: ${result.model}] | Time: ${Date.now() - startTime}ms | Tokens: ${result.tokens}`);
    return result;
  } catch (err: any) {
    logger.error("TelegramBot", `[FATAL] Chat failed: ${err.message}`);
    return { content: `Sorry boss, all my brains are busy right now.`, tokens: 0, provider: "Error", model: "N/A" };
  }
}

// ── Send reply with long-message splitting ────────────────────────────────────

async function sendReply(token: string, chatId: number, text: string, replyMarkup?: any, parseMode?: string): Promise<void> {
  const MAX = 4000;
  if (text.length <= MAX) {
    const payload: any = { chat_id: chatId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    if (parseMode) payload.parse_mode = parseMode;
    await telegramPost(token, "sendMessage", payload);
  } else {
    for (let i = 0; i < text.length; i += MAX) {
      const isLast = i + MAX >= text.length;
      const payload: any = { chat_id: chatId, text: text.slice(i, i + MAX) };
      if (isLast && replyMarkup) payload.reply_markup = replyMarkup;
      if (parseMode) payload.parse_mode = parseMode;
      await telegramPost(token, "sendMessage", payload);
    }
  }
}

async function sendTyping(token: string, chatId: number): Promise<void> {
  await telegramPost(token, "sendChatAction", { chat_id: chatId, action: "typing" });
}

// ── Proactive Call Back ───────────────────────────────────────────────────────
export async function triggerProactiveCall(chatId: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webAppUrl = process.env.WEB_APP_URL;
  if (!token || !webAppUrl) return;

  const text = `🚨 **INCOMING NEURAL LINK REQUEST**\n\nBoss, J.A.R.V.I.S. is requesting an active voice link for an urgent update.\n\n**STATUS**: Waiting for connection...`;
  
  await telegramPost(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: JSON.stringify({
      inline_keyboard: [[
        { text: "📞 ACCEPT CALL", web_app: { url: webAppUrl } }
      ]]
    })
  });
}

// ── Message Handler ───────────────────────────────────────────────────────────

async function handleUpdate(token: string, update: any): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  const chatId: number = msg.chat.id;
  const webAppUrl = process.env.WEB_APP_URL;

  // Cache the chat ID so browser-initiated voice tasks know who to call
  import("./scheduler").then(({ jarvisScheduler }) => {
    jarvisScheduler.setAdminChatId(chatId);
  }).catch(() => {});

  if (msg.text === "/start") {
    const name = msg.from?.first_name || "Boss";
    const text = `Welcome back, ${name}. I am J.A.R.V.I.S. (Just A Rather Very Intelligent System).\n\nAll neural pathways are active. You can:\n• Send me a text message\n• Send me a voice note 🎙\n• Ask me anything — research, coding, general knowledge\n\nHow can I assist you today?`;
    
    let replyMarkup = undefined;
    if (webAppUrl) {
      replyMarkup = {
        inline_keyboard: [[
          { text: "🚀 Open HUD", url: webAppUrl.replace("/telegram-call", "/") },
          { text: "📞 Call J.A.R.V.I.S.", web_app: { url: webAppUrl } }
        ]]
      };
    }

    await sendReply(token, chatId, text, replyMarkup);
    return;
  }

  // Skip other commands
  if (msg.text?.startsWith("/")) return;

  try {
    // Auto-disarm active watchdog if Boss responds in ANY way (they are awake!)
    const { jarvisScheduler } = await import("./scheduler");
    const wasAlarmActive = await jarvisScheduler.ackAlarm(chatId);
    if (wasAlarmActive) {
      // Alarm was active and successfully disarmed. Don't reply with generic chat responses.
      return;
    }

    let userText = "";

    if (msg.text) {
      userText = msg.text;
    } else if (msg.voice || msg.audio) {
      await sendTyping(token, chatId);
      const fileId = msg.voice?.file_id || msg.audio?.file_id;
      const localPath = await downloadTelegramFile(token, fileId);
      userText = await transcribeFile(localPath);

      if (!userText) {
        await sendReply(token, chatId, "Sorry boss, I couldn't understand the voice note. Please try again!");
        return;
      }
      // Echo back transcription
      await telegramPost(token, "sendMessage", {
        chat_id: chatId,
        text: `🎙 *Heard:* "${userText}"`,
        parse_mode: "Markdown",
      });
    } else {
      return; // Ignore stickers, images, etc.
    }

    await sendTyping(token, chatId);
    const result = await processMessage(userText, chatId);
    
    // DEEP DEBUGGING: Log the actual content being sent back to the user
    logger.info("TelegramBot", `Full AI Response for ${chatId}: "${result.content.substring(0, 500)}${result.content.length > 500 ? '...' : ''}"`);

    // Sync to global session memory for Voice UI and Browser Chat
    const { saveToMemory } = await import("./memory");
    saveToMemory("user", userText);
    if (result.content) saveToMemory("jarvis", result.content);

    // FIX: If the scheduler already sent the reply (empty content), skip sending another message.
    if (!result.content) {
      logger.info("TelegramBot", `[SKIP REPLY] Content is empty — scheduler already handled response. No duplicate message sent.`);
      return;
    }

    let replyText = result.content;
    let parseMode: string | undefined = undefined;

    if (result.internal_steps && result.internal_steps.length > 0) {
      const escapedContent = escapeHtml(result.content);
      const escapedSteps = result.internal_steps.map(step => escapeHtml(step)).join('\n');
      replyText = `${escapedContent}\n\n<blockquote expandable>🧠 <b>Thought Process:</b>\n${escapedSteps}</blockquote>`;
      parseMode = "HTML";
    }

    // Send the clean reply without technical metadata
    await sendReply(token, chatId, replyText, undefined, parseMode);

  } catch (err: any) {
    logger.error("TelegramBot", `Unhandled error: ${err.message}`);
    try { await sendReply(token, chatId, "Sorry boss, something went wrong. Please try again!"); } catch {}
  }
}

// ── Main Bot Init ─────────────────────────────────────────────────────────────

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TelegramBot", "TELEGRAM_BOT_TOKEN not set — Telegram bot is disabled.");
    return;
  }

  let lastUpdateId = 0;
  let isRunning = true;

  async function pollUpdates(): Promise<void> {
    while (isRunning) {
      try {
        const data = await telegramGet(token, "getUpdates", {
          offset: lastUpdateId + 1,
          timeout: 30,
          allowed_updates: JSON.stringify(["message"]),
        });

        if (data.ok && data.result?.length) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            handleUpdate(token, update).catch((e) =>
              logger.error("TelegramBot", `Handler error: ${e.message}`)
            );
          }
        }
      } catch (err: any) {
        const isTimeout = err.message?.includes("timed out") || err.message?.includes("ETIMEDOUT");
        if (!isTimeout) {
          logger.error("TelegramBot", `Polling Error: ${err.message}`);
          // Wait before retry on non-timeout errors
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
  }

  logger.info("TelegramBot", `Bot started with DNS-Bypass mode. IP: 149.154.167.220`);
  
  // Set the persistent Menu Button (on the navigation bar)
  const webAppUrl = process.env.WEB_APP_URL;
  if (webAppUrl) {
    telegramPost(token, "setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "📞 Call",
        web_app: { url: webAppUrl }
      }
    }).then(res => {
      if (res.ok) logger.info("TelegramBot", "Menu button set successfully.");
      else logger.warn("TelegramBot", "Failed to set menu button: " + JSON.stringify(res));
    }).catch(e => logger.error("TelegramBot", "Error setting menu button: " + e.message));
  }

  pollUpdates();

}
