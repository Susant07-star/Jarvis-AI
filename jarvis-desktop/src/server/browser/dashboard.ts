import { LocalJsonAdapter, MemoryManager } from './memoryManager';
import { TaskTracker } from './taskTracker';
import { getTaskErrors } from './errorLogger';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const operationalAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'operational'));
const llmAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'memory', 'llm'));
const taskAdapter = new LocalJsonAdapter(path.join(DATA_DIR, 'tasks'));

const memory = new MemoryManager(operationalAdapter, llmAdapter);
const tracker = new TaskTracker(taskAdapter);

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
    console.log(`
╔══════════════════════════════════════════╗
║     J.A.R.V.I.S. DASHBOARD CLI          ║
╚══════════════════════════════════════════╝

Commands:
  tasks                    List all tasks
  tasks:active             List active tasks
  tasks:failed             List failed tasks
  task <id>                Inspect specific task
  errors <task_id>         Show error log for task
  memory:list              List all memory keys
  memory:get <key>         Inspect memory entry
  memory:summary <key>     View LLM summary for key
  memory:archive           Archive old memory (TTL-based)
  memory:size              Show total memory footprint
  help                     Show this help
`);
}

function printTasks(filter?: 'pending' | 'in_progress' | 'completed' | 'failed') {
    const tasks = tracker.listTasks(filter);
    if (tasks.length === 0) {
        console.log('No tasks found.');
        return;
    }
    console.log(`\n Found ${tasks.length} task(s):\n`);
    for (const t of tasks) {
        const stepsDone = t.steps.filter(s => s.status === 'completed').length;
        const stepsFailed = t.steps.filter(s => s.status === 'failed').length;
        console.log(`  [${t.status.toUpperCase()}] ${t.task_id}`);
        console.log(`    Goal: ${t.goal}`);
        console.log(`    Site: ${t.site}`);
        console.log(`    Steps: ${stepsDone}/${t.steps.length} done, ${stepsFailed} failed`);
        console.log(`    Last Step: ${t.last_step || 'N/A'}`);
        console.log(`    Created: ${t.timestamp}`);
        console.log(`    Errors: ${t.errors.length}`);
        console.log('');
    }
}

switch (command) {
    case 'tasks':
        printTasks();
        break;
    case 'tasks:active':
        printTasks('in_progress');
        break;
    case 'tasks:failed':
        printTasks('failed');
        break;
    case 'task': {
        const id = args[1];
        if (!id) { console.log('Usage: task <id>'); break; }
        const t = tracker.getTask(id);
        if (!t) { console.log('Task not found.'); break; }
        console.log(JSON.stringify(t, null, 2));
        break;
    }
    case 'errors': {
        const tid = args[1];
        if (!tid) { console.log('Usage: errors <task_id>'); break; }
        console.log(getTaskErrors(tid));
        break;
    }
    case 'memory:list':
        console.log('Memory keys:', operationalAdapter.listKeys().join(', ') || 'None');
        break;
    case 'memory:get': {
        const key = args[1];
        if (!key) { console.log('Usage: memory:get <key>'); break; }
        console.log(JSON.stringify(memory.getMemory(key), null, 2));
        break;
    }
    case 'memory:summary': {
        const key = args[1];
        if (!key) { console.log('Usage: memory:summary <key>'); break; }
        const s = memory.summarizeMemory(key);
        console.log('Summary:', s || 'No data.');
        break;
    }
    case 'memory:archive': {
        const count = memory.archiveOldMemory();
        console.log(`Archived ${count} old memory entries.`);
        break;
    }
    case 'memory:size': {
        const keys = operationalAdapter.listKeys();
        console.log(`Operational keys: ${keys.length}`);
        const llmKeys = llmAdapter.listKeys();
        console.log(`LLM summary keys: ${llmKeys.length}`);
        break;
    }
    default:
        printHelp();
}
