/**
 * ZoyaVisualizer — Animated concentric ring audio visualizer.
 * Adapted from remix_-zoya---ai-voice-assistant/src/components/Visualizer.tsx
 * Color palette: JARVIS cyan (idle) ↔ Zoya violet (listening) ↔ pink (speaking)
 */

import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking" | "error" | "disconnected";

interface ZoyaVisualizerProps {
  state: VisualizerState;
}

export default function ZoyaVisualizer({ state }: ZoyaVisualizerProps) {
  const baseSpeed =
    state === "listening" ? 3 :
    state === "processing" ? 1.5 :
    state === "speaking" ? 2 : 15;

  const ring = (idx: number, reverse = false) => ({
    rotate: reverse ? [-360, 0] : [0, 360],
    transition: { duration: baseSpeed + idx * 2, repeat: Infinity, ease: "linear" },
  });

  const pulse = () => {
    if (state === "speaking")
      return { scale: [1, 1.05, 0.98, 1.02, 1], opacity: [0.8, 1, 0.8, 1, 0.8], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } };
    if (state === "listening")
      return { scale: [1, 1.02, 1], opacity: [0.7, 1, 0.7], transition: { duration: 1, repeat: Infinity, ease: "easeInOut" } };
    if (state === "processing")
      return { scale: [0.98, 1.02, 0.98], opacity: [0.6, 0.9, 0.6], transition: { duration: 0.8, repeat: Infinity, ease: "linear" } };
    return { scale: [1, 1.01, 1], opacity: [0.4, 0.6, 0.4], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } };
  };

  const theme = {
    listening:    { color: "rgba(139,92,246,1)",   border: "border-violet-400" },
    processing:   { color: "rgba(56,189,248,1)",   border: "border-sky-400" },
    speaking:     { color: "rgba(236,72,153,1)",   border: "border-pink-400" },
    error:        { color: "rgba(239,68,68,1)",    border: "border-red-400" },
    disconnected: { color: "rgba(255,255,255,0.3)", border: "border-white/20" },
    idle:         { color: "rgba(6,182,212,0.8)",  border: "border-cyan-500/50" },
  }[state] ?? { color: "rgba(6,182,212,0.8)", border: "border-cyan-500/50" };

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      {/* Ambient glow */}
      <motion.div
        animate={pulse()}
        className="absolute w-[60%] h-[60%] rounded-full blur-[80px]"
        style={{ backgroundColor: theme.color, opacity: 0.15 }}
      />
      {/* Outer dashed ring */}
      <motion.div animate={ring(4)} className={`absolute w-full h-full rounded-full border border-dashed ${theme.border} opacity-20`} />
      {/* Dotted ring */}
      <motion.div animate={ring(3, true)} className={`absolute w-[85%] h-[85%] rounded-full border-2 border-dotted ${theme.border} opacity-30`} />
      {/* Scanner ring */}
      <motion.div animate={ring(2)} className={`absolute w-[70%] h-[70%] rounded-full border ${theme.border} border-t-transparent border-b-transparent opacity-40`} />
      {/* Inner dashed */}
      <motion.div animate={ring(1, true)} className={`absolute w-[55%] h-[55%] rounded-full border-2 border-dashed ${theme.border} opacity-50`} />
      {/* Core HUD ring */}
      <motion.div animate={ring(0)} className={`absolute w-[40%] h-[40%] rounded-full border-4 border-dotted ${theme.border} opacity-70`} />
      {/* Core pulse */}
      <motion.div animate={pulse()} className={`absolute w-[25%] h-[25%] rounded-full border ${theme.border} opacity-20`} />
    </div>
  );
}
