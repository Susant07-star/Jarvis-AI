import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

const docsDir = path.resolve(process.cwd(), 'project_docs');
const CHANGELOG_PATH = path.join(docsDir, 'CHANGELOG.md');
const SYSTEM_STATUS_PATH = path.join(docsDir, 'SYSTEM_STATUS.md');

let docsUpdatedInSession = false;

function ensureDocsExist() {
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    if (!fs.existsSync(CHANGELOG_PATH)) fs.writeFileSync(CHANGELOG_PATH, '# Changelog\n\n');
    if (!fs.existsSync(SYSTEM_STATUS_PATH)) fs.writeFileSync(SYSTEM_STATUS_PATH, '# System Status\n\n');
}

/**
 * Automatically appends a change to the CHANGELOG.md and updates documentation state.
 */
export function updateDocs(type: 'Feature' | 'Fix' | 'Improvement', description: string) {
    ensureDocsExist();
    const timestamp = new Date().toISOString();
    
    // Append to CHANGELOG
    const changelogEntry = `- **${type}** [${timestamp}]: ${description}\n`;
    fs.appendFileSync(CHANGELOG_PATH, changelogEntry);
    
    // Update System Status metadata
    const statusContent = fs.readFileSync(SYSTEM_STATUS_PATH, 'utf-8');
    const newStatusContent = statusContent.replace(
        /Last Update:.*/i, 
        `Last Update: ${timestamp} - ${type}: ${description}`
    );
    if (newStatusContent !== statusContent) {
        fs.writeFileSync(SYSTEM_STATUS_PATH, newStatusContent);
    } else {
        fs.appendFileSync(SYSTEM_STATUS_PATH, `\nLast Update: ${timestamp} - ${type}: ${description}\n`);
    }

    docsUpdatedInSession = true;
    logger.info('DocUpdater', `Documentation updated for ${type}: ${description}`);
}

/**
 * Safeguard check: Invoke this periodically or at the end of agent lifecycles.
 */
export function verifyDocIntegrity() {
    if (!docsUpdatedInSession) {
        logger.warn('DocUpdater', '[WARNING] Documentation not updated for recent change');
    }
}
