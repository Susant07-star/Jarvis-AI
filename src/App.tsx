import { useState, useEffect, useCallback } from 'react';
import { VoiceVisualizer } from './components/jarvis/VoiceVisualizer';
import { ChatWindow, Message } from './components/jarvis/ChatWindow';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
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
  const [lastTranscript, setLastTranscript] = useState('');
  
  const { isListening, transcript, startListening, stopListening, hasRecognition, error } = useSpeechRecognition();

  useEffect(() => {
    if (isListening) {
      setAppState('listening');
      tts.stop(); // Interrupt Jarvis if user starts speaking
    } else if (appState === 'listening') {
      setAppState('idle');
    }
  }, [isListening]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setAppState('processing');

    // Basic Command Execution Layer (Frontend fallback)
    const lowerContent = content.toLowerCase();
    let commandExecuted = false;
    let commandResponse = '';

    if (lowerContent.startsWith('open youtube')) {
      window.open('https://www.youtube.com', '_blank');
      commandResponse = 'Opening YouTube, Sir.';
      commandExecuted = true;
    } else if (lowerContent === 'open github') {
      window.open('https://github.com', '_blank');
      commandResponse = 'Opening GitHub, Sir.';
      commandExecuted = true;
    }
    
    if (commandExecuted) {
      const jarvisMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        content: commandResponse,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, jarvisMsg]);
      setAppState('speaking');
      tts.speak(commandResponse, () => setAppState('idle'));
      return;
    }
    
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

      const { reply, command } = await sendChatMessage(content, messages, (chunk) => {
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
      });

      // If it was a JSON response (like a command), accumulatedText will be empty
      if (!accumulatedText && reply) {
        setMessages(prev => prev.map(msg => 
          msg.id === jarvisMsgId ? { ...msg, content: reply } : msg
        ));
        setAppState('speaking');
        tts.speak(reply, () => setAppState('idle'));
      } else {
        // Speak any remaining text from stream
        const remainingText = accumulatedText.substring(spokenText.length).trim();
        if (remainingText) {
          tts.speak(remainingText, () => setAppState('idle'));
        } else {
          tts.speak('', () => setAppState('idle'));
        }
      }

      if (command) {
        // Handle backend commands
        if (command.action === 'open_app') {
          if (command.target.toLowerCase() === 'youtube') window.open('https://www.youtube.com', '_blank');
          else if (command.target.toLowerCase() === 'github') window.open('https://github.com', '_blank');
          else window.open(`https://${command.target}.com`, '_blank');
        } else if (command.action === 'play_media') {
          window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(command.target)}`, '_blank');
        } else if (command.action === 'fetch_info') {
          window.open(`https://duckduckgo.com/?q=${encodeURIComponent(command.target)}`, '_blank');
        }
      }
      
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        content: `Error: ${err.message || 'Unable to connect to main servers.'}`,
        timestamp: new Date()
      }]);
      setAppState('idle');
    }
  }, [messages]);

  // Auto-send transcript when listening stops and we have a new transcript
  useEffect(() => {
    if (!isListening && transcript && transcript !== lastTranscript && transcript !== 'Processing audio...') {
      setLastTranscript(transcript);
      handleSendMessage(transcript);
    }
  }, [isListening, transcript, lastTranscript, handleSendMessage]);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
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
            isListening={isListening} 
            onToggle={isListening ? stopListening : startListening} 
            disabled={!hasRecognition}
          />
          
          <div className="text-center max-w-xs">
            <div className="h-6 mt-4">
              {appState === 'listening' && <span className="text-cyan-400 font-mono text-sm animate-pulse">Listening...</span>}
              {appState === 'processing' && <span className="text-cyan-400 font-mono text-sm animate-pulse">Processing...</span>}
              {appState === 'speaking' && <span className="text-cyan-400 font-mono text-sm">Speaking...</span>}
              {appState === 'idle' && <span className="text-cyan-600/60 font-mono text-sm">Awaiting input</span>}
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
            transcript={transcript}
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
