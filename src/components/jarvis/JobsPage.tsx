import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Bell, Clock, MessageSquare, Search, Trash2, Plus, Play, Pause, Loader2, Check, X } from 'lucide-react';
import { playSound } from '../../utils/soundEffects';

interface ResearchJob {
  id: string;
  topic: string;
  time_of_day: string; // Cron expression for recurring execution
  chat_id: number;
  is_active: boolean;
}

type RoutineType = 'reminder' | 'message' | 'research';

interface RoutineView {
  type: RoutineType;
  content: string;
}

const ROUTINE_PREFIX = '__JARVIS_ROUTINE__:';

const routineOptions: Array<{
  type: RoutineType;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    type: 'reminder',
    label: 'Reminder',
    description: 'AI writes a short natural nudge from your intent.',
    icon: Bell
  },
  {
    type: 'message',
    label: 'Message',
    description: 'AI sends a recurring Telegram message in fresh wording.',
    icon: MessageSquare
  },
  {
    type: 'research',
    label: 'Research',
    description: 'Runs live research first, then sends the report.',
    icon: Search
  }
];

function parseRoutineTopic(topic: string): RoutineView {
  if (topic.startsWith(ROUTINE_PREFIX)) {
    try {
      const payload = JSON.parse(topic.slice(ROUTINE_PREFIX.length));
      if (['reminder', 'message', 'research'].includes(payload.type) && typeof payload.content === 'string') {
        return { type: payload.type, content: payload.content };
      }
    } catch (error) {
      console.error('Failed to parse routine payload', error);
    }
  }

  return { type: 'research', content: topic };
}

function encodeRoutineTopic(type: RoutineType, content: string): string {
  return `${ROUTINE_PREFIX}${JSON.stringify({ version: 1, type, content })}`;
}

function describeSchedule(cronExpr: string): string {
  const daily = cronExpr.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (daily) {
    const minutes = daily[1].padStart(2, '0');
    const hours = daily[2].padStart(2, '0');
    return `Daily at ${hours}:${minutes} NPT`;
  }
  if (cronExpr === '0 */6 * * *') return 'Every 6 hours';
  if (cronExpr === '0 */12 * * *') return 'Every 12 hours';
  if (cronExpr === '* * * * *') return 'Every minute (debug)';
  return cronExpr;
}

function getRoutineCopy(type: RoutineType) {
  if (type === 'research') {
    return {
      title: 'Create Research Routine',
      label: 'Research Topic / Objective',
      placeholder: 'e.g. Send me the latest AI updates every morning...',
      button: 'Deploy Research'
    };
  }

  if (type === 'message') {
    return {
      title: 'Create Recurring Message',
      label: 'Message Intent',
      placeholder: 'e.g. Wish me good morning and help me start focused...',
      button: 'Deploy Message'
    };
  }

  return {
    title: 'Create Recurring Reminder',
    label: 'Reminder Intent',
    placeholder: 'e.g. Remind me to take medicine...',
    button: 'Deploy Reminder'
  };
}

interface JobsPageProps {
  onBack: () => void;
}

export function JobsPage({ onBack }: JobsPageProps) {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [routineType, setRoutineType] = useState<RoutineType>('reminder');
  const [topic, setTopic] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

  const activeCopy = getRoutineCopy(routineType);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleSaveJob = async () => {
    if (!topic.trim()) return;
    setSaving(true);

    let cronExpr = '';
    if (frequency === 'daily') {
      const [hours, minutes] = time.split(':');
      cronExpr = `${minutes} ${hours} * * *`;
    } else if (frequency === 'every_6_hours') {
      cronExpr = `0 */6 * * *`;
    } else if (frequency === 'every_12_hours') {
      cronExpr = `0 */12 * * *`;
    } else if (frequency === 'every_minute') {
      cronExpr = `* * * * *`;
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: encodeRoutineTopic(routineType, topic.trim()), time_of_day: cronExpr })
      });
      if (res.ok) {
        setTopic('');
        setRoutineType('reminder');
        setShowForm(false);
        fetchJobs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    playSound.click();
    try {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    playSound.tick();
    try {
      await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive })
      });
      setJobs(prev => prev.map(j => j.id === id ? { ...j, is_active: !currentActive } : j));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#030712]/90 backdrop-blur-xl relative z-40 overflow-hidden">
      <header className="glass-panel border-b border-cyan-900/50 p-4 md:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => { playSound.click(); onBack(); }}
            className="p-2 rounded-full hover:bg-cyan-900/30 text-cyan-400 transition-colors shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold tracking-[0.12em] text-cyan-400 jarvis-glow font-display uppercase truncate">
              Recurring Routines
            </h1>
            <p className="text-cyan-700 font-mono text-xs tracking-widest mt-1 uppercase">
              Telegram reminders, messages, and research reports
            </p>
          </div>
        </div>

        <button
          onClick={() => { playSound.click(); setShowForm(!showForm); }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-900/40 border border-cyan-500/50 text-cyan-300 rounded font-mono text-xs uppercase tracking-widest hover:bg-cyan-800/60 transition-all active:scale-95 sm:w-auto"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Routine'}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
        {showForm && (
          <div className="glass-panel p-4 md:p-6 rounded-xl border border-cyan-500/30 mb-8 max-w-4xl mx-auto shadow-[0_0_30px_rgba(34,211,238,0.05)]">
            <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase mb-4 font-bold border-b border-cyan-900/50 pb-2">
              {activeCopy.title}
            </h2>

            <div className="space-y-5">
              <div>
                <label className="block text-cyan-600 font-mono text-xs uppercase tracking-widest mb-2">Routine Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {routineOptions.map(option => {
                    const Icon = option.icon;
                    const selected = routineType === option.type;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => { playSound.tick(); setRoutineType(option.type); }}
                        className={`text-left rounded border p-3 transition-all ${selected ? 'border-cyan-400/70 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.08)]' : 'border-cyan-900/60 bg-cyan-950/30 text-cyan-600 hover:border-cyan-700/80 hover:text-cyan-300'}`}
                      >
                        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
                          <Icon className="w-4 h-4" />
                          {option.label}
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-cyan-700 normal-case tracking-normal font-mono">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-cyan-600 font-mono text-xs uppercase tracking-widest mb-1.5">{activeCopy.label}</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={activeCopy.placeholder}
                  className="w-full bg-cyan-950/40 border border-cyan-900/60 rounded px-4 py-3 text-cyan-200 font-mono text-sm focus:outline-none focus:border-cyan-400/60 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-cyan-600 font-mono text-xs uppercase tracking-widest mb-1.5">Execution Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="w-full bg-cyan-950/40 border border-cyan-900/60 rounded px-4 py-3 text-cyan-200 font-mono text-sm focus:outline-none focus:border-cyan-400/60 transition-colors appearance-none"
                  >
                    <option value="daily">Once a day (Specific Time)</option>
                    <option value="every_6_hours">Every 6 Hours</option>
                    <option value="every_12_hours">Every 12 Hours</option>
                    <option value="every_minute">Every Minute (Debug)</option>
                  </select>
                </div>

                {frequency === 'daily' && (
                  <div>
                    <label className="block text-cyan-600 font-mono text-xs uppercase tracking-widest mb-1.5">Time of Day (Kathmandu Time)</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-cyan-950/40 border border-cyan-900/60 rounded px-4 py-3 text-cyan-200 font-mono text-sm focus:outline-none focus:border-cyan-400/60 transition-colors [color-scheme:dark]"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveJob}
                  disabled={saving || !topic.trim()}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-900/40 border border-emerald-500/50 text-emerald-300 rounded font-mono text-xs uppercase tracking-widest hover:bg-emerald-800/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {activeCopy.button}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-cyan-600">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="font-mono uppercase tracking-widest text-xs">Retrieving Routines...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-cyan-800">
              <Clock className="w-12 h-12 opacity-50" />
              <span className="font-mono uppercase tracking-widest text-sm text-center">No recurring routines</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map(job => {
                const routine = parseRoutineTopic(job.topic);
                const option = routineOptions.find(item => item.type === routine.type) || routineOptions[0];
                const Icon = option.icon;

                return (
                  <div key={job.id} className={`glass-panel p-5 rounded-xl border transition-all ${job.is_active ? 'border-cyan-500/30 bg-cyan-950/10' : 'border-cyan-900/30 bg-cyan-950/5 opacity-70'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded border border-cyan-700/50 bg-cyan-950/40 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-cyan-500">
                          <Icon className="w-3 h-3" />
                          {option.label}
                        </div>
                        <h3 className="text-cyan-300 font-mono text-sm leading-relaxed line-clamp-3 break-words">
                          {routine.content}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggle(job.id, job.is_active)}
                          className={`p-1.5 rounded transition-colors ${job.is_active ? 'text-amber-400 hover:bg-amber-900/30' : 'text-emerald-400 hover:bg-emerald-900/30'}`}
                          title={job.is_active ? 'Pause Routine' : 'Resume Routine'}
                        >
                          {job.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="p-1.5 rounded text-cyan-700 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                          title="Delete Routine"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 text-xs font-mono text-cyan-600 uppercase tracking-wider sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate" title={`Cron: ${job.time_of_day}`}>RUNS: {describeSchedule(job.time_of_day)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${job.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                        <span className={job.is_active ? 'text-emerald-400' : 'text-red-400'}>
                          {job.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
