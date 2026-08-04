import * as cron from 'node-cron';
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { callChatWithCascade, callResearchWithCascade } from './llmRouter';
import { jarvisScheduler } from './scheduler';
import { ThreadManager } from './threadManager';

export interface ResearchJob {
  id: string;
  topic: string;
  time_of_day: string; // Used as cron expression
  chat_id: number;
  is_active: boolean;
}

type RoutineType = 'research' | 'reminder' | 'message';

interface ParsedRoutine {
  type: RoutineType;
  content: string;
}

const ROUTINE_PREFIX = '__JARVIS_ROUTINE__:';

function parseRoutineTopic(topic: string): ParsedRoutine {
  if (topic.startsWith(ROUTINE_PREFIX)) {
    try {
      const payload = JSON.parse(topic.slice(ROUTINE_PREFIX.length));
      const type = payload.type as RoutineType;
      if (['research', 'reminder', 'message'].includes(type) && typeof payload.content === 'string') {
        return { type, content: payload.content.trim() };
      }
    } catch (err: any) {
      logger.warn('CronJobs', `Failed to parse structured routine topic: ${err.message}`);
    }
  }

  return { type: 'research', content: topic };
}

function getRoutineLabel(type: RoutineType): string {
  if (type === 'research') return 'Research Update';
  if (type === 'reminder') return 'Reminder';
  return 'Message';
}

function fallbackRoutineMessage(routine: ParsedRoutine): string {
  if (routine.type === 'reminder') return `Reminder: ${routine.content}`;
  return routine.content;
}

class CronJobManager {
  private activeJobs: Map<string, cron.ScheduledTask> = new Map();

  public async init() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('research_jobs').select('*').eq('is_active', true);
      if (error) {
        logger.error('CronJobs', 'Failed to fetch research_jobs', error);
        return;
      }
      
      logger.info('CronJobs', `Found ${data?.length || 0} active recurring routines. Scheduling...`);
      for (const job of data || []) {
        this.scheduleJob(job);
      }
    } catch (err) {
      logger.error('CronJobs', 'Init error', err);
    }
  }

  public scheduleJob(job: ResearchJob) {
    if (this.activeJobs.has(job.id)) {
      this.activeJobs.get(job.id)?.stop();
      this.activeJobs.delete(job.id);
    }

    if (!job.is_active) return;

    // Validate cron expression
    if (!cron.validate(job.time_of_day)) {
      logger.error('CronJobs', `Invalid cron expression for job ${job.id}: ${job.time_of_day}`);
      return;
    }

    const routine = parseRoutineTopic(job.topic);

    const task = cron.schedule(job.time_of_day, async () => {
      logger.info('CronJobs', `Running ${routine.type} routine: "${routine.content}" for ChatID: ${job.chat_id}`);
      try {
        const targetChatId = job.chat_id || jarvisScheduler.getAdminChatId() || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || "0");
        
        if (targetChatId) {
          let message = '';

          if (routine.type === 'research') {
            const query = `Provide a concise summary with important details about: ${routine.content}. Make it 100% error-free and updated.`;
            const result = await callResearchWithCascade(query);
            message = `**Research Update**\n*Topic:* ${routine.content}\n\n${result.content}`;
          } else {
            try {
              const result = await callChatWithCascade([
                {
                  role: 'system',
                  content: `You are J.A.R.V.I.S., a calm, capable AI assistant.
Write one short Telegram ${routine.type === 'reminder' ? 'reminder' : 'message'} for the user.
The message must feel human and useful, not cringe, not dramatic, and not repetitive.
Vary the phrasing naturally each time while preserving the exact meaning.
Keep it under 35 words. Do not add hashtags, markdown headings, sign-offs, or mention that you are an AI.`
                },
                {
                  role: 'user',
                  content: `Core intent: ${routine.content}`
                }
              ]);
              message = result.content?.trim() || fallbackRoutineMessage(routine);
            } catch (err: any) {
              logger.warn('CronJobs', `Failed to compose ${routine.type} routine with LLM: ${err.message}`);
              message = fallbackRoutineMessage(routine);
            }
          }

          const routineMsg = routine.type === 'research'
            ? message
            : `**${getRoutineLabel(routine.type)}**\n\n${message}`;

          jarvisScheduler.schedule(targetChatId, 'message', routineMsg, 0);

          const threadId = `tg_${targetChatId}`;
          ThreadManager.appendMessage(threadId, {
            role: 'assistant',
            content: `[SYSTEM: I have delivered the scheduled ${routine.type} routine "${routine.content}" to the Boss.]\nMessage: ${routineMsg}`
          }).catch(e => logger.warn("CronJobs", "Failed to inject awareness to ThreadManager"));
        } else {
          logger.warn('CronJobs', `No target ChatID available for delivering ${routine.type} routine.`);
        }

      } catch (err: any) {
        logger.error('CronJobs', `Failed to execute routine ${job.id}: ${err.message}`);
      }
    }, {
        timezone: "Asia/Kathmandu" // Default to user's local timezone
    });

    this.activeJobs.set(job.id, task);
    logger.info('CronJobs', `Routine ${job.id} scheduled with cron: ${job.time_of_day}`);
  }

  public unscheduleJob(id: string) {
    if (this.activeJobs.has(id)) {
      this.activeJobs.get(id)?.stop();
      this.activeJobs.delete(id);
      logger.info('CronJobs', `Routine ${id} unscheduled.`);
    }
  }
}

export const cronJobManager = new CronJobManager();
