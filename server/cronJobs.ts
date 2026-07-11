import cron from 'node-cron';
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { callResearchWithCascade } from './llmRouter';
import { jarvisScheduler } from './scheduler';
import { ThreadManager } from './threadManager';

export interface ResearchJob {
  id: string;
  topic: string;
  time_of_day: string; // Used as cron expression
  chat_id: number;
  is_active: boolean;
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
      
      logger.info('CronJobs', `Found ${data?.length || 0} active research jobs. Scheduling...`);
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

    const task = cron.schedule(job.time_of_day, async () => {
      logger.info('CronJobs', `Running daily research job: "${job.topic}" for ChatID: ${job.chat_id}`);
      try {
        const query = `Provide a concise summary with important details about: ${job.topic}. Make it 100% error-free and updated.`;
        
        // Use the research cascade
        const result = await callResearchWithCascade(query);
        
        // Now send the result to the telegram bot using scheduler's mechanism (execute immediately)
        const targetChatId = job.chat_id || jarvisScheduler.getAdminChatId() || parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || "0");
        
        if (targetChatId) {
            const reportMsg = `📊 **Research Job Update**\n*Topic:* ${job.topic}\n\n${result.content}`;
            jarvisScheduler.schedule(targetChatId, 'message', reportMsg, 0); 
            
            // Inject into J.A.R.V.I.S. ThreadManager for Total Awareness
            const threadId = `tg_${targetChatId}`;
            ThreadManager.appendMessage(threadId, { 
                role: "assistant", 
                content: `[SYSTEM: I have delivered the scheduled research report for "${job.topic}" to the Boss.]\nReport: ${result.content}` 
            }).catch(e => logger.warn("CronJobs", "Failed to inject awareness to ThreadManager"));
        } else {
            logger.warn('CronJobs', 'No target ChatID available for delivering research job result.');
        }

      } catch (err: any) {
        logger.error('CronJobs', `Failed to execute research job ${job.id}: ${err.message}`);
      }
    }, {
        timezone: "Asia/Kathmandu" // Default to user's local timezone
    });

    this.activeJobs.set(job.id, task);
    logger.info('CronJobs', `Job ${job.id} scheduled with cron: ${job.time_of_day}`);
  }

  public unscheduleJob(id: string) {
    if (this.activeJobs.has(id)) {
      this.activeJobs.get(id)?.stop();
      this.activeJobs.delete(id);
      logger.info('CronJobs', `Job ${id} unscheduled.`);
    }
  }
}

export const cronJobManager = new CronJobManager();
