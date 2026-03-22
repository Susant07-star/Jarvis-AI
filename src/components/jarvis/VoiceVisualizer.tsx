import { motion } from 'motion/react';
import { Mic, MicOff, Volume2, Loader2 } from 'lucide-react';

interface VoiceVisualizerProps {
  appState: 'idle' | 'listening' | 'processing' | 'speaking';
  onToggle: () => void;
  disabled?: boolean;
}

export function VoiceVisualizer({ appState, onToggle, disabled }: VoiceVisualizerProps) {
  const isListening = appState === 'listening';
  const isSpeaking = appState === 'speaking';
  const isProcessing = appState === 'processing';

  return (
    <div className="flex flex-col items-center justify-center relative w-48 h-48">
      {/* Outer rotating rings */}
      <motion.div 
        className={`absolute inset-0 rounded-full border ${isSpeaking ? 'border-emerald-500/30 border-t-emerald-400' : 'border-cyan-500/30 border-t-cyan-400'}`}
        animate={{ rotate: 360 }}
        transition={{ duration: isProcessing ? 2 : 8, repeat: Infinity, ease: "linear" }}
      />
      <motion.div 
        className={`absolute inset-2 rounded-full border ${isSpeaking ? 'border-emerald-500/20 border-b-emerald-300' : 'border-blue-500/20 border-b-cyan-300'}`}
        animate={{ rotate: -360 }}
        transition={{ duration: isProcessing ? 3 : 12, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Inner pulsing core when listening or speaking */}
      {(isListening || isSpeaking) && (
        <>
          <motion.div 
            className={`absolute inset-8 rounded-full blur-md ${isSpeaking ? 'bg-emerald-500/20' : 'bg-cyan-500/20'}`}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: isSpeaking ? 0.5 : 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div 
            className={`absolute inset-12 rounded-full blur-sm ${isSpeaking ? 'bg-emerald-400/40' : 'bg-cyan-400/40'}`}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: isSpeaking ? 0.3 : 1, repeat: Infinity, ease: "easeInOut" }}
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
            : isSpeaking
            ? 'bg-emerald-950/80 border-2 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)] text-emerald-300'
            : isProcessing
            ? 'bg-indigo-950/80 border-2 border-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.5)] text-indigo-300'
            : 'bg-slate-900/80 border border-cyan-800/50 text-cyan-700 hover:border-cyan-500 hover:text-cyan-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isListening ? <Mic className="w-8 h-8" /> : isSpeaking ? <Volume2 className="w-8 h-8" /> : isProcessing ? <Loader2 className="w-8 h-8 animate-spin" /> : <MicOff className="w-8 h-8" />}
      </button>
      
      {/* Status text */}
      <div className={`absolute -bottom-8 text-xs font-mono tracking-widest uppercase ${isSpeaking ? 'text-emerald-500/70' : isProcessing ? 'text-indigo-500/70' : 'text-cyan-500/70'}`}>
        {isListening ? 'Awaiting Input...' : isSpeaking ? 'Transmitting...' : isProcessing ? 'Processing...' : 'System Standby'}
      </div>
    </div>
  );
}
