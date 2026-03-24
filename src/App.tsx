import { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceVisualizer } from './components/jarvis/VoiceVisualizer';
import { ChatWindow, Message } from './components/jarvis/ChatWindow';
import { BrowserAgent } from './components/jarvis/BrowserAgent';
import { useJarvisVoice } from './hooks/useJarvisVoice';
import { sendChatMessage } from './services/api';
import { Activity, Cpu, Database, Wifi, Shield, ChevronRight, X } from 'lucide-react';
import { tts } from './utils/tts';

type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'jarvis',
      content: 'System initialized. J.A.R.V.I.S. online and awaiting your command, Sir.',
      timestamp: new Date(),
      source: 'system'
    }
  ]);
  const [appState, setAppState] = useState<AppState>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentJarvisId, setCurrentJarvisId] = useState<string | null>(null);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  
  const { isListening, isProcessing, isSpeaking, transcript, interimTranscript, llmResponse, startListening, stopListening, stopSpeaking, resetTranscript, hasRecognition, error } = useJarvisVoice();

  useEffect(() => {
    if (isListening) {
      setAppState('listening');
    } else if (isSpeaking) {
      setAppState('speaking');
    } else if (isProcessing) {
      setAppState('processing');
    } else if (appState === 'listening' || appState === 'processing' || appState === 'speaking') {
      setAppState('idle');
    }
  }, [isListening, isProcessing, isSpeaking]);

  useEffect(() => {
    if (interimTranscript) {
      tts.stop();
      stopSpeaking();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [interimTranscript, stopSpeaking]);

  // Voice transcript → message
  useEffect(() => {
    if (transcript && transcript !== '...' && transcript !== 'Processing audio...') {
      const userId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: userId,
        role: 'user',
        content: transcript,
        timestamp: new Date(),
        source: 'voice'
      }]);
      
      const newJarvisId = crypto.randomUUID();
      setCurrentJarvisId(newJarvisId);
      setMessages(prev => [...prev, {
        id: newJarvisId,
        role: 'jarvis',
        content: '',
        timestamp: new Date(),
        source: 'voice'
      }]);
      
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  // LLM response streaming
  useEffect(() => {
    if (currentJarvisId && llmResponse) {
      setMessages(prev => prev.map(msg => 
        msg.id === currentJarvisId ? { ...msg, content: llmResponse } : msg
      ));
    }
  }, [llmResponse, currentJarvisId]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    tts.stop();
    stopSpeaking();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const newController = new AbortController();
    abortControllerRef.current = newController;
    
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
      let spokenText = '';

      const { reply, command, browser_commands } = await sendChatMessage(content, messages, (chunk) => {
        setAppState('speaking');
        accumulatedText += chunk;
        
        setMessages(prev => prev.map(msg => 
          msg.id === jarvisMsgId ? { ...msg, content: accumulatedText } : msg
        ));

        const unprocessedText = accumulatedText.substring(spokenText.length);
        const sentenceMatch = unprocessedText.match(/.*?[.!?]+(?=\s|$)/);
        
        if (sentenceMatch) {
          const sentence = sentenceMatch[0];
          spokenText += sentence;
          tts.speak(sentence);
        }
      }, newController.signal);

      if (!accumulatedText && reply) {
        setMessages(prev => prev.map(msg => 
          msg.id === jarvisMsgId ? { ...msg, content: reply } : msg
        ));
        setAppState('speaking');
        tts.speak(reply, () => {
          setAppState(isListening ? 'listening' : 'idle');
        });
      } else if (!newController.signal.aborted) {
        const remainingText = accumulatedText.substring(spokenText.length).trim();
        if (remainingText) {
          tts.speak(remainingText, () => {
            setAppState(isListening ? 'listening' : 'idle');
          });
        } else {
          tts.speak('', () => {
            setAppState(isListening ? 'listening' : 'idle');
          });
        }
      }

      if (browser_commands && !newController.signal.aborted) {
        window.dispatchEvent(new CustomEvent('jarvis_browser_commands', { detail: browser_commands }));
      }
      
    } catch (err: any) {
      if (err.name === 'AbortError' || newController.signal.aborted) {
        setAppState(isListening ? 'listening' : 'idle');
        return;
      }
      console.error(err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'jarvis',
        content: `Error: ${err.message || 'Unable to connect to main servers.'}`,
        timestamp: new Date(),
        source: 'system'
      }]);
      setAppState(isListening ? 'listening' : 'idle');
    }
  }, [messages, isListening, stopSpeaking]);

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
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex gap-4 min-h-0">
        
        {/* Left: Voice */}
        <div className="hidden lg:flex flex-col items-center justify-center w-80 flex-shrink-0">
          <VoiceVisualizer 
            appState={appState} 
            onToggle={isListening ? stopListening : startListening} 
            disabled={!hasRecognition}
          />
          
          <div className="text-center mt-16 max-w-xs">
            <div className="h-6">
              {appState === 'listening' && !interimTranscript && <span className="text-cyan-400 font-mono text-sm animate-pulse">Awaiting Input...</span>}
              {(appState === 'processing' || (appState === 'listening' && interimTranscript)) && <span className="text-indigo-400 font-mono text-sm animate-pulse">Transcribing...</span>}
              {appState === 'speaking' && <span className="text-emerald-400 font-mono text-sm">Speaking...</span>}
              {appState === 'idle' && <span className="text-cyan-700/60 font-mono text-sm">Standby</span>}
            </div>

            {!hasRecognition && (
              <p className="text-red-400 text-xs font-mono mt-4 border border-red-500/30 bg-red-950/30 p-2 rounded">
                Speech recognition offline.
              </p>
            )}
            {error && (
              <div className="text-red-400 text-xs font-mono mt-3 border border-red-500/30 bg-red-950/30 p-2 rounded">
                <span className="font-bold">ERR:</span> {error}
              </div>
            )}
            <p className="text-cyan-700/50 text-[10px] font-mono mt-6 uppercase tracking-widest">
              Click core to initialize voice
            </p>
          </div>
        </div>

        {/* Center: Chat */}
        <div className="flex-1 min-h-0">
          <ChatWindow 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isProcessing={appState === 'processing'}
            transcript={interimTranscript}
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
