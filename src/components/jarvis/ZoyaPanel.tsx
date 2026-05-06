/**
 * ZoyaPanel — Embedded UI for Zoya within JARVIS.
 * Combines the Avatar, Visualizer, and status info into a glassmorphism panel.
 */

import React from "react";
import { Mic, MicOff, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import ZoyaAvatar from "./ZoyaAvatar";
import ZoyaVisualizer from "./ZoyaVisualizer";
import { useZoyaVoice } from "../../hooks/useZoyaVoice";

interface ZoyaPanelProps {
  zoya: ReturnType<typeof useZoyaVoice>;
}

export default function ZoyaPanel({ zoya }: ZoyaPanelProps) {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isNearingLimit = zoya.sessionSeconds > 1600; // ~26 mins

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none p-4 md:p-12">
      {/* Visualizer Background */}
      <div className="absolute inset-0 scale-125 opacity-30 pointer-events-none">
        <ZoyaVisualizer state={zoya.appState} />
      </div>

      <div className="relative z-10 w-full max-w-5xl h-full flex flex-row items-center justify-between">
        
        {/* Left: Status & Avatar */}
        <div className="w-[40%] flex flex-col items-center justify-center pointer-events-auto">
          <div className="mb-6 flex flex-col items-center">
            {zoya.appState === "listening" && (
              <span className="text-violet-400 animate-pulse text-sm font-mono tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 bg-violet-400 rounded-full" /> LISTENING...
              </span>
            )}
            {zoya.appState === "processing" && (
              <span className="text-sky-400 animate-pulse text-sm font-mono tracking-widest flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> THINKING...
              </span>
            )}
            {zoya.appState === "speaking" && (
              <span className="text-pink-400 animate-pulse text-sm font-mono tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 bg-pink-400 rounded-full" /> SPEAKING...
              </span>
            )}
          </div>

          <ZoyaAvatar state={zoya.appState} emotion={zoya.emotion} size="lg" />

          {/* Controls */}
          <div className="mt-12 flex flex-col items-center gap-3">
            <button
              onClick={zoya.isSessionActive ? zoya.stopSession : zoya.startSession}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold tracking-wider transition-all duration-300 shadow-xl border ${
                zoya.isSessionActive
                  ? "bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30"
                  : "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/30 hover:scale-105"
              }`}
            >
              {zoya.isSessionActive ? (
                <>
                  <MicOff size={18} /> STOP ZOYA
                </>
              ) : (
                <>
                  <Mic size={18} /> ACTIVATE ZOYA
                </>
              )}
            </button>

            {zoya.isSessionActive && (
              <div className="flex flex-col items-center">
                <span className={`text-[10px] font-mono tracking-widest ${isNearingLimit ? "text-orange-400" : "text-white/50"}`}>
                  SESSION: {formatTime(zoya.sessionSeconds)} / 30:00
                </span>
                {zoya.activeModel && (
                  <span className="text-[9px] font-mono text-cyan-400/60 uppercase tracking-tighter mt-1">
                    MODEL: {zoya.activeModel}
                  </span>
                )}
                {isNearingLimit && (
                  <span className="text-[9px] text-orange-500 mt-1 flex items-center gap-1">
                    <RefreshCw size={10} className="animate-spin" /> Restarting soon...
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Thoughts & Logs */}
        <div className="w-[30%] h-full flex flex-col justify-center gap-4 pointer-events-auto">
          {/* Thoughts Panel */}
          <AnimatePresence>
            {zoya.thoughts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl"
              >
                <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3 border-b border-white/10 pb-2">
                  System Monologue
                </div>
                <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {[...zoya.thoughts].reverse().map((t) => (
                    <div key={t.id} className="text-xs font-mono text-cyan-200/80 break-words leading-relaxed">
                      {t.text}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sources Panel */}
          <AnimatePresence>
            {zoya.sources.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl"
              >
                <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3 border-b border-white/10 pb-2">
                  Active Sources
                </div>
                <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                  {zoya.sources.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-blue-400 hover:text-blue-300 underline underline-offset-2 truncate"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {zoya.errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mt-auto"
              >
                <div className="text-[10px] font-mono text-red-300 uppercase tracking-widest font-bold mb-1">Error</div>
                <div className="text-xs text-red-200">{zoya.errorMessage}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
