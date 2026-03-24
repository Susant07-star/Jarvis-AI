import fs from 'fs';
import path from 'path';

const VERBOSE = process.env.JARVIS_VERBOSE === 'true';
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'debug.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp(): string {
    return new Date().toISOString();
}

function writeToFile(level: string, tag: string, msg: string) {
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp()}] [${level}] [${tag}] ${msg}\n`);
    } catch { /* swallow fs errors silently */ }
}

export const logger = {
    /** Always prints to terminal + file */
    error(tag: string, msg: string, ...args: any[]) {
        console.error(`[${tag}] ❌ ${msg}`, ...args);
        writeToFile('ERROR', tag, msg);
    },

    /** Always prints to terminal + file */
    warn(tag: string, msg: string) {
        console.warn(`[${tag}] ⚠️  ${msg}`);
        writeToFile('WARN', tag, msg);
    },

    /** Writes to debug.log, terminal only if JARVIS_VERBOSE=true */
    debug(tag: string, msg: string) {
        writeToFile('DEBUG', tag, msg);
        if (VERBOSE) {
            console.debug(`[${tag}] 🐛 ${msg}`);
        }
    },

    /** Terminal only if JARVIS_VERBOSE=true, always goes to file */
    info(tag: string, msg: string) {
        writeToFile('INFO', tag, msg);
        if (VERBOSE) {
            console.log(`[${tag}] ${msg}`);
        }
    }
};
