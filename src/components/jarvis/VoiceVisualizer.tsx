import { motion } from 'motion/react';
import { MicOff, Loader2 } from 'lucide-react';

interface VoiceVisualizerProps {
  appState: 'idle' | 'listening' | 'processing' | 'speaking';
  onToggle: () => void;
  disabled?: boolean;
}

export function VoiceVisualizer({ appState, onToggle, disabled }: VoiceVisualizerProps) {
  const isListening = appState === 'listening';
  const isSpeaking = appState === 'speaking';
  const isProcessing = appState === 'processing';

  const getThemeColor = (opacity: number) => {
    if (isSpeaking) return `rgba(52,211,153,${opacity})`;
    if (isProcessing) return `rgba(129,140,248,${opacity})`;
    return `rgba(34,211,238,${opacity})`;
  };

  return (
    <div className="flex flex-col items-center justify-center relative w-72 h-72">
      {/* SVG Tech Rings */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <motion.svg width="280" height="280" viewBox="0 0 280 280" className="absolute">
          {/* Outer Dial */}
          <motion.circle
            cx="140" cy="140" r="130"
            fill="none"
            stroke={getThemeColor(0.2)}
            strokeWidth="4"
            strokeDasharray="1 6"
            animate={{ rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            style={{ originX: "50%", originY: "50%" }}
          />
          {/* Crosshairs */}
          <path 
            d="M 140 0 L 140 15 M 140 265 L 140 280 M 0 140 L 15 140 M 265 140 L 280 140" 
            stroke={getThemeColor(0.5)} 
            strokeWidth="2" 
          />
          <motion.circle
            cx="140" cy="140" r="110"
            fill="none"
            stroke={getThemeColor(0.4)}
            strokeWidth="1"
            strokeDasharray="4 6"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            style={{ originX: "50%", originY: "50%" }}
          />
          <motion.circle
            cx="140" cy="140" r="95"
            fill="none"
            stroke={getThemeColor(0.6)}
            strokeWidth="2"
            strokeDasharray="20 10 5 10"
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            style={{ originX: "50%", originY: "50%" }}
          />
          <motion.circle
            cx="140" cy="140" r="80"
            fill="none"
            stroke={getThemeColor(0.3)}
            strokeWidth="4"
            strokeDasharray="2 8"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            style={{ originX: "50%", originY: "50%" }}
          />
          {/* Inner data ring */}
          <motion.circle
            cx="140" cy="140" r="65"
            fill="none"
            stroke={getThemeColor(0.5)}
            strokeWidth="1"
            strokeDasharray="4 4"
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            style={{ originX: "50%", originY: "50%" }}
          />
        </motion.svg>
      </div>

      {/* Inner pulsing core when listening or speaking */}
      {(isListening || isSpeaking) && (
        <motion.div 
          className={`absolute inset-20 rounded-full blur-2xl ${isSpeaking ? 'bg-emerald-500/40' : 'bg-cyan-500/40'}`}
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: isSpeaking ? 0.5 : 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Center Button */}
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500
          ${isListening 
            ? 'bg-cyan-950/90 border-2 border-cyan-400 jarvis-box-glow text-cyan-300 scale-110' 
            : isSpeaking
            ? 'bg-emerald-950/90 border-2 border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.6)] text-emerald-300 scale-110'
            : isProcessing
            ? 'bg-indigo-950/90 border-2 border-indigo-400 shadow-[0_0_30px_rgba(129,140,248,0.6)] text-indigo-300 scale-105'
            : 'bg-slate-900/80 border border-cyan-800/50 text-cyan-700 hover:border-cyan-500 hover:text-cyan-400 hover:scale-105 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isListening ? (
          <div className="flex items-center gap-1.5">
            {[...Array(4)].map((_, i) => (
              <motion.div key={i} className="w-1.5 bg-cyan-300 rounded-full" animate={{ height: [8, 24, 8] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
            ))}
          </div>
        ) : isSpeaking ? (
          <div className="flex items-center gap-1.5">
            {[...Array(5)].map((_, i) => (
              <motion.div key={i} className="w-1.5 bg-emerald-300 rounded-full" animate={{ height: [12, 40, 12] }} transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }} />
            ))}
          </div>
        ) : isProcessing ? (
          <Loader2 className="w-12 h-12 animate-spin" />
        ) : (
          <MicOff className="w-10 h-10" />
        )}
      </button>
      
      {/* Status text */}
      <div className="absolute -bottom-12 flex flex-col items-center">
        <div className={`text-sm font-mono tracking-[0.4em] uppercase font-bold
          ${isSpeaking ? 'text-emerald-400 jarvis-glow' : isProcessing ? 'text-indigo-400 jarvis-glow' : isListening ? 'text-cyan-400 animate-pulse jarvis-glow' : 'text-cyan-700'}
        `}>
          {isListening ? 'Awaiting Input' : isSpeaking ? 'Transmitting' : isProcessing ? 'Processing' : 'Standby'}
        </div>
        {/* Decorative underline */}
        <div className="flex items-center gap-2 mt-2 opacity-50">
          <div className={`h-[1px] w-8 ${isSpeaking ? 'bg-emerald-500' : isProcessing ? 'bg-indigo-500' : 'bg-cyan-500'}`} />
          <div className={`w-1.5 h-1.5 rotate-45 ${isSpeaking ? 'bg-emerald-500' : isProcessing ? 'bg-indigo-500' : 'bg-cyan-500'}`} />
          <div className={`h-[1px] w-8 ${isSpeaking ? 'bg-emerald-500' : isProcessing ? 'bg-indigo-500' : 'bg-cyan-500'}`} />
        </div>
      </div>
    </div>
  );
}
