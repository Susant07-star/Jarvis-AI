import { IStorageAdapter } from './memoryManager';

/**
 * Supabase Storage Adapter Stub
 * 
 * Implements IStorageAdapter for future cloud migration.
 * Swap this in place of LocalJsonAdapter when ready:
 *   const adapter = new SupabaseAdapter('your-supabase-url', 'your-anon-key', 'memory_table');
 * 
 * Expected DB Schema:
 *   CREATE TABLE memory_store (
 *     key         TEXT PRIMARY KEY,
 *     value       JSONB NOT NULL,
 *     encrypted   BOOLEAN DEFAULT FALSE,
 *     created_at  TIMESTAMPTZ DEFAULT NOW(),
 *     updated_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 * 
 *   CREATE TABLE tasks (
 *     task_id     UUID PRIMARY KEY,
 *     site        TEXT,
 *     goal        TEXT,
 *     status      TEXT CHECK (status IN ('pending','in_progress','completed','failed')),
 *     steps       JSONB,
 *     last_step   TEXT,
 *     errors      JSONB DEFAULT '[]',
 *     memory_snapshot JSONB,
 *     created_at  TIMESTAMPTZ DEFAULT NOW(),
 *     updated_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 */
export class SupabaseAdapter implements IStorageAdapter {
    private supabaseUrl: string;
    private supabaseKey: string;
    private tableName: string;

    constructor(url: string, key: string, tableName: string) {
        this.supabaseUrl = url;
        this.supabaseKey = key;
        this.tableName = tableName;
        console.log(`[SupabaseAdapter] Initialized (table: ${tableName}) — stub mode`);
    }

    read(key: string): any {
        // TODO: Replace with actual Supabase query
        // const { data } = await supabase.from(this.tableName).select('value').eq('key', key).single();
        // return data?.value ?? null;
        console.warn(`[SupabaseAdapter] read('${key}') — not yet implemented`);
        return null;
    }

    write(key: string, value: any): void {
        // TODO: Replace with actual Supabase upsert
        // await supabase.from(this.tableName).upsert({ key, value, updated_at: new Date() });
        console.warn(`[SupabaseAdapter] write('${key}') — not yet implemented`);
    }

    exists(key: string): boolean {
        // TODO: Replace with actual Supabase count query
        console.warn(`[SupabaseAdapter] exists('${key}') — not yet implemented`);
        return false;
    }

    delete(key: string): void {
        // TODO: Replace with actual Supabase delete
        // await supabase.from(this.tableName).delete().eq('key', key);
        console.warn(`[SupabaseAdapter] delete('${key}') — not yet implemented`);
    }

    listKeys(prefix?: string): string[] {
        // TODO: Replace with actual Supabase query
        // const { data } = await supabase.from(this.tableName).select('key').ilike('key', `${prefix}%`);
        console.warn(`[SupabaseAdapter] listKeys('${prefix}') — not yet implemented`);
        return [];
    }
}
