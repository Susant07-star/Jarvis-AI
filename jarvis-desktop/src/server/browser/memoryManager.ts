import fs from 'fs';
import path from 'path';
import { encryptData, decryptData, isEncrypted } from './encryption';

// ===== Storage-Agnostic Interface =====
export interface IStorageAdapter {
    read(key: string): any;
    write(key: string, value: any): void;
    exists(key: string): boolean;
    delete(key: string): void;
    listKeys(prefix?: string): string[];
}

// ===== Local JSON Adapter =====
export class LocalJsonAdapter implements IStorageAdapter {
    private baseDir: string;

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    private filePath(key: string): string {
        return path.join(this.baseDir, `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    }

    read(key: string): any {
        const fp = this.filePath(key);
        if (!fs.existsSync(fp)) return null;
        try {
            return JSON.parse(fs.readFileSync(fp, 'utf-8'));
        } catch {
            return null;
        }
    }

    write(key: string, value: any): void {
        const fp = this.filePath(key);
        if (fs.existsSync(fp)) {
            fs.copyFileSync(fp, fp + '.bak');
        }
        fs.writeFileSync(fp, JSON.stringify(value, null, 2), 'utf-8');
    }

    exists(key: string): boolean {
        return fs.existsSync(this.filePath(key));
    }

    delete(key: string): void {
        const fp = this.filePath(key);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    listKeys(prefix?: string): string[] {
        const files = fs.readdirSync(this.baseDir).filter(f => f.endsWith('.json') && !f.endsWith('.bak'));
        const keys = files.map(f => f.replace('.json', ''));
        return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    }
}

// ===== Memory Manager with Encryption =====
export class MemoryManager {
    private operational: IStorageAdapter;
    private llm: IStorageAdapter;
    private archiveTTLMs: number;

    constructor(operationalAdapter: IStorageAdapter, llmAdapter: IStorageAdapter, archiveTTLDays = 180) {
        this.operational = operationalAdapter;
        this.llm = llmAdapter;
        this.archiveTTLMs = archiveTTLDays * 24 * 60 * 60 * 1000;
    }

    // --- Standard (unencrypted) API ---
    saveMemory(key: string, value: any): void {
        const record = { data: value, updatedAt: new Date().toISOString(), encrypted: false };
        this.operational.write(key, record);
    }

    loadMemory(key: string): any {
        const record = this.operational.read(key);
        if (!record) return null;
        // Backward compat: handle both encrypted and unencrypted
        if (record.encrypted && typeof record.data === 'string' && isEncrypted(record.data)) {
            const decrypted = decryptData(record.data);
            return decrypted !== null ? decrypted : record.data;
        }
        return record.data ?? null;
    }

    updateMemory(key: string, delta: any): void {
        const existing = this.loadMemory(key) || {};
        const merged = { ...existing, ...delta };
        this.saveMemory(key, merged);
    }

    getMemory(key: string): any {
        return this.loadMemory(key);
    }

    // --- Encrypted API for sensitive data ---
    saveEncrypted(key: string, value: any): void {
        const cipher = encryptData(value);
        const record = { data: cipher, updatedAt: new Date().toISOString(), encrypted: true };
        this.operational.write(key, record);
    }

    loadEncrypted(key: string): any {
        const record = this.operational.read(key);
        if (!record) return null;
        if (record.encrypted && typeof record.data === 'string') {
            const decrypted = decryptData(record.data);
            return decrypted;
        }
        // Fallback: return raw if not encrypted (backward compat)
        return record.data ?? null;
    }

    // --- Summarization ---
    summarizeMemory(key: string): string {
        const data = this.loadMemory(key);
        if (!data) return '';
        const summary = typeof data === 'object'
            ? JSON.stringify(data).slice(0, 500)
            : String(data).slice(0, 500);
        this.llm.write(`summary_${key}`, { summary, createdAt: new Date().toISOString() });
        return summary;
    }

    getLLMSummary(key: string): string {
        const record = this.llm.read(`summary_${key}`);
        return record?.summary || '';
    }

    // --- Domain-scoped ---
    loadDomainMemory(domain: string): any[] {
        const keys = this.operational.listKeys(domain);
        return keys.map(k => ({ key: k, data: this.loadMemory(k) }));
    }

    // --- Archival ---
    archiveOldMemory(): number {
        const now = Date.now();
        let archived = 0;
        const keys = this.operational.listKeys();
        for (const key of keys) {
            const record = this.operational.read(key);
            if (record?.updatedAt) {
                const age = now - new Date(record.updatedAt).getTime();
                if (age > this.archiveTTLMs) {
                    this.summarizeMemory(key);
                    this.operational.delete(key);
                    archived++;
                }
            }
        }
        return archived;
    }
}
