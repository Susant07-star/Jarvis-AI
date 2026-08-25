import { v4 as uuidv4 } from 'uuid';
import { IStorageAdapter } from './memoryManager';

export interface TaskStep {
    action: string;
    status: 'pending' | 'completed' | 'failed' | 'skipped';
    retries: number;
    error?: string;
}

export interface TaskRecord {
    task_id: string;
    site: string;
    goal: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    steps: TaskStep[];
    last_step: string;
    timestamp: string;
    updated_at: string;
    memory_snapshot: any;
    errors: string[];
}

export class TaskTracker {
    private storage: IStorageAdapter;

    constructor(storage: IStorageAdapter) {
        this.storage = storage;
    }

    createTask(site: string, goal: string, steps: string[]): TaskRecord {
        const task: TaskRecord = {
            task_id: uuidv4(),
            site,
            goal,
            status: 'pending',
            steps: steps.map(s => ({ action: s, status: 'pending', retries: 0 })),
            last_step: '',
            timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            memory_snapshot: {},
            errors: []
        };
        this.storage.write(`task_${task.task_id}`, task);
        console.log(`[TaskTracker] Created task: ${task.task_id} (${goal})`);
        return task;
    }

    getTask(taskId: string): TaskRecord | null {
        return this.storage.read(`task_${taskId}`);
    }

    updateStep(taskId: string, stepIndex: number, status: 'completed' | 'failed', error?: string): void {
        const task = this.getTask(taskId);
        if (!task || !task.steps[stepIndex]) return;
        
        task.steps[stepIndex].status = status;
        if (error) {
            task.steps[stepIndex].error = error;
            task.errors.push(`Step ${stepIndex} (${task.steps[stepIndex].action}): ${error}`);
        }
        task.last_step = task.steps[stepIndex].action;
        task.updated_at = new Date().toISOString();
        
        // Update overall status
        const allDone = task.steps.every(s => s.status === 'completed' || s.status === 'skipped');
        const anyFailed = task.steps.some(s => s.status === 'failed' && s.retries >= 2);
        
        if (allDone) task.status = 'completed';
        else if (anyFailed) task.status = 'failed';
        else task.status = 'in_progress';
        
        this.storage.write(`task_${taskId}`, task);
    }

    markStepRetry(taskId: string, stepIndex: number): boolean {
        const task = this.getTask(taskId);
        if (!task || !task.steps[stepIndex]) return false;
        
        if (task.steps[stepIndex].retries < 2) {
            task.steps[stepIndex].retries++;
            task.steps[stepIndex].status = 'pending';
            task.updated_at = new Date().toISOString();
            this.storage.write(`task_${taskId}`, task);
            return true;
        }
        return false;
    }

    isStepCompleted(taskId: string, stepIndex: number): boolean {
        const task = this.getTask(taskId);
        return task?.steps[stepIndex]?.status === 'completed';
    }

    saveSnapshot(taskId: string, snapshot: any): void {
        const task = this.getTask(taskId);
        if (!task) return;
        task.memory_snapshot = snapshot;
        task.updated_at = new Date().toISOString();
        this.storage.write(`task_${taskId}`, task);
    }

    listTasks(filter?: 'pending' | 'in_progress' | 'completed' | 'failed'): TaskRecord[] {
        const keys = this.storage.listKeys('task_');
        const tasks: TaskRecord[] = keys.map(k => this.storage.read(k)).filter(Boolean);
        return filter ? tasks.filter(t => t.status === filter) : tasks;
    }

    getLastTaskForGoal(goal: string): TaskRecord | null {
        const tasks = this.listTasks();
        const match = tasks
            .filter(t => t.goal.toLowerCase().includes(goal.toLowerCase()))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return match[0] || null;
    }
}
