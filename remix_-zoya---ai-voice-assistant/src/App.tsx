import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2 } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import ZoyaAvatar, { ZoyaEmotion } from "./components/ZoyaAvatar";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking" | "error" | "disconnected";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [currentEmotion, setCurrentEmotion] = useState<ZoyaEmotion>("neutral");

  // Sync messages with emotion detection
  const handleNewMessage = useCallback((text: string) => {
    // Robustly catch [EMOTION] even with whitespace or varying case
    const emotionMatch = text.match(/\[(HAPPY|SASSY|ANGRY|THOUGHTFUL|SURPRISED|NEUTRAL)\]/i);
    
    if (emotionMatch) {
      const detectedEmotion = emotionMatch[1].toUpperCase() as ZoyaEmotion;
      // Map back to ZoyaEmotion type (lowercase)
      const emotionMap: Record<string, ZoyaEmotion> = {
        HAPPY: "happy",
        SASSY: "sassy",
        ANGRY: "angry",
        THOUGHTFUL: "thoughtful",
        SURPRISED: "surprised",
        NEUTRAL: "neutral"
      };
      
      setCurrentEmotion(emotionMap[detectedEmotion] || "neutral");
      
      // Remove ALL occurrences of emotion tags from the text
      const cleanText = text.replace(/\[(HAPPY|SASSY|ANGRY|THOUGHTFUL|SURPRISED|NEUTRAL)\]/gi, '').trim();
      return cleanText;
    } else {
      // Small personality shift if no tag is found
      if (text.toLowerCase().includes("please") || text.toLowerCase().includes("ugh")) {
         setCurrentEmotion("sassy");
      }
    }
    return text;
  }, []);

  // Update effect to handle dynamic emotion shifts based on text content if needed
  // But primarily we'll rely on the tags from the LLM now.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [zoyaThoughts, setZoyaThoughts] = useState<{id: string, text: string}[]>([]);
  const [zoyaSources, setZoyaSources] = useState<string[]>([]);
  const [zoyaFiles, setZoyaFiles] = useState<{id: string, title: string, url: string}[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("zoya_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  useEffect(() => {
    let interval: any;
    if (isSessionActive) {
      const startTime = Date.now();
      interval = setInterval(() => {
        setSessionDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      setSessionDuration(0);
    }
    return () => clearInterval(interval);
  }, [isSessionActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      setZoyaThoughts(prev => [...prev, {id: Date.now().toString() + Math.random(), text: commandResult.action}]);
      if (commandResult.url) {
        setZoyaSources(prev => Array.from(new Set([...prev, commandResult.url!])));
      }
      
      responseText = handleNewMessage(commandResult.action);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      setZoyaThoughts(prev => [...prev, {id: Date.now().toString() + Math.random(), text: "Analyzing your request..."}]);
      // 2. General Chit-Chat via Gemini
      responseText = await getZoyaResponse(
        finalTranscript, 
        messagesRef.current,
        (thought) => {
          setZoyaThoughts(prev => [...prev, {id: Date.now().toString() + Math.random(), text: thought}]);
        },
        (newSources) => {
          setZoyaSources(prev => Array.from(new Set([...prev, ...newSources])));
        },
        (newFiles) => {
          setZoyaFiles(prev => [...prev, ...newFiles.map(f => ({ id: Date.now().toString() + Math.random(), title: f.title, url: f.url }))]);
        }
      );
      const cleanResponse = handleNewMessage(responseText);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: cleanResponse }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(cleanResponse);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const startSession = async () => {
    try {
      setIsSessionActive(true);
      resetZoyaSession();
      
      const session = new LiveSessionManager();
      session.isMuted = isMuted;
      liveSessionRef.current = session;
      setErrorMessage(null);
      
      session.onStateChange = (state, err) => {
        setAppState(state);
        if (state === "disconnected") {
          setIsSessionActive(false);
          if (!liveSessionRef.current?.manuallyStopped) {
            setZoyaThoughts(prev => [...prev, {id: Date.now().toString() + Math.random(), text: "Session timed out (15m limit). Reconnecting..."}]);
            setTimeout(() => {
              if (!liveSessionRef.current || liveSessionRef.current.manuallyStopped) return;
              startSession();
            }, 1000);
          }
        }
        if (state === "error" && err) {
          setErrorMessage(err);
        }
      };
      
      session.onMessage = (sender, text) => {
        const cleanText = handleNewMessage(text);
        setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text: cleanText }]);
      };
      
      session.onCommand = (url) => {
        setTimeout(() => {
          window.open(url, "_blank");
        }, 1000);
      };

      session.onThought = (thought) => {
        setZoyaThoughts(prev => [...prev, {id: Date.now().toString() + Math.random(), text: thought}]);
      };

      session.onSources = (newSources) => {
        setZoyaSources(prev => Array.from(new Set([...prev, ...newSources])));
      };

      session.onFiles = (newFiles) => {
        setZoyaFiles(prev => [...prev, ...newFiles.map(f => ({ id: Date.now().toString() + Math.random(), title: f.title, url: f.url }))]);
      };

      await session.start();
    } catch (e) {
      console.error("Failed to start session", e);
      setShowPermissionModal(true);
      setIsSessionActive(false);
      setAppState("idle");
    }
  };

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.manuallyStopped = true;
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      startSession();
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center font-bold text-sm">
            Z
          </div>
          <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Zoya</h1>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="ml-2 text-white/40 hover:text-white/70 text-xs border border-white/10 rounded-full px-2 py-0.5 transition-colors"
          >
            Model Info
          </button>
          
          <AnimatePresence>
            {isSessionActive && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="hidden md:flex items-center gap-2 ml-4 px-3 py-1 bg-white/5 border border-white/10 rounded-full"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${sessionDuration > 1700 ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Session:</span>
                <span className={`text-[10px] font-mono ${sessionDuration > 1700 ? 'text-orange-400' : 'text-white/70'}`}>
                  {formatTime(sessionDuration)} / 30:00
                </span>
                {sessionDuration > 1700 && (
                  <span className="text-[9px] text-orange-500/70 ml-1 hidden lg:inline italic">(Restarting soon)</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetZoyaSession();
                }
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Zoya Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Replying...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <div className="relative flex items-center justify-center">
            <ZoyaAvatar state={appState} emotion={currentEmotion} />
            <div className="absolute inset-0 scale-150 opacity-40">
              <Visualizer state={appState} />
            </div>
          </div>
        </div>
        
        <AnimatePresence>
          {showInfo && (
            <div className="absolute inset-0 flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#111111] backdrop-blur-xl border border-white/10 p-6 rounded-3xl max-w-sm w-full text-sm pointer-events-auto shadow-2xl relative"
              >
                <h3 className="text-violet-400 font-bold mb-4 text-lg">System Information</h3>
                <div className="space-y-4 text-white/80">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-white/40">Model</span>
                    <span className="font-mono text-[10px] bg-white/5 px-2 py-1 rounded">gemini-3.1-flash-live-preview</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-white/40">Usage Mode</span>
                    <span className="text-green-400">Free Tier</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-white/40">Capabilities</span>
                    <span className="text-cyan-400 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Live + Search
                    </span>
                  </div>
                  <div className="text-[10px] text-white/30 leading-relaxed pt-2">
                    Daily limit: 1,500 requests. <br/>
                    Minute limit: 15 RPM / 1M Tokens. <br/>
                    Session limit: 30 minutes.
                  </div>
                </div>
                <button 
                  onClick={() => setShowInfo(false)}
                  className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors font-medium border border-white/5"
                >
                  Got it
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {appState === "error" && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs md:max-w-md px-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-red-950/20 backdrop-blur-md border border-red-500/20 p-4 rounded-2xl text-center pointer-events-auto shadow-xl"
              >
                <p className="text-red-400 font-bold text-sm mb-1 uppercase tracking-wider">Session Terminated</p>
                <p className="text-white/60 text-[10px] mb-4 line-clamp-2">
                  {errorMessage || "Connection lost. This happens due to rate limits, silence, or safety filters."}
                </p>
                <button 
                  onClick={() => toggleListening()}
                  className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-full transition-all shadow-lg shadow-red-500/20"
                >
                  RECONNECT
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Right Column: User Status & Thinking/Sources */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-between gap-4 z-10 py-4 pointer-events-auto hidden md:flex shrink-0">
          {/* Top Section: Thinking & Sources */}
          <div className="flex flex-col gap-3 items-end">
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-3 rounded-2xl w-full max-w-[240px] shadow-2xl flex flex-col gap-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Internal Monologue</span>
                  <div className="flex items-center gap-2">
                    {zoyaThoughts.length > 0 && (
                      <button onClick={() => setZoyaThoughts([])} className="text-white/30 hover:text-red-400 transition-colors" title="Clear Thoughts"><Trash2 size={10} /></button>
                    )}
                    {zoyaThoughts.length > 0 ? (
                      <Loader2 size={10} className="animate-spin text-violet-400" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                  {zoyaThoughts.length === 0 && (
                    <div className="text-[10px] text-white/20 font-mono text-right italic">
                      Awaiting commands...
                    </div>
                  )}
                  {[...zoyaThoughts].reverse().map((thought) => (
                    <div key={thought.id} className="text-[10px] text-violet-300 font-mono text-right border-b border-white/5 pb-1 last:border-0 last:pb-0 break-words">
                      {thought.text}
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-3 rounded-2xl w-full max-w-[240px] shadow-2xl"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Zoya's Sources</span>
                  <div className="flex items-center gap-2">
                    {zoyaSources.length > 0 && (
                      <button onClick={() => setZoyaSources([])} className="text-white/30 hover:text-red-400 transition-colors" title="Clear Sources"><Trash2 size={10} /></button>
                    )}
                    {zoyaSources.length > 0 ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {zoyaSources.length === 0 && (
                    <div className="text-[10px] text-white/20 font-mono text-right italic">
                      No sources yet.
                    </div>
                  )}
                  {zoyaSources.map((url, idx) => (
                    <motion.a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[10px] text-cyan-400/70 hover:text-cyan-300 underline underline-offset-2 truncate block text-right"
                    >
                      {url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                    </motion.a>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-3 rounded-2xl w-full max-w-[240px] shadow-2xl mt-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Zoya's Files</span>
                  <div className="flex items-center gap-2">
                    {zoyaFiles.length > 0 && (
                      <button onClick={() => setZoyaFiles([])} className="text-white/30 hover:text-red-400 transition-colors" title="Clear Files"><Trash2 size={10} /></button>
                    )}
                    {zoyaFiles.length > 0 ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {zoyaFiles.length === 0 && (
                    <div className="text-[10px] text-white/20 font-mono text-right italic">
                      No files available.
                    </div>
                  )}
                  {zoyaFiles.map((file) => (
                    <motion.a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[10px] text-green-400/70 hover:text-green-300 underline underline-offset-2 truncate block text-right"
                      title={file.title}
                    >
                      {file.title}
                    </motion.a>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Section: Listening Indicator */}
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Zoya..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <button
              onClick={toggleListening}
              className={`
                group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
                ${
                  isSessionActive
                    ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                    : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
                }
              `}
            >
              {isSessionActive ? (
                <>
                  <MicOff size={20} />
                  <span>End Session</span>
                </>
              ) : (
                <>
                  <Mic size={20} className="group-hover:animate-bounce" />
                  <span>Start Session</span>
                </>
              )}
            </button>
            
            <AnimatePresence>
              {isSessionActive && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-[9px] text-white/20 uppercase tracking-[0.2em]"
                >
                  30m SESSION LIMIT • {formatTime(sessionDuration)} elapsed
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
