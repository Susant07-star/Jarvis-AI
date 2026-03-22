import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Terminal, Cpu } from 'lucide-react';

export interface Message {
  id: string;
  role: 'user' | 'jarvis';
  content: string;
  timestamp: Date;
}

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  isProcessing: boolean;
  transcript: string;
}

export function ChatWindow({ messages, onSendMessage, isProcessing, transcript }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [displayTranscript, setDisplayTranscript] = useState(transcript);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (transcript === '' || now - lastUpdateRef.current > 50) {
      setDisplayTranscript(transcript);
      lastUpdateRef.current = now;
    } else {
      const timer = setTimeout(() => {
        setDisplayTranscript(transcript);
        lastUpdateRef.current = Date.now();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [transcript]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, displayTranscript, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto jarvis-border bg-[var(--color-jarvis-panel)] rounded-xl overflow-hidden relative shadow-[0_0_30px_rgba(0,240,255,0.05)]">
      {/* Header HUD */}
      <div className="h-16 border-b border-cyan-500/30 flex items-center px-4 bg-cyan-950/40 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(0,240,255,0.15),transparent)] -translate-x-full animate-[scanline-h_3s_linear_infinite]" />
        
        <div className="flex items-center relative z-10 w-full">
          <div className="flex flex-col mr-4">
            <div className="flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <span className="font-mono text-sm tracking-[0.2em] text-cyan-300 font-bold">J.A.R.V.I.S. // COM_LINK</span>
            </div>
            <div className="text-[9px] font-mono text-cyan-600 tracking-widest mt-0.5">
              SECURE_CHANNEL_ESTABLISHED // ENCRYPTION_LEVEL_9
            </div>
          </div>
          
          <div className="ml-auto flex items-center space-x-4">
            {/* Fake data streams */}
            <div className="hidden sm:flex flex-col items-end">
              <div className="text-[8px] font-mono text-cyan-500/70">UPLINK: ACTIVE</div>
              <div className="text-[8px] font-mono text-cyan-500/70">LATENCY: 12ms</div>
            </div>
            
            {/* Status indicators */}
            <div className="flex space-x-1.5">
              <div className="w-1.5 h-4 bg-cyan-500/40 animate-[pulse_1s_ease-in-out_Infinity]" />
              <div className="w-1.5 h-4 bg-cyan-500/60 animate-[pulse_1.5s_ease-in-out_Infinity_0.2s]" />
              <div className="w-1.5 h-4 bg-cyan-400 animate-[pulse_1.2s_ease-in-out_Infinity_0.4s]" />
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative bg-[radial-gradient(ellipse_at_center,_rgba(0,240,255,0.02)_0%,_transparent_100%)]">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-baseline space-x-2 mb-1.5 px-1">
                <span className="text-[10px] font-mono text-cyan-700/80">
                  {msg.timestamp.toLocaleTimeString([], { hour12: false })}
                </span>
                <span className={`text-xs font-bold tracking-[0.15em] uppercase ${msg.role === 'user' ? 'text-cyan-500' : 'text-cyan-300'}`}>
                  {msg.role === 'user' ? 'USER' : 'J.A.R.V.I.S.'}
                </span>
              </div>
              <div 
                className={`relative max-w-[85%] p-4 font-sans text-sm md:text-base leading-relaxed backdrop-blur-md overflow-hidden
                  ${msg.role === 'user' 
                    ? 'bg-cyan-950/30 border-r-2 border-cyan-500 text-cyan-100' 
                    : 'bg-slate-900/60 border-l-2 border-cyan-400 text-cyan-50'
                  }
                `}
              >
                {/* Techy Corner Accents */}
                <div className={`absolute top-0 w-3 h-3 border-t-2 border-cyan-400/50 ${msg.role === 'user' ? 'left-0 border-l-2' : 'right-0 border-r-2'}`} />
                <div className={`absolute bottom-0 w-3 h-3 border-b-2 border-cyan-400/50 ${msg.role === 'user' ? 'left-0 border-l-2' : 'right-0 border-r-2'}`} />
                
                {/* Background grid pattern for Jarvis messages */}
                {msg.role === 'jarvis' && (
                  <div className="absolute inset-0 opacity-10 pointer-events-none bg-[linear-gradient(rgba(0,240,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.2)_1px,transparent_1px)] bg-[size:10px_10px]" />
                )}
                
                <div className="relative z-10">
                  {msg.content}
                  {/* Blinking cursor for latest J.A.R.V.I.S. message if it's currently streaming */}
                  {msg.role === 'jarvis' && msg.id === messages[messages.length - 1]?.id && isProcessing && (
                    <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Live Transcript Preview */}
        {displayTranscript && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col items-end"
          >
            <div className="relative max-w-[85%] p-3 bg-cyan-950/20 border-r-2 border-cyan-500/30 text-cyan-300/60 font-sans text-sm italic">
              <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-cyan-500/30" />
              <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-cyan-500/30" />
              {displayTranscript}...
            </div>
          </motion.div>
        )}

        {/* Processing Indicator */}
        <AnimatePresence>
          {isProcessing && messages[messages.length - 1]?.role !== 'jarvis' && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-start"
            >
              <div className="relative p-4 bg-slate-900/80 border border-indigo-500/30 text-indigo-400 font-mono text-xs flex flex-col space-y-2 min-w-[220px] shadow-[0_0_15px_rgba(129,140,248,0.1)]">
                {/* Tech corners */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-indigo-500" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-indigo-500" />
                
                <div className="flex items-center space-x-3">
                  <Cpu className="w-4 h-4 animate-spin text-indigo-300" style={{ animationDuration: '3s' }} />
                  <span className="tracking-widest font-bold text-indigo-300">DECRYPTING_RESPONSE</span>
                </div>
                
                {/* Progress bar simulation */}
                <div className="w-full h-1 bg-indigo-950 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-400"
                    animate={{ width: ["0%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                
                <div className="text-[9px] text-indigo-500/70 flex justify-between">
                  <span>ANALYZING_INTENT</span>
                  <span className="animate-pulse">...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-cyan-500/30 bg-slate-900/80 backdrop-blur-md relative z-10">
        <form onSubmit={handleSubmit} className="relative flex items-center group">
          <div className="absolute left-4 text-cyan-500 font-mono text-sm font-bold group-focus-within:text-cyan-300 transition-colors">&gt;</div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter command sequence..."
            disabled={isProcessing}
            className="w-full bg-black/50 border border-cyan-800/60 rounded-lg py-3.5 pl-10 pr-14 text-cyan-50 font-mono text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all placeholder-cyan-800/70"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 p-2 bg-cyan-950/50 rounded text-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/80 disabled:opacity-40 disabled:hover:text-cyan-500 disabled:hover:bg-cyan-950/50 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
