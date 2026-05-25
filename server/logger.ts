import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'debug.log');

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

function writeToFile(level: string, tag: string, msg: string) {
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp()}] [${level}] [${tag}] ${msg}\n`);
    } catch { /* never swallow silently in prod — but can't log the log failure */ }
}

export const logger = {
    /** Errors: always terminal + file + full stack trace */
    error(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        console.error(`[${tag}] ❌ ${msg}${extra}`);
        writeToFile('ERROR', tag, `${msg}${extra}`);
    },

    /** Warnings: always terminal + file */
    warn(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        console.warn(`[${tag}] ⚠️  ${msg}${extra}`);
        writeToFile('WARN', tag, `${msg}${extra}`);
    },

    /** Info: ALWAYS terminal + file (no VERBOSE gate) */
    info(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        console.log(`[${tag}] ${msg}${extra}`);
        writeToFile('INFO', tag, `${msg}${extra}`);
    },

    /** Debug: always file, terminal only if JARVIS_VERBOSE=true */
    debug(tag: string, msg: string, ...args: any[]) {
        const extra = serialize(args);
        writeToFile('DEBUG', tag, `${msg}${extra}`);
        if (process.env.JARVIS_VERBOSE === 'true') {
            console.debug(`[${tag}] 🐛 ${msg}${extra}`);
        }
    },
};
