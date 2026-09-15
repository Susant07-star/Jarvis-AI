import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, CheckCircle, CircleDashed, ArrowRight, XCircle } from 'lucide-react';

export interface BrowserCommand {
  type: string;
  action?: string;
  url?: string;
  query?: string;
  site?: string;
  target_tab?: string;
  force_new_tab?: boolean;
  seconds?: number;
  direction?: 'up' | 'down';
  amount?: number;
  field?: string;
  value?: string;
  action_type?: string; 
}

export function BrowserAgent() {
  const [commands, setCommands] = useState<BrowserCommand[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'executing' | 'completed' | 'interrupted'>('idle');
  
  const interruptRef = useRef(false);
  const tabSessionsRef = useRef<Record<string, Window | null>>({});
  const lastActiveTabRef = useRef<string | null>(null);

  useEffect(() => {
    const handleCommands = async (e: Event) => {
      const customEvent = e as CustomEvent<BrowserCommand[]>;
      const newCommands = customEvent.detail;
      
      // Signal interruption to any ongoing execution
      interruptRef.current = true;
      await new Promise(r => setTimeout(r, 100)); // Yield to let the previous loop exit
      interruptRef.current = false;
      
      setCommands(newCommands);
      setCurrentIndex(0);
      setStatus('executing');
      
      for (let i = 0; i < newCommands.length; i++) {
        if (interruptRef.current) {
          setStatus('interrupted');
          return;
        }
        
        setCurrentIndex(i);
        const cmd = newCommands[i];
        
        // Execute command
        await executeCommand(cmd);
        
        // Wait a bit between commands for visual effect and pacing
        await new Promise(r => setTimeout(r, 1500));
      }
      
      if (!interruptRef.current) {
        setStatus('completed');
        setTimeout(() => {
          if (!interruptRef.current) {
            setCommands([]);
            setStatus('idle');
          }
        }, 4000);
      }
    };

    window.addEventListener('jarvis_browser_commands', handleCommands);
    return () => window.removeEventListener('jarvis_browser_commands', handleCommands);
  }, []);

  const executeCommand = async (cmd: BrowserCommand) => {
    console.log('[BrowserAgent HUD] Visualizing command for user feedback:', cmd);
    // Actual execution is securely handled by the Python undetected-chromedriver backend.
    // This frontend component only provides the visual terminal HUD experience.
  };

  const formatCommandType = (typeOrAction?: string) => {
    if (!typeOrAction) return 'Unknown Command';
    return typeOrAction.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatCommandDetails = (cmd: BrowserCommand) => {
    const cmdType = cmd.type || cmd.action || '';
    switch (cmdType) {
      case 'open_tab': 
      case 'open_url': return cmd.url;
      case 'search_site': 
      case 'youtube_search': return `Search '${cmd.query}' on ${cmd.site || 'YouTube'}`;
      case 'media_control': return `${cmd.action} ${cmd.seconds ? `(${cmd.seconds}s)` : ''}`;
      case 'scroll': return `Scroll ${cmd.direction} ${cmd.amount}px`;
      case 'fill_form': 
      case 'type': return `Type text`;
      case 'click': return `Click element`;
      default: return '';
    }
  };

  if (commands.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 50 }}
        className="fixed top-24 right-8 w-80 bg-black/80 backdrop-blur-md border border-emerald-500/30 rounded-xl p-4 shadow-[0_0_30px_rgba(16,185,129,0.15)] z-50"
      >
        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-white/90 uppercase tracking-wider">Browser Agent</h3>
        </div>
        <div className="space-y-4">
          {commands.map((cmd, idx) => {
            const isPast = idx < currentIndex || status === 'completed';
            const isCurrent = idx === currentIndex && status === 'executing';
            const isPending = idx > currentIndex;
            
            return (
              <div key={idx} className={`flex items-start gap-3 text-sm transition-colors duration-300 ${isPast ? 'text-white/50' : isCurrent ? 'text-emerald-400' : 'text-white/30'}`}>
                <div className="mt-0.5">
                  {isPast ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500/70" />
                  ) : isCurrent ? (
                    <CircleDashed className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : (
                    <CircleDashed className="w-4 h-4 opacity-50" />
                  )}
                </div>
                <div>
                  <div className="font-medium">{formatCommandType(cmd.type || cmd.action)}</div>
                  <div className="text-xs opacity-70 mt-0.5">{formatCommandDetails(cmd)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {status === 'completed' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-4 text-xs font-mono text-emerald-400/80 text-center bg-emerald-500/10 py-1.5 rounded"
          >
            EXECUTION COMPLETED
          </motion.div>
        )}
        {status === 'interrupted' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-4 text-xs font-mono text-amber-400/80 text-center bg-amber-500/10 py-1.5 rounded"
          >
            EXECUTION INTERRUPTED
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
