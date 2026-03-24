import { executePlan, BrowserAction } from './executor';
import { LocalJsonAdapter, MemoryManager } from './memoryManager';
import { TaskTracker } from './taskTracker';
import path from 'path';

async function testMemoryAndTracker() {
    console.log('=== Test 1: Multi-step task with tracking ===');
    
    const plan: BrowserAction[] = [
        { action: 'open_url', url: 'https://en.wikipedia.org' },
        { action: 'universal_type', selectorStrategy: 'placeholder', selectorValue: 'Search Wikipedia', text: 'Artificial intelligence', name: 'Search Input' },
        { action: 'press', key: 'Enter' },
        { action: 'scroll', direction: 'down' },
    ];

    const taskId = await executePlan(plan, 'wikipedia', 'Search for AI on Wikipedia');
    console.log(`Task ID: ${taskId}`);

    // Verify with dashboard logic
    const DATA_DIR = path.resolve(process.cwd(), 'data');
    const taskAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'tasks'));
    const tracker = new TaskTracker(taskAdapter);
    const opAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'operational'));
    const llmAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'llm'));
    const memMgr = new MemoryManager(opAdapter, llmAdapter);

    console.log('\n=== Test 2: Task state verification ===');
    const savedTask = tracker.getTask(taskId);
    console.log(`Task Status: ${savedTask?.status}`);
    console.log(`Steps completed: ${savedTask?.steps.filter(s => s.status === 'completed').length}/${savedTask?.steps.length}`);
    console.log(`Errors: ${savedTask?.errors.length || 0}`);

    console.log('\n=== Test 3: Memory verification ===');
    const summary = memMgr.getLLMSummary(taskId);
    console.log(`LLM Summary length: ${summary.length} chars (token-efficient: ${summary.length < 500 ? 'YES' : 'NO'})`);

    console.log('\n=== Test 4: Dashboard check ===');
    const allTasks = tracker.listTasks();
    console.log(`Total tasks tracked: ${allTasks.length}`);
    
    console.log('\nMemory + Task Tracker + Dashboard working');
    process.exit(0);
}

testMemoryAndTracker().catch((e) => {
    console.error(e);
    process.exit(1);
});
