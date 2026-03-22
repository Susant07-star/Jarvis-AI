import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Terminal } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcript, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto jarvis-border bg-[var(--color-jarvis-panel)] rounded-xl overflow-hidden relative">
      {/* Header */}
      <div className="h-12 border-b border-cyan-500/30 flex items-center px-4 bg-cyan-950/30">
        <Terminal className="w-4 h-4 text-cyan-400 mr-2" />
        <span className="font-mono text-sm tracking-widest text-cyan-300">J.A.R.V.I.S. // COM_LINK</span>
        <div className="ml-auto flex space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse delay-75" />
          <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse delay-150" />
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-baseline space-x-2 mb-1">
                <span className="text-[10px] font-mono text-cyan-700">
                  {msg.timestamp.toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="text-xs font-bold tracking-wider uppercase text-cyan-500">
                  {msg.role === 'user' ? 'USER' : 'J.A.R.V.I.S.'}
                </span>
              </div>
              <div 
                className={`max-w-[85%] p-3 rounded-lg font-sans text-sm md:text-base leading-relaxed
                  ${msg.role === 'user' 
                    ? 'bg-cyan-900/40 border border-cyan-500/30 text-cyan-100 rounded-tr-none' 
                    : 'bg-slate-800/60 border border-cyan-800/40 text-cyan-50 rounded-tl-none'
                  }
                `}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Live Transcript Preview */}
        {transcript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-end"
          >
            <div className="max-w-[85%] p-3 rounded-lg rounded-tr-none bg-cyan-950/40 border border-cyan-500/20 text-cyan-300/70 font-sans text-sm italic">
              {transcript}...
            </div>
          </motion.div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start"
          >
            <div className="p-3 rounded-lg rounded-tl-none bg-slate-800/60 border border-cyan-800/40 text-cyan-500 font-mono text-xs flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-2">PROCESSING...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-cyan-500/30 bg-slate-900/50">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute left-3 text-cyan-600 font-mono text-sm">&gt;</div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter command..."
            disabled={isProcessing}
            className="w-full bg-black/40 border border-cyan-800/50 rounded-lg py-3 pl-8 pr-12 text-cyan-100 font-mono text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all placeholder-cyan-800"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 p-1.5 text-cyan-600 hover:text-cyan-300 disabled:opacity-50 disabled:hover:text-cyan-600 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
