import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Terminal, Cpu, ThumbsUp, ThumbsDown, Check, Mic, MicOff } from 'lucide-react';

export interface Message {
  id: string;
  role: 'user' | 'jarvis';
  content: string;
  timestamp: Date;
  source?: 'chat' | 'voice' | 'system';
  model?: string; // Which model generated this
  tokens?: number; // How many tokens were used
  usedResearch?: boolean; // If web research was triggered
  emotion?: 'neutral' | 'sassy' | 'happy' | 'thoughtful' | 'angry' | 'surprised';
}

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  isProcessing: boolean;
  transcript: string;
  onVoiceToggle?: () => void;
  isListening?: boolean;
  hasRecognition?: boolean;
}

export function ChatWindow({ messages, onSendMessage, isProcessing, transcript, onVoiceToggle, isListening, hasRecognition }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [displayTranscript, setDisplayTranscript] = useState(transcript);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef(0);
  
  const [feedbackState, setFeedbackState] = useState<Record<string, {
    rating: 'up' | 'down' | null;
    comment: string;
    isSubmitting: boolean;
    submitted: boolean;
    isOpen: boolean;
  }>>({});

  const handleFeedback = async (msg: Message, type: 'up' | 'down', idx: number) => {
    if (type === 'up') {
      setFeedbackState(prev => ({ ...prev, [msg.id]: { rating: 'up', comment: '', isSubmitting: true, submitted: false, isOpen: false } }));
      try {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msg.id, query: messages[idx - 1]?.content || '', response: msg.content, isPositive: true })
        });
        setFeedbackState(prev => ({ ...prev, [msg.id]: { rating: 'up', comment: '', isSubmitting: false, submitted: true, isOpen: false } }));
      } catch (e) {
        console.error(e);
        setFeedbackState(prev => ({ ...prev, [msg.id]: { rating: 'up', comment: '', isSubmitting: false, submitted: false, isOpen: false } }));
      }
    } else {
      setFeedbackState(prev => ({ 
        ...prev, 
        [msg.id]: { rating: 'down', comment: prev[msg.id]?.comment || '', isSubmitting: false, submitted: false, isOpen: true } 
      }));
    }
  };

  const submitNegativeFeedback = async (msg: Message, idx: number) => {
    const state = feedbackState[msg.id];
    if (!state || state.rating !== 'down') return;
    
    setFeedbackState(prev => ({ ...prev, [msg.id]: { ...state, isSubmitting: true } }));
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id, query: messages[idx - 1]?.content || '', response: msg.content, isPositive: false, comment: state.comment })
      });
      setFeedbackState(prev => ({ ...prev, [msg.id]: { ...state, isSubmitting: false, submitted: true, isOpen: false } }));
    } catch (e) {
      console.error(e);
      setFeedbackState(prev => ({ ...prev, [msg.id]: { ...state, isSubmitting: false } }));
    }
  };

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

  const getSourceBadge = (source?: string) => {
    if (source === 'voice') return <span className="badge-voice text-[8px] font-mono px-1.5 py-0.5 rounded-full">🎙 VOICE</span>;
    if (source === 'chat') return <span className="badge-chat text-[8px] font-mono px-1.5 py-0.5 rounded-full">⌨ CHAT</span>;
    if (source === 'system') return <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-amber-900/20 text-amber-500 border border-amber-700/30">⚙ SYS</span>;
    return null;
  };

  const getEmotionBadge = (emotion?: string) => {
    if (!emotion) return null;
    const colors: Record<string, string> = {
      happy: 'bg-green-900/30 text-green-400 border-green-700/40',
      sassy: 'bg-pink-900/30 text-pink-400 border-pink-700/40',
      angry: 'bg-red-900/30 text-red-400 border-red-700/40',
      thoughtful: 'bg-indigo-900/30 text-indigo-400 border-indigo-700/40',
      surprised: 'bg-amber-900/30 text-amber-400 border-amber-700/40',
    };
    const style = colors[emotion] || 'bg-cyan-900/20 text-cyan-400 border-cyan-700/30';
    return (
      <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${style}`}>
        {emotion.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full w-full glass-panel rounded-xl overflow-hidden relative">
      {/* Header */}
      <div className="h-12 border-b border-cyan-500/20 flex items-center px-4 bg-cyan-950/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(0,240,255,0.08),transparent)] -translate-x-full animate-[scanline-h_4s_linear_infinite]" />
        
        <div className="flex items-center relative z-10 w-full">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-500" />
            <span className="font-mono text-xs tracking-[0.15em] text-cyan-400 font-bold">COM_LINK</span>
          </div>
          
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[8px] font-mono text-cyan-600">
              <span>UPLINK: ACTIVE</span>
              <span>•</span>
              <span>ENCRYPTED</span>
            </div>
            <div className="flex gap-0.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`w-1 h-3 rounded-sm ${isProcessing ? 'bg-indigo-400' : 'bg-cyan-500/40'} animate-[pulse_${1 + i * 0.3}s_ease-in-out_infinite]`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 relative">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Meta row: time + source badge */}
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[9px] font-mono text-cyan-700/70">
                  {msg.timestamp.toLocaleTimeString([], { hour12: false })}
                </span>
                <span className={`text-[10px] font-bold tracking-[0.1em] uppercase ${msg.role === 'user' ? 'text-cyan-500' : 'text-cyan-300'}`}>
                  {msg.role === 'user' ? 'USER' : `J.A.R.V.I.S.${msg.model ? ` (${msg.model}${msg.usedResearch ? ' ⚡' : ''})` : ''}`}
                </span>
                {msg.tokens ? <span className="text-[8px] font-mono text-cyan-600/60">🪙 {msg.tokens}</span> : null}
                {getSourceBadge(msg.source)}
                {getEmotionBadge(msg.emotion)}
              </div>

              {/* Message bubble */}
              <div className={`relative max-w-[88%] p-3.5 font-sans text-sm leading-relaxed rounded-sm overflow-hidden
                ${msg.role === 'user' ? 'msg-user text-cyan-100' : 'msg-jarvis text-cyan-50'}
              `}>
                {/* Corner accents */}
                <div className={`absolute top-0 w-2.5 h-2.5 border-t border-cyan-400/40 ${msg.role === 'user' ? 'left-0 border-l' : 'right-0 border-r'}`} />
                <div className={`absolute bottom-0 w-2.5 h-2.5 border-b border-cyan-400/40 ${msg.role === 'user' ? 'left-0 border-l' : 'right-0 border-r'}`} />
                
                {/* Grid bg for JARVIS */}
                {msg.role === 'jarvis' && (
                  <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[linear-gradient(rgba(0,240,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.3)_1px,transparent_1px)] bg-[size:8px_8px]" />
                )}
                
                <div className="relative z-10">
                  {msg.content}
                  {/* Typing cursor */}
                  {msg.role === 'jarvis' && msg.id === messages[messages.length - 1]?.id && isProcessing && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle rounded-sm" />
                  )}
                </div>
              </div>

              {/* Feedback */}
              {msg.role === 'jarvis' && msg.content && !(isProcessing && msg.id === messages[messages.length - 1]?.id) && (
                <div className="mt-1.5 flex flex-col items-start gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => handleFeedback(msg, 'up', index)}
                      disabled={feedbackState[msg.id]?.submitted}
                      className={`p-1 rounded transition-all ${feedbackState[msg.id]?.rating === 'up' ? 'text-green-400 bg-green-900/20' : 'text-cyan-700 hover:text-cyan-400 hover:bg-cyan-900/20'} disabled:opacity-40`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => handleFeedback(msg, 'down', index)}
                      disabled={feedbackState[msg.id]?.submitted}
                      className={`p-1 rounded transition-all ${feedbackState[msg.id]?.rating === 'down' ? 'text-red-400 bg-red-900/20' : 'text-cyan-700 hover:text-cyan-400 hover:bg-cyan-900/20'} disabled:opacity-40`}
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </button>
                    {feedbackState[msg.id]?.submitted && (
                      <span className="text-[9px] text-cyan-600 flex items-center gap-0.5 font-mono">
                        <Check className="w-2.5 h-2.5" /> LOGGED
                      </span>
                    )}
                  </div>
                  
                  {feedbackState[msg.id]?.isOpen && !feedbackState[msg.id]?.submitted && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-slate-900/80 border border-red-900/40 p-2.5 rounded-lg w-full max-w-sm"
                    >
                      <div className="text-[9px] text-red-400/70 font-mono mb-1.5 uppercase tracking-wider">Report Anomaly:</div>
                      <textarea
                        value={feedbackState[msg.id]?.comment || ''}
                        onChange={(e) => setFeedbackState(prev => ({ ...prev, [msg.id]: { ...prev[msg.id], comment: e.target.value } as any }))}
                        placeholder="What went wrong?"
                        className="w-full bg-black/40 border border-red-900/30 text-red-200 text-xs rounded p-2 focus:outline-none focus:border-red-500/50 resize-none h-14"
                      />
                      <div className="flex justify-end mt-1.5">
                        <button
                          onClick={() => submitNegativeFeedback(msg, index)}
                          disabled={feedbackState[msg.id]?.isSubmitting || !feedbackState[msg.id]?.comment.trim()}
                          className="bg-red-900/30 hover:bg-red-900/50 text-red-300 text-[9px] font-mono px-2.5 py-0.5 rounded transition-colors disabled:opacity-40"
                        >
                          {feedbackState[msg.id]?.isSubmitting ? 'SUBMITTING...' : 'SUBMIT_LOG'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Live Transcript */}
        {displayTranscript && (
          <motion.div
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col items-end"
          >
            <div className="relative max-w-[85%] p-2.5 bg-cyan-950/15 border-r border-cyan-500/20 text-cyan-400/50 font-sans text-sm italic rounded-sm">
              {displayTranscript}...
            </div>
          </motion.div>
        )}

        {/* Processing indicator */}
        <AnimatePresence>
          {isProcessing && messages[messages.length - 1]?.role !== 'jarvis' && (
            <motion.div
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-start"
            >
              <div className="relative p-3 bg-slate-900/70 border border-indigo-500/20 text-indigo-400 font-mono text-[10px] flex flex-col gap-1.5 min-w-[180px] rounded-sm">
                <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-indigo-500" />
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-indigo-500" />
                
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 animate-spin text-indigo-300" style={{ animationDuration: '3s' }} />
                  <span className="tracking-widest font-bold text-indigo-300">PROCESSING</span>
                </div>
                
                <div className="w-full h-0.5 bg-indigo-950 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-400"
                    animate={{ width: ["0%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} className="h-3" />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-cyan-500/20 bg-slate-900/60 backdrop-blur-md relative z-10">
        <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
          {/* Mobile voice button */}
          {onVoiceToggle && hasRecognition && (
            <button
              type="button"
              onClick={onVoiceToggle}
              className={`lg:hidden p-2.5 rounded-lg transition-all ${
                isListening 
                  ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/50 jarvis-box-glow' 
                  : 'bg-slate-800/50 text-cyan-700 border border-cyan-800/30 hover:text-cyan-400'
              }`}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
          )}
          
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-600 font-mono text-sm font-bold">&gt;</div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter command..."
              disabled={isProcessing}
              className="w-full bg-black/40 border border-cyan-800/40 rounded-lg py-3 pl-8 pr-12 text-cyan-50 font-mono text-sm focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30 transition-all placeholder-cyan-800/60"
            />
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-cyan-950/40 rounded text-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-30 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
