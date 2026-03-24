/**
 * Unified bridge between the existing LLM tool-call pipeline
 * and the new Planner → Executor → Memory/TaskTracker system.
 *
 * Both api.ts (chat) and websocket.ts (voice) should call this
 * after receiving a user message so that every interaction—regardless
 * of input method—flows through the same tracking infrastructure.
 */

import { MemoryManager, LocalJsonAdapter } from './memoryManager';
import { TaskTracker } from './taskTracker';
import { logError } from './errorLogger';
import path from 'path';

// ===== Singleton Instances (shared across chat + voice) =====
const DATA_DIR = path.resolve(process.cwd(), 'data');
const operationalAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'operational'));
const llmAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'llm'));
const taskAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'tasks'));

export const sharedMemory = new MemoryManager(operationalAdapter, llmAdapter);
export const sharedTracker = new TaskTracker(taskAdapter);

export type InputSource = 'chat' | 'voice';

/**
 * Log every user↔jarvis exchange into the unified memory + task system.
 * Call this from both api.ts and websocket.ts after generating a response.
 */
export function logInteraction(
    source: InputSource,
    userMessage: string,
    jarvisResponse: string,
    meta?: {
        toolCalls?: string[];
        browserCommands?: any[];
        pageUrl?: string;
    }
) {
    const ts = new Date().toISOString();
    const key = `interaction_${Date.now()}`;

    sharedMemory.saveMemory(key, {
        source,
        userMessage,
        jarvisResponse: jarvisResponse.slice(0, 1000), // cap for memory efficiency
        toolCalls: meta?.toolCalls || [],
        browserCommands: meta?.browserCommands || [],
        pageUrl: meta?.pageUrl || '',
        timestamp: ts
    });
}

/**
 * Track a browser-action task triggered from either input mode.
 * Creates a task in the tracker with identical schema regardless of source.
 */
export function trackBrowserTask(
    source: InputSource,
    goal: string,
    commands: any[],
    site = 'unknown'
) {
    const stepNames = commands.map((c: any) => c.type || c.action || 'unknown');
    const task = sharedTracker.createTask(site, `[${source}] ${goal}`, stepNames);

    // Mark all steps completed (since the Python agent executes them externally)
    stepNames.forEach((_, i) => {
        sharedTracker.updateStep(task.task_id, i, 'completed');
    });

    return task.task_id;
}

/**
 * Track a failed browser action from either input mode.
 */
export function trackBrowserError(
    source: InputSource,
    taskId: string,
    stepIndex: number,
    error: string,
    pageUrl = 'unknown'
) {
    sharedTracker.updateStep(taskId, stepIndex, 'failed', error);

    logError({
        timestamp: new Date().toISOString(),
        taskId,
        pageUrl,
        actionAttempted: `[${source}] step ${stepIndex}`,
        errorMessage: error,
        memorySnapshot: null
    });
}

/**
 * Get summarized memory context for LLM prompts.
 * Both chat and voice should call this to add recent interaction context.
 */
export function getRecentContext(maxEntries = 5): string {
    const keys = operationalAdapter.listKeys('interaction_');
    const recent = keys.slice(-maxEntries);
    const entries = recent.map(k => {
        const data = sharedMemory.getMemory(k);
        if (!data) return '';
        return `[${data.source}] User: ${data.userMessage?.slice(0, 100)} → JARVIS: ${data.jarvisResponse?.slice(0, 100)}`;
    }).filter(Boolean);
    return entries.join('\n');
}
