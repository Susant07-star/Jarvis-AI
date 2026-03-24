import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs', 'tasks');

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

export interface ErrorLogEntry {
    timestamp: string;
    taskId: string;
    pageUrl: string;
    actionAttempted: string;
    errorMessage: string;
    memorySnapshot: any;
}

export function logError(entry: ErrorLogEntry): void {
    const logFile = path.join(LOGS_DIR, `${entry.taskId}.log`);
    // Sanitize: strip potential sensitive patterns from snapshot
    let safeSnapshot = JSON.stringify(entry.memorySnapshot || {}).slice(0, 200);
    safeSnapshot = safeSnapshot.replace(/("password"|"token"|"cookie"|"secret"|"apiKey"):\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
    
    const line = [
        `[${entry.timestamp}]`,
        `URL: ${entry.pageUrl}`,
        `Action: ${entry.actionAttempted}`,
        `Error: ${entry.errorMessage}`,
        `Memory: ${safeSnapshot}`,
        '---'
    ].join('\n');
    
    fs.appendFileSync(logFile, line + '\n', 'utf-8');
}

export function getTaskErrors(taskId: string): string {
    const logFile = path.join(LOGS_DIR, `${taskId}.log`);
    if (!fs.existsSync(logFile)) return 'No errors logged.';
    return fs.readFileSync(logFile, 'utf-8');
}

export function alertDeveloper(taskId: string, message: string): void {
    console.error(`\n⚠️  [ALERT] Task ${taskId}: ${message}\n`);
}
