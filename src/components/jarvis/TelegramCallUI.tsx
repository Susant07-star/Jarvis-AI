import React, { useEffect, useState, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Check, X } from 'lucide-react';
import { useZoyaVoice } from '../../hooks/useZoyaVoice';
import ZoyaAvatar from './ZoyaAvatar';

// Define the Telegram WebApp type loosely
declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

export function TelegramCallUI() {
  const zoya = useZoyaVoice();
  const [isTelegram, setIsTelegram] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [ringtone] = useState(new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3')); // Sci-fi alert

  useEffect(() => {
    // Initialize Telegram Web App
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.expand();
      tg.ready();
      setIsTelegram(true);
      try {
        tg.setHeaderColor('#083344');
        tg.setBackgroundColor('#083344');
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    // If we've interacted but not started session yet, we're "Ringing"
    if (hasInteracted && !zoya.isSessionActive && !zoya.errorMessage) {
      setIsRinging(true);
      ringtone.loop = true;
      ringtone.play().catch(() => {});
      
      // Vibration pulse
      const vibrateInterval = setInterval(() => {
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
        }
      }, 1000);
      
      return () => {
        setIsRinging(false);
        ringtone.pause();
        ringtone.currentTime = 0;
        clearInterval(vibrateInterval);
      };
    } else {
      setIsRinging(false);
      ringtone.pause();
    }
  }, [hasInteracted, zoya.isSessionActive, zoya.errorMessage, ringtone]);

  const handleAcceptCall = useCallback(async () => {
    setIsRinging(false);
    ringtone.pause();
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
    }
    
    // Extract the exact Telegram Chat/User ID so JARVIS knows who to call back later
    const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
    zoya.startSession(undefined, tgUserId);
    
    // Request Wake Lock
    try {
      if ('wakeLock' in navigator) {
        const lock = await (navigator as any).wakeLock.request('screen');
        (window as any)._jarvisWakeLock = lock;
      }
    } catch (err) {}
  }, [zoya, ringtone]);

  const handleEndCall = useCallback(() => {
    zoya.stopSession();
    ringtone.pause();
    
    // Release Wake Lock
    try {
      if ((window as any)._jarvisWakeLock) {
        (window as any)._jarvisWakeLock.release();
        (window as any)._jarvisWakeLock = null;
      }
    } catch (e) {}

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.close();
    }
  }, [zoya, ringtone]);

  const handleStartCall = useCallback(() => {
    setHasInteracted(true);
  }, []);

  // Initial Landing State (Join Call Button)
  if (!hasInteracted) {
    return (
      <div className="h-screen w-screen bg-cyan-950 flex flex-col items-center justify-center p-6 font-mono text-cyan-400">
        <div className="mb-12 flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-cyan-900 border-2 border-cyan-500 flex items-center justify-center mb-4 jarvis-glow">
            <span className="text-3xl font-bold font-display tracking-widest text-white">J</span>
          </div>
          <h1 className="text-2xl font-bold tracking-[0.15em] text-white">J.A.R.V.I.S.</h1>
          <p className="text-xs text-cyan-600 mt-2">SECURE NEURAL LINK</p>
        </div>

        <button 
          onClick={handleStartCall}
          className="bg-emerald-500 hover:bg-emerald-400 text-cyan-950 rounded-full w-20 h-20 flex items-center justify-center animate-pulse transition-all shadow-[0_0_20px_rgba(16,185,129,0.5)]"
        >
          <Phone className="w-8 h-8 fill-current" />
        </button>
        <span className="mt-4 text-sm tracking-widest text-emerald-400">JOIN CHANNEL</span>
      </div>
    );
  }

  // Ringing State
  if (isRinging) {
    return (
      <div className="h-screen w-screen bg-cyan-950 flex flex-col items-center justify-between py-16 px-8 font-mono overflow-hidden">
        <div className="flex flex-col items-center mt-12">
          <div className="w-32 h-32 rounded-full bg-cyan-900 border-4 border-cyan-500 flex items-center justify-center mb-6 jarvis-glow animate-pulse">
             <ZoyaAvatar state="idle" size="sm" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-widest">J.A.R.V.I.S.</h2>
          <p className="text-cyan-500 mt-2 animate-pulse">INCOMING NEURAL LINK...</p>
        </div>

        <div className="flex gap-16 mb-12">
          <button 
            onClick={handleEndCall}
            className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:scale-110 transition-transform"
          >
            <X className="w-10 h-10 text-white" />
          </button>
          <button 
            onClick={handleAcceptCall}
            className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-110 transition-transform animate-bounce"
          >
            <Check className="w-10 h-10 text-white" />
          </button>
        </div>
      </div>
    );
  }

  const { appState, isMuted, toggleMute, emotion, errorMessage, sessionSeconds } = zoya;

  // Format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const statusText = 
    errorMessage ? "CONNECTION LOST" :
    appState === "listening" ? "LISTENING..." :
    appState === "processing" ? "THINKING..." :
    appState === "speaking" ? "SPEAKING" :
    appState === "idle" ? "CALL ENDED" :
    "CONNECTING...";

  const statusColor = 
    errorMessage ? "text-red-400" :
    appState === "listening" ? "text-cyan-400" :
    appState === "processing" ? "text-indigo-400" :
    appState === "speaking" ? "text-emerald-400" :
    "text-cyan-600";

  return (
    <div className="h-screen w-screen bg-cyan-950 flex flex-col font-mono overflow-hidden">
      
      {/* Header */}
      <div className="pt-8 pb-4 flex flex-col items-center">
        <h2 className="text-lg font-bold tracking-[0.2em] text-cyan-100">J.A.R.V.I.S.</h2>
        <div className="flex items-center gap-2 mt-1">
          <div className={`text-xs tracking-widest ${statusColor} ${appState !== 'idle' && !errorMessage ? 'animate-pulse' : ''}`}>
            {statusText}
          </div>
          {zoya.activeModel && !errorMessage && (
            <div className="text-[10px] bg-cyan-900/50 px-2 py-0.5 rounded border border-cyan-700/50 text-cyan-400 uppercase tracking-tighter">
              {zoya.activeModel.split('-').slice(1, 4).join(' ')}
            </div>
          )}
        </div>
        {(appState !== 'idle' && appState !== 'disconnected') && (
          <div className="text-xs text-cyan-600 mt-1">{formatTime(sessionSeconds)}</div>
        )}
      </div>

      {/* Main Avatar Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        <div className="scale-125 mb-8">
          <ZoyaAvatar state={appState} emotion={emotion} />
        </div>
        
        {errorMessage && (
          <div className="absolute bottom-10 px-8 text-center text-xs text-red-400 bg-red-950/50 p-2 rounded-lg border border-red-900">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Controls Footer */}
      <div className="h-32 bg-cyan-900/40 rounded-t-3xl border-t border-cyan-800 flex items-center justify-center gap-8 px-6 pb-6">
        
        {/* Mute Button */}
        <button 
          onClick={toggleMute}
          disabled={appState === 'idle' || appState === 'disconnected'}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isMuted 
              ? 'bg-cyan-100 text-cyan-900' 
              : 'bg-cyan-800/80 text-cyan-100 border border-cyan-700 disabled:opacity-50'
          }`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* End Call Button */}
        <button 
          onClick={handleEndCall}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.4)]"
        >
          <PhoneOff className="w-7 h-7" />
        </button>

      </div>
      
    </div>
  );
}
