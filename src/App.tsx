import { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceVisualizer } from './components/jarvis/VoiceVisualizer';
import { ChatWindow, Message } from './components/jarvis/ChatWindow';
import { BrowserAgent } from './components/jarvis/BrowserAgent';
import { useJarvisVoice } from './hooks/useJarvisVoice';
import { sendChatMessage } from './services/api';
import { Activity, Cpu, Database, Wifi } from 'lucide-react';
import { tts } from './utils/tts';

type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'jarvis',
      content: 'System initialized. J.A.R.V.I.S. online and awaiting your command, Sir.',
      timestamp: new Date()
    }
  ]);
  const [appState, setAppState] = useState<AppState>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentJarvisId, setCurrentJarvisId] = useState<string | null>(null);
  
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

  // Interrupt TTS if user starts speaking
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

  // Handle voice transcript from WebSocket
  useEffect(() => {
    if (transcript && transcript !== '...' && transcript !== 'Processing audio...') {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        content: transcript,
        timestamp: new Date()
      }]);
      
      const newJarvisId = (Date.now() + 1).toString();
      setCurrentJarvisId(newJarvisId);
      setMessages(prev => [...prev, {
        id: newJarvisId,
        role: 'jarvis',
        content: '',
        timestamp: new Date()
      }]);
      
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  // Handle LLM response streaming from WebSocket
  useEffect(() => {
    if (currentJarvisId && llmResponse) {
      setMessages(prev => prev.map(msg => 
        msg.id === currentJarvisId ? { ...msg, content: llmResponse } : msg
      ));
    }
  }, [llmResponse, currentJarvisId]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    // Stop TTS if user speaks
    tts.stop();
    stopSpeaking();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const newController = new AbortController();
    abortControllerRef.current = newController;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setAppState('processing');
    
    try {
      const jarvisMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: jarvisMsgId,
        role: 'jarvis',
        content: '',
        timestamp: new Date()
      }]);

      let accumulatedText = '';
      let spokenText = '';

      const { reply, command, browser_commands } = await sendChatMessage(content, messages, (chunk) => {
        setAppState('speaking');
        accumulatedText += chunk;
        
        setMessages(prev => prev.map(msg => 
          msg.id === jarvisMsgId ? { ...msg, content: accumulatedText } : msg
        ));

        // Streaming TTS: check for sentence boundaries
        const unprocessedText = accumulatedText.substring(spokenText.length);
        const sentenceMatch = unprocessedText.match(/.*?[.!?]+(?=\s|$)/);
        
        if (sentenceMatch) {
          const sentence = sentenceMatch[0];
          spokenText += sentence;
          tts.speak(sentence);
        }
      }, newController.signal);

      // If it was a JSON response (like a command), accumulatedText will be empty
      if (!accumulatedText && reply) {
        setMessages(prev => prev.map(msg => 
          msg.id === jarvisMsgId ? { ...msg, content: reply } : msg
        ));
        setAppState('speaking');
        tts.speak(reply, () => {
          setAppState(isListening ? 'listening' : 'idle');
        });
      } else if (!newController.signal.aborted) {
        // Speak any remaining text from stream
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
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        content: `Error: ${err.message || 'Unable to connect to main servers.'}`,
        timestamp: new Date()
      }]);
      setAppState(isListening ? 'listening' : 'idle');
    }
  }, [messages, isListening, stopSpeaking]);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
      <BrowserAgent />
      {/* Top HUD */}
      <header className="flex justify-between items-start mb-8">
        <div className="flex flex-col">
          <h1 className="text-4xl font-bold tracking-[0.2em] text-cyan-400 jarvis-glow font-sans">J.A.R.V.I.S.</h1>
          <div className="text-cyan-600 font-mono text-xs tracking-widest mt-1">JUST A RATHER VERY INTELLIGENT SYSTEM</div>
        </div>
        
        <div className="hidden md:flex space-x-6 text-cyan-500/70">
          <div className="flex flex-col items-center">
            <Activity className={`w-5 h-5 mb-1 ${appState === 'listening' ? 'text-cyan-300 animate-pulse' : ''}`} />
            <span className="text-[10px] font-mono">MIC_SYS</span>
          </div>
          <div className="flex flex-col items-center">
            <Cpu className={`w-5 h-5 mb-1 ${appState === 'processing' ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : ''}`} />
            <span className="text-[10px] font-mono">CORE_OPT</span>
          </div>
          <div className="flex flex-col items-center">
            <Database className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-mono">MEM_SYNC</span>
          </div>
          <div className="flex flex-col items-center">
            <Wifi className={`w-5 h-5 mb-1 ${appState === 'speaking' ? 'text-cyan-300 animate-pulse' : ''}`} />
            <span className="text-[10px] font-mono">UPLINK</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
        
        {/* Left Panel - Voice Control */}
        <div className="flex flex-col items-center justify-center space-y-8 lg:col-span-1">
          <VoiceVisualizer 
            appState={appState} 
            onToggle={isListening ? stopListening : startListening} 
            disabled={!hasRecognition}
          />
          
          <div className="text-center max-w-xs">
            <div className="h-6 mt-4">
              {appState === 'listening' && !interimTranscript && <span className="text-cyan-400 font-mono text-sm animate-pulse">Awaiting Input...</span>}
              {(appState === 'processing' || (appState === 'listening' && interimTranscript)) && <span className="text-cyan-400 font-mono text-sm animate-pulse">Transcribing...</span>}
              {appState === 'speaking' && <span className="text-cyan-400 font-mono text-sm">Speaking...</span>}
              {appState === 'idle' && <span className="text-cyan-600/60 font-mono text-sm">Awaiting Input...</span>}
            </div>

            {!hasRecognition && (
              <p className="text-red-400 text-sm font-mono mt-4 border border-red-500/30 bg-red-950/30 p-2 rounded">
                WARNING: Speech recognition module offline. Browser not supported.
              </p>
            )}
            {error && (
              <div className="text-red-400 text-sm font-mono mt-4 border border-red-500/30 bg-red-950/30 p-3 rounded text-left">
                <span className="font-bold">ERR:</span> {error}
              </div>
            )}
            <p className="text-cyan-600/60 text-xs font-mono mt-8 uppercase tracking-widest">
              Click the core to initialize voice protocol
            </p>
          </div>
        </div>

        {/* Right Panel - Chat Interface */}
        <div className="h-[500px] lg:h-[600px] lg:col-span-2 w-full">
          <ChatWindow 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isProcessing={appState === 'processing'}
            transcript={interimTranscript}
          />
        </div>
      </main>

      {/* Bottom HUD */}
      <footer className="mt-8 border-t border-cyan-900/50 pt-4 flex justify-between items-center text-cyan-700 font-mono text-[10px] tracking-widest">
        <div>PROTOCOL: OMEGA</div>
        <div className="flex space-x-2">
          <div className="w-8 h-1 bg-cyan-800/50" />
          <div className="w-4 h-1 bg-cyan-500/50" />
          <div className="w-12 h-1 bg-cyan-800/50" />
        </div>
        <div>STARK INDUSTRIES // AI DIV</div>
      </footer>
    </div>
  );
}
