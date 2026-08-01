import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Clock, Search, Trash2, Edit3, Plus, Play, Pause, Loader2, Check, X } from 'lucide-react';
import { playSound } from '../../utils/soundEffects';

interface ResearchJob {
  id: string;
  topic: string;
  time_of_day: string; // Cron expression for recurring execution
  chat_id: number;
  is_active: boolean;
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
interface JobsPageProps {
  onBack: () => void;
}

export function JobsPage({ onBack }: JobsPageProps) {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [topic, setTopic] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

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
    
    // Convert frequency and time to cron expression
    let cronExpr = '';
    if (frequency === 'daily') {
      const [hours, minutes] = time.split(':');
      cronExpr = `${minutes} ${hours} * * *`;
    } else if (frequency === 'every_6_hours') {
      cronExpr = `0 */6 * * *`;
    } else if (frequency === 'every_12_hours') {
      cronExpr = `0 */12 * * *`;
    } else if (frequency === 'every_minute') { // for testing mostly
      cronExpr = `* * * * *`;
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), time_of_day: cronExpr })
      });
      if (res.ok) {
        setTopic('');
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
      
      {/* Header */}
      <header className="glass-panel border-b border-cyan-900/50 p-4 md:p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { playSound.click(); onBack(); }}
            className="p-2 rounded-full hover:bg-cyan-900/30 text-cyan-400 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-[0.15em] text-cyan-400 jarvis-glow font-display uppercase">
              Recurring Research Routines
            </h1>
            <p className="text-cyan-700 font-mono text-xs tracking-widest mt-1">
              Schedule recurring deep-research reports by time or interval
            </p>
          </div>
        </div>
        
        <button 
          onClick={() => { playSound.click(); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-900/40 border border-cyan-500/50 text-cyan-300 rounded font-mono text-xs uppercase tracking-widest hover:bg-cyan-800/60 transition-all active:scale-95"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Routine'}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
        
        {/* New Job Form */}
        {showForm && (
          <div className="glass-panel p-6 rounded-xl border border-cyan-500/30 mb-8 max-w-3xl mx-auto shadow-[0_0_30px_rgba(34,211,238,0.05)]">
            <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase mb-4 font-bold border-b border-cyan-900/50 pb-2">Create Recurring Research Routine</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-cyan-600 font-mono text-xs uppercase tracking-widest mb-1.5">Research Topic / Objective</label>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Keep me updated every day on TU new exam updates or notice..."
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

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSaveJob}
                  disabled={saving || !topic.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-900/40 border border-emerald-500/50 text-emerald-300 rounded font-mono text-xs uppercase tracking-widest hover:bg-emerald-800/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Deploy Routine
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Jobs List */}
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-cyan-600">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="font-mono uppercase tracking-widest text-xs">Retrieving Routines...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-cyan-800">
              <Search className="w-12 h-12 opacity-50" />
              <span className="font-mono uppercase tracking-widest text-sm">No recurring research routines</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map(job => (
                <div key={job.id} className={`glass-panel p-5 rounded-xl border transition-all ${job.is_active ? 'border-cyan-500/30 bg-cyan-950/10' : 'border-cyan-900/30 bg-cyan-950/5 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="text-cyan-300 font-mono text-sm leading-relaxed flex-1 line-clamp-3">
                      {job.topic}
                    </h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                  
                  <div className="flex items-center gap-4 text-xs font-mono text-cyan-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span title={`Cron: ${job.time_of_day}`}>RUNS: {describeSchedule(job.time_of_day)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${job.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                      <span className={job.is_active ? 'text-emerald-400' : 'text-red-400'}>
                        {job.is_active ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
