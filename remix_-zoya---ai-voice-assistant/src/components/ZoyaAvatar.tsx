import React, { useMemo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

export type ZoyaEmotion = "neutral" | "sassy" | "happy" | "thoughtful" | "angry" | "surprised";
type AppState = "idle" | "listening" | "processing" | "speaking" | "error" | "disconnected";

interface ZoyaAvatarProps {
  state: AppState;
  emotion?: ZoyaEmotion;
}

export default function ZoyaAvatar({ state, emotion = "neutral" }: ZoyaAvatarProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let animationFrameId: number;
    const handleMouseMove = (e: MouseEvent) => {
      // Use requestAnimationFrame to throttle state updates for smooth tracking
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        // Normalize from -1 to 1 based on window center
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = (e.clientY / window.innerHeight) * 2 - 1;
        setMousePos({ x, y });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const theme = {
    idle: { color: "#22d3ee", glow: "rgba(34,211,238,0.4)", bg: "bg-cyan-400" },
    listening: { color: "#a78bfa", glow: "rgba(167,139,250,0.6)", bg: "bg-violet-400" },
    processing: { color: "#fbbf24", glow: "rgba(251,191,36,0.6)", bg: "bg-amber-400" },
    speaking: { color: "#f472b6", glow: "rgba(244,114,182,0.6)", bg: "bg-pink-400" },
    error: { color: "#ef4444", glow: "rgba(239,68,68,0.6)", bg: "bg-red-500" },
    disconnected: { color: "#ffffff", glow: "rgba(255,255,255,0.1)", bg: "bg-white/10" },
  }[state === "disconnected" ? "disconnected" : state];

  const currentEmotion = useMemo(() => {
    if (state === "error") return "angry";
    if (state === "processing") return "thoughtful";
    if (state === "listening") return "surprised";
    return emotion;
  }, [state, emotion]);

  // Specific animation variations
  const faceAnimation = useMemo(() => {
    if (currentEmotion === "angry") {
      return {
        x: [0, -2, 2, -2, 2, 0],
        transition: { duration: 0.2, repeat: Infinity }
      };
    }
    if (currentEmotion === "surprised") {
      return {
        scale: [1, 1.05, 1],
        transition: { duration: 0.3 }
      };
    }
    if (currentEmotion === "thoughtful") {
      return {
        rotateZ: [0, -1, 1, 0],
        transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
      };
    }
    return { 
      rotateX: state === "listening" ? 5 : (mousePos.y * -5),
      rotateY: (mousePos.x * 10),
      x: (mousePos.x * 10),
      transition: { duration: 0.1, ease: "linear" }
    };
  }, [currentEmotion, state, mousePos]);

  return (
    <div className="relative w-80 h-96 flex items-center justify-center perspective-1000">
      {/* Outer Glow Aura */}
      <motion.div
        animate={{ 
          scale: currentEmotion === "angry" ? [1, 1.2, 1] : [1, 1.1, 1],
          opacity: currentEmotion === "angry" ? [0.2, 0.4, 0.2] : [0.1, 0.2, 0.1]
        }}
        transition={{ duration: currentEmotion === "angry" ? 0.5 : 4, repeat: Infinity }}
        className="absolute inset-0 rounded-full blur-[100px]"
        style={{ backgroundColor: theme.color }}
      />

      {/* Breathing Wrapper */}
      <motion.div
        animate={currentEmotion === "neutral" || currentEmotion === "happy" || currentEmotion === "thoughtful" ? {
          y: [0, -4, 0]
        } : { y: 0 }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10"
      >
        {/* Main Face Plate (Humanoid Contour) */}
        <motion.div
          animate={faceAnimation}
          className="relative w-64 h-80 rounded-[45%_45%_40%_40%] border border-white/20 bg-gradient-to-b from-slate-900 via-slate-800 to-black shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden"
        >
          {/* Synthetic Skin Texture / Glass Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none opacity-40" />
          
          {/* Forehead Details */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-white/10" />
          <div className="absolute top-10 left-1/2 -translate-x-1/2 w-20 h-[1px] bg-white/5" />
          
          {/* Eyebrows */}
          <div className="absolute top-24 left-0 right-0 flex justify-between px-16 z-10">
            <Eyebrow side="left" emotion={currentEmotion} theme={theme} />
            <Eyebrow side="right" emotion={currentEmotion} theme={theme} />
          </div>

          {/* Eyes Section */}
          <div className="absolute top-32 left-0 right-0 flex justify-between px-12 z-10">
            <Eye side="left" state={state} emotion={currentEmotion} theme={theme} mousePos={mousePos} />
            <Eye side="right" state={state} emotion={currentEmotion} theme={theme} mousePos={mousePos} />
          </div>

          {/* Cheeks Glow (Emotional indicators) */}
          <div className="absolute top-[55%] left-0 right-0 flex justify-between px-12 pointer-events-none">
            <div className={`w-16 h-8 blur-3xl opacity-20 rounded-full ${theme.bg}`} />
            <div className={`w-16 h-8 blur-3xl opacity-20 rounded-full ${theme.bg}`} />
          </div>

          {/* Nose Structure */}
          <div className="absolute top-[48%] left-1/2 -translate-x-1/2 w-8 h-20 flex flex-col items-center">
            <div className="w-[2px] h-[70%] bg-gradient-to-b from-white/15 via-white/5 to-transparent rounded-full" />
            <div className="w-5 h-3 border-x border-b border-white/20 rounded-b-md shadow-inner" />
          </div>

          {/* Cheek Contour Lines */}
          <div className="absolute top-[60%] left-8 w-14 h-px bg-white/5 origin-right rotate-[15deg]" />
          <div className="absolute top-[60%] right-8 w-14 h-px bg-white/5 origin-left -rotate-[15deg]" />

          {/* Mouth Section */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <Mouth state={state} emotion={currentEmotion} theme={theme} />
          </div>

          {/* Jaw/Chin Detail */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full" />
        </motion.div>
      </motion.div>

      {/* Floating Mechanical Accents */}
      <div className="absolute -right-4 top-1/4 w-1 h-12 bg-white/10 rounded-full blur-[1px]" />
      <div className="absolute -left-4 top-1/4 w-1 h-12 bg-white/10 rounded-full blur-[1px]" />
    </div>
  );
}

function Eyebrow({ side, emotion, theme }: { side: "left" | "right"; emotion: ZoyaEmotion; theme: any }) {
  const getEyebrowY = () => {
    if (emotion === "surprised") return -14;
    if (emotion === "angry") return 10;
    if (emotion === "thoughtful") return side === "left" ? -4 : 2;
    if (emotion === "sassy" && side === "left") return -8;
    return 0;
  };

  const getEyebrowRotate = () => {
    const base = side === "left" ? -10 : 10;
    if (emotion === "angry") return side === "left" ? 35 : -35;
    if (emotion === "happy") return side === "left" ? -20 : 20;
    if (emotion === "thoughtful") return side === "left" ? -5 : 15;
    if (emotion === "surprised") return side === "left" ? -25 : 25;
    return base;
  };

  return (
    <motion.div
      animate={{ y: getEyebrowY(), rotate: getEyebrowRotate() }}
      className={`w-14 h-[4px] bg-gradient-to-r from-white/60 to-white/20 rounded-full blur-[0.5px] shadow-sm`}
    />
  );
}

function Eye({ side, state, emotion, theme, mousePos }: { side: "left" | "right"; state: AppState; emotion: ZoyaEmotion; theme: any; mousePos: { x: number, y: number } }) {
  const isBlinking = state === "idle" && emotion !== "surprised";
  
  const getEyeScaleY = () => {
    if (emotion === "angry") return 0.35;
    if (emotion === "surprised") return 1.6;
    if (emotion === "happy") return 0.5;
    if (emotion === "thoughtful") return 0.85;
    return 1;
  };

  const eyeXOffset = emotion === "sassy" ? (side === "left" ? 8 : 4) : 
                     emotion === "thoughtful" ? [0, 4, -4, 0] : 
                     (mousePos.x * 12); // Reduced from arbitrary tracking amount to constrain within eye

  const eyeYOffset = emotion === "thoughtful" ? [0, -2, 2, 0] : 
                     (mousePos.y * 6);

  return (
    <div className="relative">
      {/* Eyelid / Upper socket */}
      <motion.div 
        animate={{ scaleY: getEyeScaleY() }}
        className="absolute -top-1 left-0 right-0 h-px bg-white/30 blur-[0.5px] scale-x-125" 
      />

      {/* Main Eye */}
      <motion.div
        animate={isBlinking ? {
          scaleY: [getEyeScaleY(), getEyeScaleY(), getEyeScaleY(), 0, getEyeScaleY()],
        } : {
          scaleY: getEyeScaleY()
        }}
        transition={{ duration: isBlinking ? 4 : 0.3, repeat: isBlinking ? Infinity : 0 }}
        className="w-16 h-10 bg-slate-900 border border-white/20 relative overflow-hidden"
        style={{ borderRadius: side === "left" ? "80% 20% 80% 40%" : "20% 80% 40% 80%" }}
      >
        {/* Iris & Pupil */}
        <motion.div
          animate={{
            scale: emotion === "surprised" ? 1.4 : (state === "listening" ? 1.3 : 1),
            x: eyeXOffset,
            y: eyeYOffset
          }}
          transition={emotion === "thoughtful" ? { duration: 4, repeat: Infinity } : { duration: 0.1, ease: "linear" }}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-700`}
          style={{ backgroundColor: `${theme.color}44`, boxShadow: `0 0 20px ${theme.glow}` }}
        >
          {/* Inner Glow */}
          <div className={`w-5 h-5 rounded-full ${theme.bg} opacity-60 shadow-inner`} />
          {/* Pupil */}
          <div className="w-2 h-2 bg-black rounded-full" />
          {/* Shine */}
          <div className="absolute top-1.5 left-1.5 w-2 h-2 bg-white/40 rounded-full blur-[1px]" />
        </motion.div>

        {/* Scanning grid logic for processing */}
        {state === "processing" && (
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

function Mouth({ state, emotion, theme }: { state: AppState; emotion: ZoyaEmotion; theme: any }) {
  const isSmile = emotion === "happy" || emotion === "sassy";
  const isAngry = emotion === "angry";
  const isSurprised = emotion === "surprised";

  return (
    <div className="relative w-32 h-16 flex flex-col items-center justify-center">
      {/* Upper Lip Line */}
      <motion.div
        animate={{
          width: isSurprised ? 15 : (state === "speaking" ? 40 : (isSmile ? 35 : 30)),
          height: isSurprised ? 15 : (state === "speaking" ? [2, 4, 2] : 2),
          borderRadius: isSurprised ? "50%" : "50% 50% 0 0",
          y: isSmile ? 2 : (isAngry ? -2 : 0)
        }}
        className={`bg-white/40 blur-[0.5px]`}
      />

      {/* Voice Module */}
      <div className="flex items-center gap-[4px] h-6 my-1">
        {[...Array(9)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              height: state === "speaking" 
                ? [4, 10 + Math.random() * 20, 4] 
                : state === "listening" 
                ? [4, 8, 4] 
                : 2,
              opacity: state === "speaking" ? 1 : 0.4
            }}
            transition={{
              duration: state === "speaking" ? 0.1 + (i * 0.05) : 1,
              repeat: Infinity,
            }}
            className={`w-[4px] rounded-full ${theme.bg} shadow-sm`}
          />
        ))}
      </div>

      {/* Lower Lip Line */}
      <motion.div
        animate={{
          width: isSurprised ? 0 : (state === "speaking" ? 35 : (isSmile ? 40 : 30)),
          height: isSurprised ? 0 : 2,
          borderRadius: "0 0 50% 50%",
          y: isSmile ? -2 : 0
        }}
        className={`bg-white/20 blur-[0.5px]`}
      />
    </div>
  );
}
