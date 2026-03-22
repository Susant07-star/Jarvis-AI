import { motion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceVisualizerProps {
  isListening: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function VoiceVisualizer({ isListening, onToggle, disabled }: VoiceVisualizerProps) {
  return (
    <div className="flex flex-col items-center justify-center relative w-48 h-48">
      {/* Outer rotating rings */}
      <motion.div 
        className="absolute inset-0 rounded-full border border-cyan-500/30 border-t-cyan-400"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <motion.div 
        className="absolute inset-2 rounded-full border border-blue-500/20 border-b-cyan-300"
        animate={{ rotate: -360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Inner pulsing core when listening */}
      {isListening && (
        <>
          <motion.div 
            className="absolute inset-8 rounded-full bg-cyan-500/20 blur-md"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div 
            className="absolute inset-12 rounded-full bg-cyan-400/40 blur-sm"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      {/* Center Button */}
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300
          ${isListening 
            ? 'bg-cyan-950/80 border-2 border-cyan-400 jarvis-box-glow text-cyan-300' 
            : 'bg-slate-900/80 border border-cyan-800/50 text-cyan-700 hover:border-cyan-500 hover:text-cyan-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isListening ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8" />}
      </button>
      
      {/* Status text */}
      <div className="absolute -bottom-8 text-xs font-mono tracking-widest uppercase text-cyan-500/70">
        {isListening ? 'Awaiting Input...' : 'System Standby'}
      </div>
    </div>
  );
}
