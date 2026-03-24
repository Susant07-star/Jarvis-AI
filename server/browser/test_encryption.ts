import { MemoryManager, LocalJsonAdapter } from './memoryManager';
import { TaskTracker } from './taskTracker';
import { encryptData, decryptData } from './encryption';
import path from 'path';
import fs from 'fs';

const TEST_DIR = path.resolve(process.cwd(), 'data', 'test_encryption');

function cleanup() {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
}

async function runTests() {
    cleanup();
    
    const opAdapter = new LocalJsonAdapter(path.join(TEST_DIR, 'operational'));
    const llmAdapter = new LocalJsonAdapter(path.join(TEST_DIR, 'llm'));
    const taskAdapter = new LocalJsonAdapter(path.join(TEST_DIR, 'tasks'));
    const memory = new MemoryManager(opAdapter, llmAdapter);
    const tracker = new TaskTracker(taskAdapter);

    // Test 1: Encrypt/Decrypt round-trip
    console.log('=== Test 1: Encrypt → Decrypt round-trip ===');
    const sensitiveData = { token: 'sk-abc123', password: 'secret123', session: 'cookie-xyz' };
    const cipher = encryptData(sensitiveData);
    const decrypted = decryptData(cipher);
    console.log(`Original: ${JSON.stringify(sensitiveData)}`);
    console.log(`Encrypted: ${cipher.slice(0, 40)}...`);
    console.log(`Decrypted match: ${JSON.stringify(decrypted) === JSON.stringify(sensitiveData) ? '✅ PASS' : '❌ FAIL'}`);

    // Test 2: Encrypted memory save/load
    console.log('\n=== Test 2: Encrypted memory save/load ===');
    memory.saveEncrypted('browser_session', { cookies: ['session=abc'], token: 'bearer-xyz' });
    const loaded = memory.loadEncrypted('browser_session');
    console.log(`Loaded encrypted data: ${JSON.stringify(loaded)}`);
    console.log(`Token recovered: ${loaded?.token === 'bearer-xyz' ? '✅ PASS' : '❌ FAIL'}`);

    // Test 3: Mixed encrypted/non-encrypted
    console.log('\n=== Test 3: Mixed encrypted + standard memory ===');
    memory.saveMemory('task_log', { steps: ['open', 'click', 'type'], site: 'google.com' });
    memory.saveEncrypted('credentials', { username: 'user@mail.com', password: 'p@ss' });
    const taskLog = memory.loadMemory('task_log');
    const creds = memory.loadEncrypted('credentials');
    console.log(`Standard load: ${taskLog?.site === 'google.com' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Encrypted load: ${creds?.username === 'user@mail.com' ? '✅ PASS' : '❌ FAIL'}`);

    // Test 4: Backward compat (loadMemory on encrypted entry auto-decrypts)
    console.log('\n=== Test 4: Backward compat (auto-decrypt) ===');
    const autoDecrypted = memory.loadMemory('credentials');
    console.log(`Auto-decrypt via loadMemory: ${autoDecrypted?.password === 'p@ss' ? '✅ PASS' : '❌ FAIL'}`);

    // Test 5: Task tracker with encrypted snapshot
    console.log('\n=== Test 5: Task tracker + encrypted snapshot ===');
    const task = tracker.createTask('youtube', 'like video', ['search', 'click', 'like']);
    tracker.updateStep(task.task_id, 0, 'completed');
    tracker.updateStep(task.task_id, 1, 'completed');
    tracker.updateStep(task.task_id, 2, 'failed', 'timeout');
    const savedTask = tracker.getTask(task.task_id);
    console.log(`Task status: ${savedTask?.status}`);
    console.log(`Errors logged: ${savedTask?.errors.length}`);
    console.log(`Retry works: ${tracker.markStepRetry(task.task_id, 2) ? '✅ PASS' : '❌ FAIL'}`);

    // Cleanup test data
    cleanup();
    
    console.log('\nEncrypted Storage + Supabase-Ready Memory Layer implemented');
    process.exit(0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
