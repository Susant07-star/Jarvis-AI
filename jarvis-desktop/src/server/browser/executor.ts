import { initBrowser, getContext } from './browserManager';
import { 
    openUrl, clickElement, typeText, pressKey, scroll,
    searchYouTube, clickFirstVideo, likeVideo, commentOnVideo,
    openNewTab, switchTab, closeCurrentTab,
    universalClick, universalType
} from './actions';
import { MemoryManager, LocalJsonAdapter } from './memoryManager';
import { TaskTracker } from './taskTracker';
import { logError, alertDeveloper } from './errorLogger';
import path from 'path';

// ===== Shared Instances =====
const DATA_DIR = path.resolve(process.cwd(), 'data');
const operationalAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'operational'));
const llmAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'llm'));
const taskAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'tasks'));

export const memory = new MemoryManager(operationalAdapter, llmAdapter);
export const tracker = new TaskTracker(taskAdapter);

export interface BrowserAction {
    action: 'open_url' | 'click' | 'type' | 'press' | 'scroll' |
            'youtube_search' | 'youtube_click_video' | 'youtube_like' |
            'youtube_comment' | 'open_tab' | 'switch_tab' | 'close_tab' |
            'universal_click' | 'universal_type' | 'schedule_call' | 'schedule_message';
    url?: string;
    selector?: string;
    text?: string;
    key?: string;
    direction?: 'up' | 'down';
    query?: string;
    index?: number;
    delay_seconds?: number;
    reason?: string;
    selectorStrategy?: 'role'|'text'|'placeholder'|'selector';
    selectorValue?: string;
    name?: string;
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function runAction(command: BrowserAction): Promise<void> {
    const context = getContext();
    const pages = context.pages();
    const page = pages[pages.length - 1];

    switch (command.action) {
        case 'open_url':
            if (command.url) await openUrl(page, command.url);
            break;
        case 'click':
            if (command.selector) await clickElement(page, command.selector);
            break;
        case 'type':
            if (command.selector && command.text) await typeText(page, command.selector, command.text);
            break;
        case 'universal_click':
            if (command.selectorStrategy && command.selectorValue)
                await universalClick(page, command.selectorStrategy, command.selectorValue, command.name);
            break;
        case 'universal_type':
            if (command.selectorStrategy && command.selectorValue && command.text)
                await universalType(page, command.selectorStrategy, command.selectorValue, command.text, command.name);
            break;
        case 'press':
            if (command.key) await pressKey(page, command.key);
            break;
        case 'scroll':
            if (command.direction) await scroll(page, command.direction);
            break;
        case 'youtube_search':
            if (command.query) await searchYouTube(page, command.query);
            break;
        case 'youtube_click_video':
            await clickFirstVideo(page);
            break;
        case 'youtube_like':
            await likeVideo(page);
            break;
        case 'youtube_comment':
            if (command.text) await commentOnVideo(page, command.text);
            break;
        case 'open_tab':
            if (command.url) await openNewTab(context, command.url);
            break;
        case 'switch_tab':
            if (command.index !== undefined) await switchTab(context, command.index);
            break;
        case 'close_tab':
            await closeCurrentTab(page);
            break;
        default:
            throw new Error(`Unknown action: ${command.action}`);
    }
}

export async function executePlan(plan: BrowserAction[], site = 'unknown', goal = 'unknown') {
    await initBrowser();
    
    const stepNames = plan.map(p => p.action);
    const task = tracker.createTask(site, goal, stepNames);
    
    console.log(`[Executor] Starting plan with ${plan.length} steps for goal: ${goal}`);
    
    for (const [i, action] of plan.entries()) {
        // Skip already completed steps (resume support)
        if (tracker.isStepCompleted(task.task_id, i)) {
            console.log(`Step ${i + 1} (${action.action}): Already completed, skipping.`);
            continue;
        }

        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
            try {
                console.log(`Step ${i + 1} executing... (${action.action})${attempts > 0 ? ` [Retry ${attempts}/2]` : ''}`);
                await runAction(action);
                
                tracker.updateStep(task.task_id, i, 'completed');
                memory.saveMemory(`${task.task_id}_step_${i}`, {
                    action,
                    status: 'completed',
                    timestamp: new Date().toISOString()
                });
                success = true;
                console.log(`Step ${i + 1} completed successfully.`);
            } catch (e: any) {
                attempts++;
                const pageUrl = getContext().pages().slice(-1)[0]?.url() || 'unknown';
                
                logError({
                    timestamp: new Date().toISOString(),
                    taskId: task.task_id,
                    pageUrl,
                    actionAttempted: action.action,
                    errorMessage: e.message,
                    memorySnapshot: memory.getMemory(`${task.task_id}_step_${i}`)
                });

                if (attempts < 3) {
                    const canRetry = tracker.markStepRetry(task.task_id, i);
                    if (!canRetry) {
                        tracker.updateStep(task.task_id, i, 'failed', e.message);
                        alertDeveloper(task.task_id, `Persistent failure at step ${i + 1} (${action.action}): ${e.message}`);
                        break;
                    }
                    console.log(`Action failed: ${e.message}. Retrying...`);
                    await delay(2000);
                } else {
                    tracker.updateStep(task.task_id, i, 'failed', e.message);
                    alertDeveloper(task.task_id, `Persistent failure at step ${i + 1} (${action.action}): ${e.message}`);
                }
            }
        }

        if (!success) {
            console.error(`Plan halted at step ${i + 1} due to persistent failure.`);
            tracker.saveSnapshot(task.task_id, {
                completedSteps: i,
                totalSteps: plan.length,
                timestamp: new Date().toISOString()
            });
            break;
        }

        await delay(2000); // Human delay between steps
    }
    
    // Final summary
    const finalTask = tracker.getTask(task.task_id);
    if (finalTask?.status === 'completed') {
        console.log(`[TaskTracker] Task ${task.task_id} completed successfully.`);
    } else {
        console.log(`[TaskTracker] Task ${task.task_id} ended with status: ${finalTask?.status}`);
    }
    
    memory.summarizeMemory(task.task_id);
    return task.task_id;
}
