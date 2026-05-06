/**
 * useZoyaVoice — React hook wrapping ZoyaLiveService
 * =====================================================
 * Manages the full Zoya session lifecycle inside the JARVIS React app.
 * Exposes clean state for the ZoyaPanel component to render.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoyaLiveService, type ZoyaEmotion, type ZoyaMessage, type ZoyaState } from "../services/zoyaLiveService";

export interface ZoyaThought {
  id: string;
  text: string;
}

export interface ZoyaFile {
  id: string;
  title: string;
  url: string;
}

export function useZoyaVoice() {
  const serviceRef = useRef<ZoyaLiveService | null>(null);

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [appState, setAppState] = useState<ZoyaState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ZoyaMessage[]>([]);
  const [thoughts, setThoughts] = useState<ZoyaThought[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [files, setFiles] = useState<ZoyaFile[]>([]);
  const [emotion, setEmotion] = useState<ZoyaEmotion>("neutral");
  const [activeModel, setActiveModel] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // Session timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSessionActive) {
      const start = Date.now();
      interval = setInterval(() => setSessionSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    } else {
      setSessionSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isSessionActive]);

  // Sync mute state to service
  useEffect(() => {
    if (serviceRef.current) serviceRef.current.isMuted = isMuted;
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { serviceRef.current?.stop(); };
  }, []);

  const addThought = useCallback((text: string) => {
    setThoughts((prev) => [...prev, { id: `t-${Date.now()}-${Math.random()}`, text }]);
  }, []);

  const startSession = useCallback(async (timezone?: string) => {
    if (serviceRef.current) {
      serviceRef.current.stop();
      serviceRef.current = null;
    }

    setErrorMessage(null);
    setIsSessionActive(true);

    const svc = new ZoyaLiveService();
    svc.isMuted = isMuted;
    svc.currentTimezone = timezone;
    serviceRef.current = svc;

    svc.onStateChange = (state, err) => {
      setAppState(state);
      if (state === "disconnected" || state === "idle") setIsSessionActive(false);
      if (err) setErrorMessage(err);
    };

    svc.onMessage = (msg) => {
      setMessages((prev) => {
        // Avoid duplicate IDs
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    svc.onThought = addThought;

    svc.onSources = (newSources) => {
      setSources((prev) => Array.from(new Set([...prev, ...newSources])));
    };

    svc.onFiles = (newFiles) => {
      setFiles((prev) => [
        ...prev,
        ...newFiles.map((f) => ({ id: `f-${Date.now()}-${Math.random()}`, ...f })),
      ]);
    };

    svc.onEmotionChange = setEmotion;
    svc.onModelChange = setActiveModel;

    svc.onJarvisExecute = (intent) => {
      addThought(`→ JARVIS: "${intent}"`);
    };

    await svc.start();
  }, [isMuted, addThought]);

  const stopSession = useCallback(() => {
    serviceRef.current?.stop();
    serviceRef.current = null;
    setIsSessionActive(false);
    setAppState("idle");
    setEmotion("neutral");
  }, []);

  const sendText = useCallback((text: string) => {
    serviceRef.current?.sendText(text);
  }, []);

  const clearAll = useCallback(() => {
    setMessages([]);
    setThoughts([]);
    setSources([]);
    setFiles([]);
  }, []);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  return {
    // State
    isSessionActive,
    appState,
    errorMessage,
    messages,
    thoughts,
    sources,
    files,
    emotion,
    activeModel,
    isMuted,
    sessionSeconds,
    // Actions
    startSession,
    stopSession,
    sendText,
    clearAll,
    toggleMute,
  };
}
