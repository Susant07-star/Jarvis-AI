import { useState, useCallback, useRef, useEffect } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

/**
 * useJarvisVoice — Clean voice pipeline hook.
 *
 * Architecture:
 *   1. AudioWorklet captures raw PCM and streams it to the backend via WebSocket.
 *   2. Browser SpeechRecognition provides local transcript display.
 *   3. On isFinal from SpeechRecognition, we debounce 1.2s then send speech_end.
 *   4. Backend runs Whisper STT on the accumulated audio buffer and responds.
 *   5. A processing lock prevents stray recognition events from aborting the backend.
 */
export function useJarvisVoice() {
  // ── UI State ──
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [llmResponse, setLlmResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Refs ──
  const wsRef = useRef<WebSocket | null>(null);
  const isListeningRef = useRef(false);
  const lockedRef = useRef(false);          // Processing lock
  const speechStartSentRef = useRef(false); // Have we told backend "speech_start"?
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio capture
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // TTS playback
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBuffer[]>([]);
  const playingRef = useRef(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // ── Helpers ──

  const stopSpeaking = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    setIsSpeaking(false);
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
  }, []);

  const playNext = useCallback(() => {
    if (playingRef.current || queueRef.current.length === 0) {
      if (queueRef.current.length === 0 && !playingRef.current) setIsSpeaking(false);
      return;
    }
    if (!playbackCtxRef.current) return;
    playingRef.current = true;
    setIsSpeaking(true);
    const buf = queueRef.current.shift()!;
    const src = playbackCtxRef.current.createBufferSource();
    src.buffer = buf;
    src.connect(playbackCtxRef.current.destination);
    sourceRef.current = src;
    src.onended = () => { playingRef.current = false; sourceRef.current = null; playNext(); };
    src.start();
  }, []);

  /** Send speech_start JSON to backend (once per utterance). */
  const sendSpeechStart = useCallback(() => {
    if (lockedRef.current || speechStartSentRef.current) return;
    stopSpeaking();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'speech_start' }));
      speechStartSentRef.current = true;
    }
  }, [stopSpeaking]);

  /**
   * Debounced: send speech_end after silence.
   * fast=true  → 500ms  (used when SpeechRecognition says isFinal — utterance complete)
   * fast=false → 1500ms (used for interim results — may still be speaking)
   */
  const scheduleSpeechEnd = useCallback((fast = false) => {
    if (lockedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = fast ? 500 : 1500;
    debounceRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN && speechStartSentRef.current) {
        console.log(`[Voice] Sending speech_end (fast=${fast})`);
        wsRef.current.send(JSON.stringify({ type: 'speech_end' }));
        speechStartSentRef.current = false;
        lockedRef.current = true;   // LOCK — block all speech events until backend responds
        setIsProcessing(true);
      }
      debounceRef.current = null;
    }, delay);
  }, []);

  /** Cancel pending debounce (user is still talking). */
  const cancelSpeechEnd = useCallback(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
  }, []);

  /** Unlock after backend finishes. */
  const unlock = useCallback(() => {
    lockedRef.current = false;
    setIsProcessing(false);
  }, []);

  // ── WebSocket ──

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const pin = localStorage.getItem('jarvis_pin') || '';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?pin=${encodeURIComponent(pin)}`);

    ws.onopen = () => console.log('[Voice] WS connected');

    ws.onmessage = async (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const d = JSON.parse(ev.data);
          switch (d.type) {
            case 'interim':          setInterimTranscript(d.text); break;
            case 'final':            setTranscript(d.text); setInterimTranscript(''); break;
            case 'processing':       setIsProcessing(true); break;
            case 'llm_start':        setLlmResponse(''); break;
            case 'llm_chunk':        setLlmResponse(p => p + d.text); break;
            case 'browser_commands': window.dispatchEvent(new CustomEvent('jarvis_browser_commands', { detail: d.commands })); break;
            case 'done':             unlock(); break;
            case 'interrupted':      stopSpeaking(); unlock(); break;
            case 'error':            setError(d.message); unlock(); setIsSpeaking(false); break;
          }
        } catch {}
      } else if (ev.data instanceof Blob) {
        // TTS audio chunk
        const ab = await ev.data.arrayBuffer();
        if (!playbackCtxRef.current) playbackCtxRef.current = new AudioContext();
        try {
          const audioBuf = await playbackCtxRef.current.decodeAudioData(ab);
          queueRef.current.push(audioBuf);
          playNext();
        } catch {}
      }
    };

    ws.onclose = () => { console.log('[Voice] WS closed, reconnecting…'); setTimeout(connectWs, 2000); };
    ws.onerror = (e) => console.error('[Voice] WS error', e);
    wsRef.current = ws;
  }, [stopSpeaking, playNext, unlock]);

  useEffect(() => {
    connectWs();
    return () => { wsRef.current?.close(); playbackCtxRef.current?.close(); };
  }, [connectWs]);

  // ── Start Listening ──

  const startListening = useCallback(async () => {
    try {
      setError(null); setTranscript(''); setInterimTranscript(''); setIsProcessing(false);
      lockedRef.current = false;
      speechStartSentRef.current = false;
      stopSpeaking();

      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Mic not supported');

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      const initSpeechRecognition = () => {
        if (!SR || !isListeningRef.current) {
          console.warn('[Voice] SR unavailable or not listening. SR:', !!SR, 'Listening:', isListeningRef.current);
          return;
        }

        console.log('[Voice] Initializing new SpeechRecognition instance');
        try {
          const rec = new SR();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';

          let isReconSrvRunning = false;
          rec.onstart = () => { 
            console.log('[Voice] SpeechRecognition onstart fired');
            isReconSrvRunning = true; 
          };
          
          rec.onresult = (ev: any) => {
            if (lockedRef.current) return;
            let interim = '';
            let hasFinal = false;
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              interim += ev.results[i][0].transcript;
              if (ev.results[i].isFinal) hasFinal = true;
            }
            if (interim.trim()) {
              if (!speechStartSentRef.current) sendSpeechStart();
              setInterimTranscript(interim);
            }
            // isFinal=true means the browser is confident the utterance is complete.
            // Trigger a short 500ms debounce instead of 1500ms to send quickly.
            scheduleSpeechEnd(hasFinal);
          };

          rec.onerror = (ev: any) => {
            console.error(`[Voice] Recognition error: ${ev.error} (message: ${ev.message || 'none'})`);
            if (['aborted', 'network', 'no-speech'].includes(ev.error)) return;
          };

          rec.onend = () => { 
            console.log('[Voice] SpeechRecognition onend fired');
            isReconSrvRunning = false;
            recognitionRef.current = null;
            if (isListeningRef.current) {
              console.log('[Voice] Reinitializing after onend');
              setTimeout(initSpeechRecognition, 300); 
            } 
          };

          rec.start();
          console.log('[Voice] rec.start() called');
          recognitionRef.current = rec;
        } catch (e) {
          console.error('[Voice] Failed to init SpeechRecognition', e);
          if (isListeningRef.current) setTimeout(initSpeechRecognition, 1000);
        }
      };

      // CRITICAL FIX: Set the listener flag to true BEFORE initializing the engine!
      isListeningRef.current = true;
      initSpeechRecognition();

      // 2. Raw PCM capture → streams to backend via WS
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = ctx;
      await ctx.audioWorklet.addModule('/audio-processor.js');

      const src = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'audio-processor');
      workletNodeRef.current = worklet;

      worklet.port.onmessage = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(e.data);
      };

      src.connect(worklet);
      worklet.connect(ctx.destination);

      setIsListening(true);
      sendSpeechStart(); // CRITICAL FIX: Tell backend to start buffering audio immediately
    } catch (err: any) {
      console.error('[Voice] Mic error:', err);
      setError('Microphone access denied or unavailable.');
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [stopSpeaking, sendSpeechStart, scheduleSpeechEnd, cancelSpeechEnd]);

  // ── Stop Listening ──

  const stopListening = useCallback(() => {
    if (!isListeningRef.current) return;
    setIsListening(false);
    isListeningRef.current = false;

    // Flush: send speech_end immediately if we have unsent audio
    cancelSpeechEnd();
    if (wsRef.current?.readyState === WebSocket.OPEN && speechStartSentRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'speech_end' }));
      speechStartSentRef.current = false;
    }

    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setInterimTranscript('');
  }, [cancelSpeechEnd]);

  const resetTranscript = useCallback(() => { setTranscript(''); setInterimTranscript(''); }, []);

  return {
    isListening, isProcessing, isSpeaking,
    transcript, interimTranscript, llmResponse,
    startListening, stopListening, stopSpeaking, resetTranscript,
    hasRecognition: true, error
  };
}
