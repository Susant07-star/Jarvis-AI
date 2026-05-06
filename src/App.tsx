import { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceVisualizer } from './components/jarvis/VoiceVisualizer';
import { ChatWindow, Message } from './components/jarvis/ChatWindow';
import { BrowserAgent } from './components/jarvis/BrowserAgent';
import { useZoyaVoice } from './hooks/useZoyaVoice';
import ZoyaAvatar from './components/jarvis/ZoyaAvatar';
import { sendChatMessage } from './services/api';
import { Activity, Cpu, Database, Wifi, Shield, ChevronRight, X } from 'lucide-react';
import { tts } from './utils/tts';
import { TimezoneClock } from './components/jarvis/TimezoneClock';

type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [browserProbed, setBrowserProbed] = useState(false);
  const [appState, setAppState] = useState<AppState>('idle');
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const abortControllerRef = useRef<AbortController | null>(null);
  const zoya = useZoyaVoice();

  // Sync messages from Zoya into ChatWindow
  useEffect(() => {
    const voiceMessages: Message[] = zoya.messages.map(m => ({
      id: m.id,
      role: m.sender === "zoya" ? "jarvis" : "user",
      content: m.text,
      timestamp: new Date(),
      source: "voice",
      model: zoya.activeModel.replace("-native-audio-dialog", "").replace("-live-001", ""),
      emotion: m.sender === "zoya" ? zoya.emotion : undefined
    }));
    
    setMessages(prev => {
      const msgMap = new Map();
      prev.forEach(msg => msgMap.set(msg.id, msg));
      voiceMessages.forEach(msg => msgMap.set(msg.id, msg));
      return Array.from(msgMap.values()).sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
    });
  }, [zoya.messages, zoya.activeModel]);

  useEffect(() => {
    setAppState(zoya.appState as any);
  }, [zoya.appState]);

  // ── Startup browser state probe ──
  useEffect(() => {
    if (browserProbed) return;
    setBrowserProbed(true);

    const probe = async () => {
      // Base greeting always shows immediately
      const baseMsg: Message = {
        id: 'init',
        role: 'jarvis',
        content: 'System initialized. J.A.R.V.I.S. online and awaiting your command, Sir.',
        timestamp: new Date(),
        source: 'system'
      };

      try {
        const res = await fetch('/api/browser-status');
        const data = await res.json();

        if (data.alive && data.tabs && data.tabs.length > 0) {
          const tabLines = data.tabs
            .map((t: { index: number; title: string; url: string; active: boolean }) =>
              `  ${t.active ? '▶' : '○'} [Tab ${t.index + 1}] ${t.title || 'Untitled'} — ${t.url}`
            )
            .join('\n');

          const contextMsg: Message = {
            id: 'browser-context',
            role: 'jarvis',
            content: `I've detected an active browser session with ${data.tab_count} open tab${data.tab_count > 1 ? 's' : ''}:\n\n${tabLines}\n\nShall I continue with any of these, or do you have a new directive?`,
            timestamp: new Date(),
            source: 'system'
          };
          setMessages([baseMsg, contextMsg]);
        } else {
          setMessages([baseMsg]);
        }
      } catch {
        // Python agent offline — just show base greeting
        setMessages([baseMsg]);
      }
    };

    probe();
  }, [browserProbed]);
  
  // Remove old Jarvis voice hooks
  const isListening = zoya.isSessionActive;
  const isProcessing = zoya.appState === 'processing';
  const isSpeaking = zoya.appState === 'speaking';
  const startListening = zoya.startSession;
  const stopListening = zoya.stopSession;
  const hasRecognition = true;
  const error = zoya.errorMessage;

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    // Stop any active tts
    tts.stop();
    
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      source: 'chat'
    };
    
    setMessages(prev => [...prev, userMsg]);
    setAppState('processing');
    
    try {
      const jarvisMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: jarvisMsgId,
        role: 'jarvis',
        content: '',
        timestamp: new Date(),
        source: 'chat'
      }]);

      let accumulatedText = '';

      const { reply, command, browser_commands } = await sendChatMessage(content, messages, 
        (chunk) => {
          accumulatedText += chunk;
          setMessages(prev => prev.map(msg => 
            msg.id === jarvisMsgId ? { ...msg, content: accumulatedText } : msg
          ));
        },
        (meta) => {
          setMessages(prev => prev.map(msg => 
            msg.id === jarvisMsgId ? { ...msg, model: meta.model } : msg
          ));
        }
      );

      if (!accumulatedText && reply) {
        // Extract emotion if present in the final reply
        let finalReply = reply;
        let emotion: any = undefined;
        const emotionMatch = reply.match(/\[(HAPPY|SASSY|ANGRY|THOUGHTFUL|SURPRISED|NEUTRAL)\]/i);
        if (emotionMatch) {
          emotion = emotionMatch[1].toLowerCase();
          finalReply = reply.replace(emotionMatch[0], "").trim();
        }

        setMessages(prev => prev.map(msg => 
          msg.id === jarvisMsgId ? { ...msg, content: finalReply, emotion } : msg
        ));
        setAppState('speaking');
        tts.speak(finalReply, () => setAppState('idle'));
      } else {
        setAppState('idle');
      }

      if (browser_commands) {
        window.dispatchEvent(new CustomEvent('jarvis_browser_commands', { detail: browser_commands }));
      }
      
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'jarvis',
        content: `Error: ${err.message || 'Unable to connect to main servers.'}`,
        timestamp: new Date(),
        source: 'system'
      }]);
      setAppState('idle');
    }
  }, [messages]);

  const statusColor = appState === 'speaking' ? 'text-emerald-400' : appState === 'processing' ? 'text-indigo-400' : appState === 'listening' ? 'text-cyan-400' : 'text-cyan-700';
  const statusDot = appState === 'idle' ? 'bg-cyan-800' : appState === 'listening' ? 'bg-cyan-400 animate-pulse' : appState === 'processing' ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400 animate-pulse';

  return (
    <div className="h-screen flex flex-col p-3 md:p-6 overflow-hidden">
      <BrowserAgent />
      
      {/* Top HUD Bar */}
      <header className="glass-panel rounded-xl px-4 py-2.5 mb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          <h1 className="text-lg md:text-2xl font-bold tracking-[0.15em] text-cyan-400 jarvis-glow" style={{ fontFamily: 'var(--font-display)' }}>
            J.A.R.V.I.S.
          </h1>
          <span className="hidden md:inline text-[9px] font-mono text-cyan-700 tracking-widest uppercase">
            Just A Rather Very Intelligent System
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Status indicators */}
          <div className="hidden md:flex items-center gap-4 text-cyan-600/70">
            <div className="flex items-center gap-1.5">
              <Activity className={`w-3.5 h-3.5 ${appState === 'listening' ? 'text-cyan-300 animate-pulse' : ''}`} />
              <span className="text-[9px] font-mono">MIC</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className={`w-3.5 h-3.5 ${appState === 'processing' ? 'text-indigo-300 animate-pulse' : ''}`} />
              <span className="text-[9px] font-mono">CORE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span className="text-[9px] font-mono">MEM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[9px] font-mono">ENC</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi className={`w-3.5 h-3.5 ${appState === 'speaking' ? 'text-emerald-300 animate-pulse' : ''}`} />
              <span className="text-[9px] font-mono">LINK</span>
            </div>
          </div>

          {/* Task Panel Toggle */}
          <button 
            onClick={() => setShowTaskPanel(!showTaskPanel)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/30 transition-all"
          >
            TASKS <ChevronRight className={`w-3 h-3 transition-transform ${showTaskPanel ? 'rotate-90' : ''}`} />
          </button>
          
          <div className="w-px h-6 bg-cyan-900/50 mx-1"></div>
          
          {/* Timezone Clock */}
          <TimezoneClock timezone={timezone} onTimezoneChange={setTimezone} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex gap-4 min-h-0 relative">
        
        {/* Left: Voice (Gemini Live) */}
        <div className="hidden lg:flex flex-col items-center justify-center w-80 flex-shrink-0">
          <div className="mb-8 scale-110">
            <ZoyaAvatar state={appState} emotion={zoya.emotion} />
          </div>
          
          <VoiceVisualizer 
            appState={appState} 
            onToggle={isListening ? stopListening : () => startListening(timezone)} 
            disabled={!hasRecognition}
          />
          
          <div className="text-center mt-12 max-w-xs">
            <div className="h-6">
              {appState === 'listening' && <span className="text-cyan-400 font-mono text-sm animate-pulse">Awaiting Input...</span>}
              {appState === 'processing' && <span className="text-indigo-400 font-mono text-sm animate-pulse">Thinking...</span>}
              {appState === 'speaking' && <span className="text-emerald-400 font-mono text-sm">Speaking...</span>}
              {appState === 'idle' && <span className="text-cyan-700/60 font-mono text-sm">Standby</span>}
            </div>

            {error && (
              <div className="text-red-400 text-[10px] font-mono mt-3 border border-red-500/30 bg-red-950/30 p-2 rounded">
                <span className="font-bold">ERR:</span> {error}
              </div>
            )}
            <p className="text-cyan-700/50 text-[10px] font-mono mt-6 uppercase tracking-widest">
              Gemini Live Pipeline Active
            </p>
          </div>
        </div>

        {/* Center: Chat */}
        <div className="flex-1 min-h-0">
          <ChatWindow 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isProcessing={isProcessing}
            transcript={''} 
            onVoiceToggle={isListening ? stopListening : startListening}
            isListening={isListening}
            hasRecognition={hasRecognition}
          />
        </div>

        {/* Right: Task Panel */}
        {showTaskPanel && (
          <div className="hidden md:flex flex-col w-72 glass-panel rounded-xl p-3 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono text-cyan-400 tracking-widest uppercase font-bold">Task Monitor</span>
              <button onClick={() => setShowTaskPanel(false)} className="text-cyan-700 hover:text-cyan-400 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 text-[10px] font-mono">
              <div className="task-item-completed p-2 rounded">
                <div className="text-emerald-400">✓ Browser Control</div>
                <div className="text-cyan-700">Playwright initialized</div>
              </div>
              <div className="task-item-completed p-2 rounded">
                <div className="text-emerald-400">✓ Memory System</div>
                <div className="text-cyan-700">Encrypted + Task Tracker</div>
              </div>
              <div className="task-item-completed p-2 rounded">
                <div className="text-emerald-400">✓ Universal DOM</div>
                <div className="text-cyan-700">Context-aware planning</div>
              </div>
              <div className="task-item-active p-2 rounded">
                <div className="text-cyan-400 animate-pulse">● Voice Pipeline</div>
                <div className="text-cyan-700">{appState === 'listening' ? 'Listening...' : appState === 'processing' ? 'Processing...' : 'Ready'}</div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-cyan-900/30 text-[9px] font-mono text-cyan-700">
              <span>Dashboard: </span>
              <span className="text-cyan-500">npx tsx server/browser/dashboard.ts tasks</span>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Status Bar */}
      <footer className="mt-3 glass-panel rounded-lg px-4 py-1.5 flex justify-between items-center text-cyan-700 font-mono text-[9px] tracking-widest">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className={statusColor}>{appState.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>KEY_POOL: ROTATING</span>
          <span>MEM: ENCRYPTED</span>
          <span>PROTOCOL: OMEGA</span>
        </div>
        <div>STARK INDUSTRIES // AI DIV</div>
      </footer>
    </div>
  );
}
