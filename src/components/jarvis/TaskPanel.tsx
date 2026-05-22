import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Bell, MessageSquare, Phone, Trash2, Edit3, Check, Clock, Loader2, ChevronRight } from 'lucide-react';
import { playSound } from '../../utils/soundEffects';

export interface ScheduledTask {
  id: string;
  type: 'alarm' | 'message' | 'call';
  content: string;
  executionTime: number;
  chatId: number;
  secondsRemaining: number;
}

interface TaskPanelProps {
  appState: string;
  showTaskPanel: boolean;
  onClose: () => void;
}

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(executionTime: number) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.round((executionTime - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => {
      setSecs(Math.max(0, Math.round((executionTime - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [executionTime]);
  return secs;
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return 'FIRING…';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Per-task row ──────────────────────────────────────────────────────────────
function TaskRow({
  task,
  onDelete,
  onModify,
}: {
  task: ScheduledTask;
  onDelete: (id: string) => void;
  onModify: (task: ScheduledTask) => void;
  key?: string | number;
}) {
  const secs = useCountdown(task.executionTime);
  const isUrgent = secs < 60 && secs > 0;
  const isFiring = secs === 0;

  const TypeIcon =
    task.type === 'alarm' ? Bell :
    task.type === 'call'  ? Phone :
                            MessageSquare;

  const typeColor =
    task.type === 'alarm'   ? 'text-amber-400' :
    task.type === 'call'    ? 'text-emerald-400' :
                              'text-cyan-400';

  const typeBg =
    task.type === 'alarm'   ? 'bg-amber-500/10 border-amber-500/20' :
    task.type === 'call'    ? 'bg-emerald-500/10 border-emerald-500/20' :
                              'bg-cyan-500/10 border-cyan-500/20';

  return (
    <div className={`rounded-lg border p-2.5 flex flex-col gap-1.5 transition-all duration-300 ${typeBg} ${isFiring ? 'animate-pulse' : ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <div className={`flex items-center gap-1.5 ${typeColor}`}>
          <TypeIcon className="w-3 h-3 flex-shrink-0" />
          <span className="text-[9px] font-mono uppercase tracking-widest font-bold">{task.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { playSound.tick(); onModify(task); }}
            className="text-cyan-700 hover:text-cyan-300 transition-colors p-0.5 rounded cursor-pointer"
            title="Modify task"
          >
            <Edit3 className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => { playSound.click(); onDelete(task.id); }}
            className="text-cyan-700 hover:text-red-400 transition-colors p-0.5 rounded cursor-pointer"
            title="Cancel task"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-[10px] font-mono text-cyan-300 leading-tight line-clamp-2">{task.content}</p>

      {/* Countdown */}
      <div className={`flex items-center gap-1 ${isUrgent ? 'text-red-400 animate-pulse' : isFiring ? 'text-orange-400' : 'text-cyan-600'}`}>
        <Clock className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="text-[9px] font-mono font-bold">{formatCountdown(secs)}</span>
        {task.chatId > 0 && (
          <span className="ml-auto text-[8px] font-mono text-cyan-800">TG</span>
        )}
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({
  task,
  onConfirm,
  onClose,
}: {
  task: ScheduledTask;
  onConfirm: (id: string, type: string, content: string, delay: number) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<string>(task.type);
  const [content, setContent] = useState(task.content);
  const [delayMins, setDelayMins] = useState('5');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const delay = parseInt(delayMins, 10);
    if (!content.trim() || isNaN(delay) || delay <= 0) return;
    setSaving(true);
    await onConfirm(task.id, type, content.trim(), delay * 60);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel rounded-xl p-4 w-72 flex flex-col gap-3 border border-cyan-500/30"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-cyan-400 tracking-widest uppercase font-bold">Modify Task</span>
          <button onClick={onClose} className="text-cyan-700 hover:text-cyan-300 transition-colors cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>

        {/* Type selector */}
        <div className="flex gap-1.5">
          {(['alarm', 'message', 'call'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-widest transition-all cursor-pointer ${
                type === t
                  ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-300'
                  : 'border border-cyan-900/30 text-cyan-700 hover:text-cyan-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-mono text-cyan-600 uppercase tracking-widest">Content</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={2}
            className="bg-cyan-950/40 border border-cyan-900/40 rounded px-2 py-1.5 text-[10px] font-mono text-cyan-200 resize-none outline-none focus:border-cyan-500/60 transition-colors"
          />
        </div>

        {/* Delay */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-mono text-cyan-600 uppercase tracking-widest">New delay (minutes)</label>
          <input
            type="number"
            min={1}
            value={delayMins}
            onChange={e => setDelayMins(e.target.value)}
            className="bg-cyan-950/40 border border-cyan-900/40 rounded px-2 py-1.5 text-[10px] font-mono text-cyan-200 outline-none focus:border-cyan-500/60 transition-colors"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono uppercase tracking-widest hover:bg-cyan-500/30 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {saving ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

// ── Main TaskPanel ────────────────────────────────────────────────────────────
export function TaskPanel({ appState, showTaskPanel, onClose }: TaskPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      // silently ignore network errors
    }
  }, []);

  // Poll every 3 seconds
  useEffect(() => {
    fetchTasks();
    pollRef.current = setInterval(fetchTasks, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTasks]);

  const handleDelete = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== id));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleModifyConfirm = useCallback(async (id: string, type: string, content: string, delay: number) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, delay_seconds: delay }),
      });
      if (res.ok) {
        await fetchTasks();
      }
    } catch {
      // ignore
    }
  }, [fetchTasks]);

  const tasksByType = {
    alarm:   tasks.filter(t => t.type === 'alarm'),
    call:    tasks.filter(t => t.type === 'call'),
    message: tasks.filter(t => t.type === 'message'),
  };

  return (
    <>
      {/* Edit modal */}
      {editingTask && (
        <EditModal
          task={editingTask}
          onConfirm={handleModifyConfirm}
          onClose={() => setEditingTask(null)}
        />
      )}

      <div className={`
        fixed md:relative top-0 md:top-auto right-0 md:right-auto h-full md:h-auto z-50 md:z-auto
        w-72 max-w-[85vw] flex-shrink-0 flex flex-col glass-panel rounded-l-xl md:rounded-xl p-3 overflow-hidden
        transition-all duration-300 ease-in-out
        ${showTaskPanel ? 'translate-x-0 opacity-100 flex' : 'translate-x-full md:translate-x-0 opacity-0 md:opacity-100 hidden md:flex'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-cyan-400 tracking-widest uppercase font-bold">Task Monitor</span>
            {tasks.length > 0 && (
              <span className="bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[8px] font-mono px-1.5 py-0.5 rounded-full">
                {tasks.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-cyan-700 hover:text-cyan-400 transition-colors cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* System status items (always visible) */}
        <div className="space-y-1.5 mb-3">
          <div className="task-item-completed p-2 rounded">
            <div className="text-emerald-400 text-[10px] font-mono">✓ Browser Control</div>
            <div className="text-cyan-700 text-[9px] font-mono">Playwright initialized</div>
          </div>
          <div className="task-item-completed p-2 rounded">
            <div className="text-emerald-400 text-[10px] font-mono">✓ Memory System</div>
            <div className="text-cyan-700 text-[9px] font-mono">50-turn context active</div>
          </div>
          <div className="task-item-active p-2 rounded">
            <div className="text-cyan-400 animate-pulse text-[10px] font-mono">● Voice Pipeline</div>
            <div className="text-cyan-700 text-[9px] font-mono">
              {appState === 'listening' ? 'Listening…' : appState === 'processing' ? 'Processing…' : appState === 'speaking' ? 'Speaking…' : 'Ready'}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-cyan-900/40 mb-3" />

        {/* Scheduled tasks */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-mono text-cyan-600 uppercase tracking-widest">Scheduled Tasks</span>
          {loading && <Loader2 className="w-2.5 h-2.5 text-cyan-600 animate-spin" />}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 scrollbar-thin">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-cyan-800">
              <Clock className="w-5 h-5" />
              <span className="text-[9px] font-mono uppercase tracking-widest">No pending tasks</span>
            </div>
          ) : (
            <>
              {/* Alarms first */}
              {tasksByType.alarm.map(t => (
                <TaskRow key={t.id} task={t} onDelete={handleDelete} onModify={setEditingTask} />
              ))}
              {/* Calls */}
              {tasksByType.call.map(t => (
                <TaskRow key={t.id} task={t} onDelete={handleDelete} onModify={setEditingTask} />
              ))}
              {/* Messages */}
              {tasksByType.message.map(t => (
                <TaskRow key={t.id} task={t} onDelete={handleDelete} onModify={setEditingTask} />
              ))}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="mt-2 pt-2 border-t border-cyan-900/30 text-[8px] font-mono text-cyan-800">
          <span>Say: </span>
          <span className="text-cyan-600">"Remind me in 10 minutes to…"</span>
        </div>
      </div>
    </>
  );
}
