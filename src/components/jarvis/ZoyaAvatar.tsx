/**
 * ZoyaAvatar — Animated AI face for JARVIS's Zoya commander layer.
 * Adapted from remix_-zoya---ai-voice-assistant/src/components/ZoyaAvatar.tsx
 * Supports 6 emotions × 5 states with mouse-tracking and smooth transitions.
 */

import { useMemo, useEffect, useState } from "react";
import { motion } from "motion/react";

export type ZoyaEmotion = "neutral" | "sassy" | "happy" | "thoughtful" | "angry" | "surprised";
export type ZoyaState = "idle" | "listening" | "processing" | "speaking" | "error" | "disconnected";

interface ZoyaAvatarProps {
  state: ZoyaState;
  emotion?: ZoyaEmotion;
  size?: "sm" | "md" | "lg";
}

export default function ZoyaAvatar({ state, emotion = "neutral", size = "md" }: ZoyaAvatarProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile/touch device to reduce performance load
    const mobileCheck = window.matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsMobile(mobileCheck);

    if (mobileCheck) return; // Skip mouse tracking on mobile

    let rafId: number;
    const onMove = (e: MouseEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setMousePos({
          x: (e.clientX / window.innerWidth) * 2 - 1,
          y: (e.clientY / window.innerHeight) * 2 - 1,
        });
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => { window.removeEventListener("mousemove", onMove); if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  const theme = {
    idle:         { color: "#22d3ee", glow: "rgba(34,211,238,0.4)",   bg: "bg-cyan-400" },
    listening:    { color: "#a78bfa", glow: "rgba(167,139,250,0.6)",  bg: "bg-violet-400" },
    processing:   { color: "#fbbf24", glow: "rgba(251,191,36,0.6)",   bg: "bg-amber-400" },
    speaking:     { color: "#f472b6", glow: "rgba(244,114,182,0.6)",  bg: "bg-pink-400" },
    error:        { color: "#ef4444", glow: "rgba(239,68,68,0.6)",    bg: "bg-red-500" },
    disconnected: { color: "#ffffff", glow: "rgba(255,255,255,0.1)",  bg: "bg-white/10" },
  }[state];

  const currentEmotion: ZoyaEmotion = useMemo(() => {
    if (state === "error") return "angry";
    if (state === "processing") return "thoughtful";
    if (state === "listening") return "surprised";
    return emotion;
  }, [state, emotion]);

  const sizeClasses = {
    sm: "w-32 h-40",
    md: "w-48 h-64",
    lg: "w-64 h-80",
  }[size];

  const faceAnimation = useMemo(() => {
    if (currentEmotion === "angry")
      return { x: [0, -2, 2, -2, 2, 0], transition: { duration: 0.2, repeat: Infinity } };
    if (currentEmotion === "surprised")
      return { scale: [1, 1.05, 1], transition: { duration: 0.3 } };
    if (currentEmotion === "thoughtful")
      return { rotateZ: [0, -1, 1, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } };
    
    return {
      rotateX: isMobile ? 0 : (state === "listening" ? 5 : mousePos.y * -5),
      rotateY: isMobile ? 0 : mousePos.x * 10,
      x: isMobile ? 0 : mousePos.x * 10,
      transition: { duration: 0.1, ease: "linear" },
    };
  }, [currentEmotion, state, mousePos, isMobile]);

  return (
    <div className={`relative ${sizeClasses} flex items-center justify-center`} style={{ perspective: "1000px" }}>
      {/* Outer glow aura - Drastically reduced blur for mobile performance */}
      <motion.div
        animate={{
          scale: currentEmotion === "angry" ? [1, 1.2, 1] : [1, 1.1, 1],
          opacity: currentEmotion === "angry" ? [0.2, 0.4, 0.2] : [0.1, 0.15, 0.1],
        }}
        transition={{ duration: currentEmotion === "angry" ? 0.5 : 4, repeat: Infinity }}
        className={`absolute inset-0 rounded-full ${isMobile ? 'blur-md' : 'blur-[60px]'}`}
        style={{ backgroundColor: theme.color }}
      />

      {/* Breathing wrapper */}
      <motion.div
        animate={["neutral", "happy", "thoughtful"].includes(currentEmotion) ? { y: isMobile ? [0, -2, 0] : [0, -4, 0] } : { y: 0 }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10 w-full h-full"
      >
        {/* Face plate */}
        <motion.div
          animate={faceAnimation}
          className="relative w-full h-full rounded-[45%_45%_40%_40%] border border-white/20 bg-gradient-to-b from-slate-900 via-slate-800 to-black shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none opacity-40" />

          {/* Eyebrows */}
          <div className="absolute top-[28%] left-0 right-0 flex justify-between px-[18%] z-10">
            <Eyebrow side="left" emotion={currentEmotion} />
            <Eyebrow side="right" emotion={currentEmotion} />
          </div>

          {/* Eyes */}
          <div className="absolute top-[37%] left-0 right-0 flex justify-between px-[12%] z-10">
            <Eye side="left" state={state} emotion={currentEmotion} theme={theme} mousePos={mousePos} isMobile={isMobile} />
            <Eye side="right" state={state} emotion={currentEmotion} theme={theme} mousePos={mousePos} isMobile={isMobile} />
          </div>

          {/* Cheek glow - Drastically reduced for mobile */}
          <div className="absolute top-[55%] left-0 right-0 flex justify-between px-[12%] pointer-events-none">
            <div className={`w-[25%] h-6 ${isMobile ? 'blur-md opacity-10' : 'blur-3xl opacity-20'} rounded-full ${theme.bg}`} />
            <div className={`w-[25%] h-6 ${isMobile ? 'blur-md opacity-10' : 'blur-3xl opacity-20'} rounded-full ${theme.bg}`} />
          </div>

          {/* Mouth */}
          <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 z-10">
            <Mouth state={state} emotion={currentEmotion} theme={theme} isMobile={isMobile} />
          </div>

          {/* Chin detail */}
          <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 w-[30%] h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full" />
        </motion.div>
      </motion.div>

      {/* Side accents */}
      <div className="absolute -right-1 top-1/4 w-0.5 h-8 bg-white/10 rounded-full blur-[1px]" />
      <div className="absolute -left-1 top-1/4 w-0.5 h-8 bg-white/10 rounded-full blur-[1px]" />
    </div>
  );
}


function Eyebrow({ side, emotion }: { side: "left" | "right"; emotion: ZoyaEmotion }) {
  const y = emotion === "surprised" ? -14 : emotion === "angry" ? 10 : emotion === "thoughtful" ? (side === "left" ? -4 : 2) : emotion === "sassy" && side === "left" ? -8 : 0;
  const rotate = emotion === "angry" ? (side === "left" ? 35 : -35) : emotion === "happy" ? (side === "left" ? -20 : 20) : emotion === "surprised" ? (side === "left" ? -25 : 25) : (side === "left" ? -10 : 10);
  return (
    <motion.div
      animate={{ y, rotate }}
      className="w-[40%] h-[3px] bg-gradient-to-r from-white/60 to-white/20 rounded-full blur-[0.5px]"
    />
  );
}

function Eye({ side, state, emotion, theme, mousePos, isMobile }: { side: "left" | "right"; state: ZoyaState; emotion: ZoyaEmotion; theme: any; mousePos: { x: number; y: number }; isMobile: boolean }) {
  const isBlinking = state === "idle" && emotion !== "surprised";
  const scaleY = emotion === "angry" ? 0.35 : emotion === "surprised" ? 1.6 : emotion === "happy" ? 0.5 : 1;
  const eyeX = emotion === "sassy" ? (side === "left" ? 8 : 4) : (isMobile ? 0 : mousePos.x * 10);
  const eyeY = isMobile ? 0 : mousePos.y * 6;

  return (
    <div className="relative">
      <motion.div
        animate={isBlinking ? { scaleY: [scaleY, scaleY, scaleY, 0, scaleY] } : { scaleY }}
        transition={{ duration: isBlinking ? 4 : 0.3, repeat: isBlinking ? Infinity : 0 }}
        className="w-12 h-8 bg-slate-900 border border-white/20 relative overflow-hidden"
        style={{ borderRadius: side === "left" ? "80% 20% 80% 40%" : "20% 80% 40% 80%" }}
      >
        <motion.div
          animate={{ scale: emotion === "surprised" ? 1.4 : state === "listening" ? 1.3 : 1, x: eyeX, y: eyeY }}
          transition={emotion === "thoughtful" ? { duration: 4, repeat: Infinity } : { duration: 0.1, ease: "linear" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${theme.color}44`, boxShadow: isMobile ? "none" : `0 0 16px ${theme.glow}` }}
        >
          <div className={`w-4 h-4 rounded-full ${theme.bg} opacity-60`} />
          <div className="absolute w-1.5 h-1.5 bg-black rounded-full" />
          <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white/40 rounded-full blur-[1px]" />
        </motion.div>
        {state === "processing" && !isMobile && (
          <motion.div
            animate={{ top: ["-10%", "110%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-px bg-white/50 blur-[1px]"
          />
        )}
      </motion.div>
    </div>
  );
}

function Mouth({ state, emotion, theme, isMobile }: { state: ZoyaState; emotion: ZoyaEmotion; theme: any; isMobile: boolean }) {
  const isSurprised = emotion === "surprised";
  const isSmile = emotion === "happy" || emotion === "sassy";
  return (
    <div className="relative w-24 h-12 flex flex-col items-center justify-center">
      <motion.div
        animate={{
          width: isSurprised ? 12 : state === "speaking" ? 32 : isSmile ? 28 : 24,
          height: isSurprised ? 12 : state === "speaking" ? [2, 4, 2] : 2,
          borderRadius: isSurprised ? "50%" : "50% 50% 0 0",
          y: isSmile ? 2 : 0,
        }}
        className="bg-white/40 blur-[0.5px]"
      />
      <div className="flex items-center gap-[3px] h-5 my-1">
        {[...Array(isMobile ? 4 : 7)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              height: state === "speaking" ? [3, 8 + Math.random() * 14, 3] : state === "listening" ? [3, 6, 3] : 2,
              opacity: state === "speaking" ? 1 : 0.4,
            }}
            transition={{ duration: state === "speaking" ? 0.1 + i * 0.05 : 1, repeat: Infinity }}
            className={`${isMobile ? 'w-[4px]' : 'w-[3px]'} rounded-full ${theme.bg} shadow-sm`}
          />
        ))}
      </div>
      <motion.div
        animate={{ width: isSurprised ? 0 : state === "speaking" ? 28 : isSmile ? 32 : 24, height: isSurprised ? 0 : 2 }}
        className="bg-white/20 blur-[0.5px] rounded-b-full"
      />
    </div>
  );
}
