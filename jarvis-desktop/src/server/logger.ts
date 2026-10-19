import fs from 'fs';
import path from 'path';
import util from 'util';
import { EventEmitter } from 'events';

export const logEmitter = new EventEmitter();

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'debug.log');
const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
};

let consoleCaptureInstalled = false;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp(): string {
    return new Date().toISOString();
}

function serialize(args: any[]): string {
    return args.map(a => {
        if (a === undefined) return '';
        if (a instanceof Error) return `\n  Stack: ${a.stack}`;
        if (typeof a === 'object') {
            try { return '\n  ' + JSON.stringify(a, null, 2); } catch { return String(a); }
        }
        return String(a);
    }).join(' ');
}

function serializeConsole(args: any[]): string {
    return args.map((arg) => {
        if (typeof arg === 'string') return arg;
        return util.inspect(arg, { depth: 8, colors: false, compact: false });
    }).join(' ');
}

function writeToFile(level: string, tag: string, msg: string) {
    try {
        const logLine = `[${timestamp()}] [${level}] [${tag}] ${msg}`;
        fs.appendFileSync(LOG_FILE, logLine + '\n');
        logEmitter.emit('log', logLine);
    } catch { /* never swallow silently in prod - but can't log the log failure */ }
}

export const logger = {
    /** Errors: always terminal + file + full stack trace */
    error(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        originalConsole.error(`[${tag}] [ERROR] ${msg}${extra}`);
        writeToFile('ERROR', tag, `${msg}${extra}`);
    },

    /** Warnings: always terminal + file */
    warn(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        originalConsole.warn(`[${tag}] [WARN] ${msg}${extra}`);
        writeToFile('WARN', tag, `${msg}${extra}`);
    },

    /** Info: ALWAYS terminal + file */
    info(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        
        // Filter out spammy background telemetry from the terminal to keep it clean
        const isSpam = tag === 'SystemMonitor' || 
                       tag === 'VoiceEngine' && msg.includes('Heartbeat') ||
                       msg.includes('System resources normal');
                       
        writeToFile('INFO', tag, `${msg}${extra}`);
        if (!isSpam) {
            originalConsole.log(`[${tag}] ${msg}${extra}`);
        }
    },

    /** Debug: always file, terminal by default (spam filtered) */
    debug(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        writeToFile('DEBUG', tag, `${msg}${extra}`);
        
        // Filter out spammy background telemetry from the terminal to keep it clean
        const isSpam = tag === 'SystemMonitor' || 
                       tag === 'VoiceEngine' && msg.includes('Heartbeat') ||
                       tag === 'MetricsTracker' ||
                       msg.includes('Heartbeat');
                       
        if (!isSpam) {
            originalConsole.debug(`[${tag}] [DEBUG] ${msg}${extra}`);
        }
    },
};

export function installConsoleLogCapture() {
    if (consoleCaptureInstalled) return;
    consoleCaptureInstalled = true;

    console.log = (...args: any[]) => {
        originalConsole.log(...args);
        writeToFile('INFO', 'Console', serializeConsole(args));
    };

    console.info = (...args: any[]) => {
        originalConsole.info(...args);
        writeToFile('INFO', 'Console', serializeConsole(args));
    };

    console.warn = (...args: any[]) => {
        originalConsole.warn(...args);
        writeToFile('WARN', 'Console', serializeConsole(args));
    };

    console.error = (...args: any[]) => {
        originalConsole.error(...args);
        writeToFile('ERROR', 'Console', serializeConsole(args));
    };

    console.debug = (...args: any[]) => {
        originalConsole.debug(...args);
        writeToFile('DEBUG', 'Console', serializeConsole(args));
    };
}
