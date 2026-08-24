import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { VoiceVisualizer } from './components/jarvis/VoiceVisualizer';
import { ChatWindow, Message } from './components/jarvis/ChatWindow';
import { BrowserAgent } from './components/jarvis/BrowserAgent';
import { useZoyaVoice } from './hooks/useZoyaVoice';
import ZoyaAvatar from './components/jarvis/ZoyaAvatar';
import { sendChatMessage } from './services/api';
import { Activity, Cpu, Database, Wifi, Shield, ChevronRight } from 'lucide-react';
import { tts } from './utils/tts';
import { TimezoneClock } from './components/jarvis/TimezoneClock';
import { NeuralCanvas } from './components/jarvis/NeuralCanvas';
import { playSound } from './utils/soundEffects';
import { TaskPanel } from './components/jarvis/TaskPanel';
import { JobsPage } from './components/jarvis/JobsPage';
import McpSettings from './components/jarvis/McpSettings';

type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [browserProbed, setBrowserProbed] = useState(false);
  const [appState, setAppState] = useState<AppState>('idle');
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [activePage, setActivePage] = useState<'main' | 'jobs' | 'mcp'>('main');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [isVoiceOverlayMinimized, setIsVoiceOverlayMinimized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const zoya = useZoyaVoice();
  const [memoryStats, setMemoryStats] = useState({ messageCount: 0, estimatedTokens: 0, maxMessages: 50 });

  // Sync timezone to server whenever it changes
  const handleTimezoneChange = useCallback((tz: string) => {
    setTimezone(tz);
    fetch("/api/config/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz })
    }).catch(err => console.warn("[App] Failed to sync timezone to server:", err));
  }, []);

  // Refresh memory stats whenever messages change (with a slight delay to allow backend to save)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/memory/stats')
        .then(r => r.json())
        .then(data => {
          if (data && typeof data.estimatedTokens === 'number') {
            setMemoryStats(data);
          } else {
            console.error("Invalid memory stats received:", data);
          }
        })
        .catch(e => console.error("Failed to fetch memory stats", e));
    }, 500);
    
    return () => clearTimeout(timer);
  }, [messages]);

  // Sync messages from Zoya into ChatWindow
  useEffect(() => {
    const voiceMessages: Message[] = zoya.messages.map(m => ({
      id: m.id,
      role: m.sender === "zoya" ? "jarvis" : "user",
      content: m.text,
      timestamp: m.timestamp,
      source: "voice",
      model: zoya.activeModel.replace("-native-audio-dialog", "").replace("-live-001", ""),
      emotion: m.sender === "zoya" ? m.emotion : undefined
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

  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authError, setAuthError] = useState('');
  const [supabaseClient, setSupabaseClient] = useState<any>(null);

  // ── Startup browser state probe ──
  useEffect(() => {
    if (browserProbed) return;
    setBrowserProbed(true);
    playSound.uplink();

    const probe = async () => {
      // Base greeting always shows immediately
      const baseMsg: Message = {
        id: 'init',
        role: 'jarvis',
        content: 'System initialized. J.A.R.V.I.S. online and awaiting your command, Boss.',
        timestamp: new Date(),
        source: 'system'
      };

      try {
        const authRes = await fetch('/api/config/auth');
        const authConfig = await authRes.json();
        
        if (authConfig.supabaseUrl && authConfig.supabaseKey) {
          const supabase = createClient(authConfig.supabaseUrl, authConfig.supabaseKey);
          setSupabaseClient(supabase);
          
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            setShowAuthPrompt(true);
            return;
          }
          
          if (authConfig.ownerEmail) {
            const allowedEmails = authConfig.ownerEmail.split(',').map((e: string) => e.trim().toLowerCase());
            const userEmail = session.user.email?.toLowerCase() || '';
            if (!allowedEmails.includes(userEmail)) {
              await supabase.auth.signOut();
              setAuthError("UNAUTHORIZED IDENTITY DETECTED. ACCESS DENIED.");
              setShowAuthPrompt(true);
              return;
            }
          }
        }
      } catch (err) {
        console.error("Auth config fetch failed", err);
      }

      try {
        const pin = localStorage.getItem('jarvis_pin') || '';
        const res = await fetch('/api/browser-status', {
          headers: { 'X-Jarvis-Pin': pin }
        });
        
        if (res.status === 401) {
          setShowPinPrompt(true);
          return;
        }

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
            msg.id === jarvisMsgId ? { 
              ...msg, 
              model: meta.model !== undefined ? meta.model : msg.model, 
              tokens: meta.tokens !== undefined ? meta.tokens : msg.tokens, 
              usedResearch: meta.usedResearch !== undefined ? meta.usedResearch : msg.usedResearch,
              thoughts: meta.thoughts !== undefined ? meta.thoughts : msg.thoughts
            } : msg
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
    <div className="jarvis-app-shell flex flex-col overflow-hidden relative">
      {/* IDENTITY LOCKDOWN OVERLAY */}
      {showAuthPrompt && (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xl flex items-center justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col items-center gap-5 md:gap-6 max-w-sm w-full border border-indigo-500/30">
            <Shield className="w-12 h-12 md:w-16 md:h-16 text-indigo-400 animate-pulse" />
            <div className="text-center">
              <h2 className="text-lg md:text-xl font-bold text-indigo-400 font-mono mb-2">IDENTITY VERIFICATION</h2>
              <p className="text-cyan-600/70 text-xs font-mono">
                {authError || "Please authenticate to access J.A.R.V.I.S. neural link."}
              </p>
            </div>
            <button
              onClick={async () => {
                if (supabaseClient) {
                  await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin }
                  });
                }
              }}
              className="w-full bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-500/50 text-indigo-300 py-3 rounded-lg font-mono tracking-widest transition-all active:scale-[0.98]"
            >
              LOGIN WITH GOOGLE
            </button>
          </div>
        </div>
      )}

      {/* SECURITY LOCKDOWN OVERLAY */}
      {showPinPrompt && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col items-center gap-5 md:gap-6 max-w-sm w-full border border-red-500/30">
            <Shield className="w-12 h-12 md:w-16 md:h-16 text-red-500 animate-pulse" />
            <div className="text-center">
              <h2 className="text-lg md:text-xl font-bold text-red-400 font-mono mb-2">SYSTEM LOCKED</h2>
              <p className="text-cyan-600/70 text-xs font-mono">Authentication required to access the neural link.</p>
            </div>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                localStorage.setItem('jarvis_pin', pinInput);
                window.location.reload();
              }}
              className="w-full flex flex-col gap-4"
            >
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="ENTER MASTER PIN"
                className="w-full bg-cyan-950/50 border border-cyan-800 text-cyan-400 font-mono p-3 rounded text-center tracking-[0.5em] focus:outline-none focus:border-red-500 transition-colors text-base"
                autoFocus
              />
              <button 
                type="submit"
                className="w-full py-3 bg-red-900/40 hover:bg-red-800/60 border border-red-500/50 text-red-200 font-mono text-sm tracking-widest rounded transition-all active:scale-[0.98]"
              >
                AUTHORIZE
              </button>
            </form>
          </div>
        </div>
      )}

      <NeuralCanvas />
      <BrowserAgent />
      
      {/* Top HUD Bar */}
      <header className="hud-topbar glass-panel rounded-xl px-3 md:px-4 py-2.5 md:py-3 mb-2 md:mb-4 flex justify-between items-center gap-3">
        <div className="hud-brand flex items-center gap-2 md:gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          <h1 className="text-base md:text-2xl font-bold tracking-[0.15em] text-cyan-400 jarvis-glow truncate" style={{ fontFamily: 'var(--font-display)' }}>
            J.A.R.V.I.S.
          </h1>
          <span className="hidden md:inline text-[9px] font-mono text-cyan-700 tracking-widest uppercase">
            Just A Rather Very Intelligent System
          </span>
        </div>
        
        <div className="hud-actions flex items-center gap-2 md:gap-4 min-w-0">
          {/* Status indicators — desktop only */}
          <div className="hidden md:flex items-center gap-4 text-cyan-600/70">
            <div className="flex items-center gap-1.5">
              <Activity className={`w-3.5 h-3.5 ${appState === 'listening' ? 'text-cyan-300 animate-pulse' : ''}`} />
              <span className="text-[9px] font-mono">MIC</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className={`w-3.5 h-3.5 ${appState === 'processing' ? 'text-indigo-300 animate-pulse' : ''}`} />
              <span className="text-[9px] font-mono">CORE</span>
            </div>
            <div className="flex flex-col gap-1 w-32 group cursor-help" title="Standard Context Window: High-performance limit is 32k tokens.">
              <div className="flex justify-between items-center text-[7px] font-mono tracking-tighter">
                <span className="text-cyan-600 flex items-center gap-1">
                  <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" />
                  CTX_WINDOW [GEMINI_3.1]
                </span>
                <span className={memoryStats.estimatedTokens > 25000 ? "text-amber-500" : "text-cyan-400"}>
                  {Math.round((memoryStats.estimatedTokens / 32768) * 100)}%
                </span>
              </div>
              <div className="h-1 w-full bg-cyan-950 rounded-full overflow-hidden border border-cyan-900/20">
                <div 
                  className={`h-full transition-all duration-700 rounded-full ${
                    memoryStats.estimatedTokens > 25000 ? 'bg-amber-500 jarvis-glow-amber' : 'bg-cyan-400 jarvis-glow'
                  }`}
                  style={{ width: `${Math.min(100, (memoryStats.estimatedTokens / 32768) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[7px] font-mono text-cyan-800 uppercase">
                <span>LOAD: {memoryStats.estimatedTokens.toLocaleString()}T</span>
                <span>MAX: 32K</span>
              </div>
            </div>

            <div className="w-px h-6 bg-cyan-900/50 mx-1"></div>

            <div className="flex items-center gap-1.5 group cursor-help" title={`Context Memory: ${memoryStats.messageCount}/${memoryStats.maxMessages} slots used`}>
              <Database className={`w-3.5 h-3.5 ${memoryStats.messageCount > 40 ? 'text-amber-500 animate-pulse' : 'text-cyan-600'}`} />
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

          {/* Live Link Controls (Header) */}
          {zoya.isSessionActive && isVoiceOverlayMinimized ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsVoiceOverlayMinimized(false)}
                className="px-2 md:px-3 py-1 bg-cyan-900/40 text-cyan-400 border border-cyan-500/30 rounded text-[9px] md:text-[10px] font-mono tracking-wider hover:bg-cyan-800/60 transition-colors"
              >
                MAXIMIZE
              </button>
              <button
                onClick={() => {
                  stopListening();
                  setIsVoiceOverlayMinimized(false);
                }}
                className="px-2 md:px-3 py-1 bg-red-900/40 text-red-400 border border-red-500/30 rounded text-[9px] md:text-[10px] font-mono tracking-wider hover:bg-red-800/60 transition-colors"
              >
                END CALL
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (zoya.isSessionActive) {
                  setIsVoiceOverlayMinimized(false);
                } else {
                  startListening(timezone);
                }
              }}
              className="hud-action-btn flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/40 text-cyan-400 border border-cyan-800/50 hover:bg-cyan-900/60 rounded-lg text-[10px] font-mono tracking-widest transition-all shadow-[0_0_10px_rgba(34,211,238,0.1)] active:scale-95"
            >
              <Activity className={`w-3.5 h-3.5 ${appState === 'listening' || appState === 'processing' || appState === 'speaking' ? 'animate-pulse' : ''}`} />
              <span className="hidden md:inline">LIVE LINK</span>
            </button>
          )}

          {/* Task Panel Toggle */}
          <button 
            onClick={() => { playSound.click(); setShowTaskPanel(!showTaskPanel); }}
            onMouseEnter={playSound.tick}
            className="hud-secondary-action flex md:hidden items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/30 transition-all cursor-pointer"
          >
            TASKS <ChevronRight className={`w-3 h-3 transition-transform ${showTaskPanel ? 'rotate-90' : ''}`} />
          </button>
          
          {/* Jobs Page Toggle */}
          <button 
            onClick={() => { playSound.click(); setActivePage('jobs'); }}
            onMouseEnter={playSound.tick}
            className="hud-secondary-action flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/30 transition-all cursor-pointer"
          >
            JOBS <ChevronRight className="w-3 h-3" />
          </button>

          {/* MCP Settings Toggle */}
          <button 
            onClick={() => { playSound.click(); setActivePage('mcp'); }}
            onMouseEnter={playSound.tick}
            className="hud-secondary-action flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-purple-400 hover:text-purple-200 hover:bg-purple-900/30 transition-all cursor-pointer"
          >
            MCP <ChevronRight className="w-3 h-3" />
          </button>
          
          <div className="hidden md:block w-px h-6 bg-cyan-900/50 mx-1"></div>
          
          {/* Timezone Clock */}
          <TimezoneClock timezone={timezone} onTimezoneChange={handleTimezoneChange} />
        </div>
      </header>

      {/* Main Content */}
      {activePage === 'jobs' ? (
        <JobsPage onBack={() => setActivePage('main')} />
      ) : activePage === 'mcp' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setActivePage('main')}
              style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '12px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ← BACK TO MAIN
            </button>
          </div>
          <McpSettings />
        </div>
      ) : (
        <main className="jarvis-main-grid flex-1 flex gap-2 md:gap-4 min-h-0 relative">
          
          {/* Left: Voice (Gemini Live) */}
          <div className="cockpit-rail hidden lg:flex flex-col items-center justify-center w-80 flex-shrink-0 glass-panel rounded-xl relative overflow-hidden">
            <div className="avatar-dock mb-8 scale-110">
              <ZoyaAvatar state={appState} emotion={zoya.emotion} />
            </div>
            
            <VoiceVisualizer 
              appState={appState} 
              onToggle={isListening ? stopListening : () => startListening(timezone)} 
              disabled={!hasRecognition}
            />
            
            <div className="state-readout text-center mt-12 max-w-xs">
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
          <div className="command-deck flex-1 min-h-0">
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

          {/* Right: Live Task Monitor Panel */}
          {showTaskPanel && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowTaskPanel(false)} />
          )}
          <TaskPanel
            showTaskPanel={showTaskPanel}
            onClose={() => setShowTaskPanel(false)}
          />
        </main>
      )}

      {/* Bottom Status Bar */}
      {/* Footer — hidden on mobile for more chat space */}
      <footer className="hud-footer hidden md:flex mt-3 glass-panel rounded-lg px-4 py-1.5 flex-row justify-between items-center gap-4 text-cyan-700 font-mono text-[9px] tracking-widest">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className={statusColor}>{appState.toUpperCase()}</span>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-3">
          <span>KEY_POOL: ROTATING</span>
          <span>MEM: ENCRYPTED</span>
          <span>PROTOCOL: OMEGA</span>
        </div>
        <div className="uppercase">STARK INDUSTRIES // AI DIV</div>
      </footer>

      {/* Holographic Voice Call Overlay (Mobile & Tablet only) */}
      {zoya.isSessionActive && !isVoiceOverlayMinimized && (
        <div className="lg:hidden fixed inset-0 z-50 hologram-overlay flex flex-col items-center justify-between p-4 md:p-6 overflow-hidden" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {/* Hologram scanlines */}
          <div className="holo-scanline" />
          
          {/* Top Info HUD */}
          <div className="w-full flex justify-between items-start relative z-20">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-mono text-[10px] md:text-xs tracking-widest text-cyan-400 font-bold uppercase">VOICE_LINK</span>
              </div>
              <span className="font-mono text-[8px] md:text-[9px] text-cyan-600 tracking-wider">ENC_3.1 // ACTIVE</span>
            </div>
            
            {/* Window Controls */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsVoiceOverlayMinimized(true)}
                className="w-8 h-8 flex items-center justify-center bg-cyan-900/30 border border-cyan-500/30 rounded-full text-cyan-400 hover:bg-cyan-800/50 transition-colors"
              >
                <div className="w-3 h-[2px] bg-cyan-400 rounded-full" />
              </button>
              <button 
                onClick={() => {
                  stopListening();
                  setIsVoiceOverlayMinimized(false);
                }}
                className="w-8 h-8 flex items-center justify-center bg-red-900/30 border border-red-500/30 rounded-full text-red-400 hover:bg-red-800/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Center holographic avatar */}
          <div className="flex-1 flex flex-col items-center justify-center relative z-20 my-4 md:my-6">
            {/* Decorative scanning rings — hidden on mobile for performance */}
            <div className="hidden md:block absolute w-48 h-48 md:w-64 md:h-64 holo-ring pointer-events-none" />
            <div className="hidden md:block absolute w-56 h-56 md:w-72 md:h-72 holo-ring-reverse pointer-events-none" />
            <div className="absolute w-64 h-64 md:w-80 md:h-80 border border-cyan-500/5 rounded-full pointer-events-none animate-pulse" />
            
            <div className="scale-110 md:scale-150 transition-all duration-300 relative z-30">
              <ZoyaAvatar state={appState} emotion={zoya.emotion} />
            </div>
            
            <div className="text-center mt-8 md:mt-12 max-w-xs relative z-30">
              <div className="h-6">
                {appState === 'listening' && <span className="text-cyan-400 font-mono text-xs md:text-sm animate-pulse tracking-widest uppercase">Awaiting Input...</span>}
                {appState === 'processing' && <span className="text-indigo-400 font-mono text-xs md:text-sm animate-pulse tracking-widest uppercase">Analyzing...</span>}
                {appState === 'speaking' && <span className="text-emerald-400 font-mono text-xs md:text-sm tracking-widest uppercase">Transmitting...</span>}
                {appState === 'idle' && <span className="text-cyan-700/60 font-mono text-xs md:text-sm tracking-widest uppercase">Standby</span>}
              </div>
              
              {error && (
                <div className="text-red-400 text-[10px] font-mono mt-3 border border-red-500/30 bg-red-950/30 p-2 rounded">
                  <span className="font-bold">ERR:</span> {error}
                </div>
              )}
            </div>
          </div>
          
          {/* Bottom Visualizer and Controls */}
          <div className="w-full flex flex-col items-center gap-4 md:gap-6 relative z-20 pb-2 md:pb-4">
            <VoiceVisualizer 
              appState={appState} 
              onToggle={zoya.stopSession} 
              disabled={!hasRecognition}
            />
            <p className="text-cyan-600/50 text-[10px] md:text-[9px] font-mono tracking-wider md:tracking-widest uppercase">
              Tap to disconnect
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
