import { useState, useCallback, useRef, useEffect } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function useJarvisVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [llmResponse, setLlmResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isListeningRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Playback queue
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const recognitionRef = useRef<any>(null);

  const stopSpeaking = useCallback(() => {
    audioQueueRef.current = [];
    setIsSpeaking(false);
    isPlayingRef.current = false;
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('Connected to J.A.R.V.I.S. WebSocket');
    };
    
    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'interim') {
            setInterimTranscript(data.text);
          } else if (data.type === 'final') {
            setTranscript(data.text);
            setInterimTranscript('');
          } else if (data.type === 'processing') {
            setIsProcessing(true);
          } else if (data.type === 'llm_start') {
            setLlmResponse('');
          } else if (data.type === 'llm_chunk') {
            setLlmResponse(prev => prev + data.text);
          } else if (data.type === 'browser_commands') {
            window.dispatchEvent(new CustomEvent('jarvis_browser_commands', { detail: data.commands }));
          } else if (data.type === 'done') {
            setIsProcessing(false);
          } else if (data.type === 'interrupted') {
            console.log('Backend signaled interruption');
            stopSpeaking();
            setIsProcessing(false);
          } else if (data.type === 'error') {
            setError(data.message);
            setIsProcessing(false);
            setIsSpeaking(false);
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      } else if (event.data instanceof Blob) {
        // Handle incoming TTS audio buffer
        const arrayBuffer = await event.data.arrayBuffer();
        if (!playbackContextRef.current) {
          playbackContextRef.current = new AudioContext();
        }
        
        try {
          const audioBuffer = await playbackContextRef.current.decodeAudioData(arrayBuffer);
          audioQueueRef.current.push(audioBuffer);
          playNextInQueue();
        } catch (e) {
          console.error('Failed to decode audio chunk:', e);
        }
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected, attempting reconnect...');
      setTimeout(connectWebSocket, 2000);
    };
    
    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
    };
    
    wsRef.current = ws;
  }, [stopSpeaking]);

  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
        setIsSpeaking(false);
      }
      return;
    }
    if (!playbackContextRef.current) return;
    
    isPlayingRef.current = true;
    setIsSpeaking(true);
    const buffer = audioQueueRef.current.shift()!;
    const source = playbackContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackContextRef.current.destination);
    currentSourceRef.current = source;
    
    source.onended = () => {
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      playNextInQueue();
    };
    
    source.start();
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (playbackContextRef.current) {
        playbackContextRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setInterimTranscript('');
      setIsProcessing(false);
      stopSpeaking(); // Stop any ongoing TTS when user starts listening
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone API is not supported in this browser.');
      }

      // Initialize SpeechRecognition for interim transcripts
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              // We rely on backend Whisper for final transcript, but we can show it here temporarily
              interim += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (interim.trim()) {
            setInterimTranscript(interim);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'aborted' || event.error === 'network' || event.error === 'no-speech') {
            // Ignore expected errors from SpeechRecognition when used alongside getUserMedia or when aborted
            return;
          }
          console.error('Speech recognition error:', event.error);
        };

        recognition.onend = () => {
          // Auto-restart recognition if we are still supposed to be listening
          if (isListeningRef.current) {
            try { recognition.start(); } catch(e) {}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;
      
      // Silence detection
      const analyser = audioContext.createAnalyser();
      analyser.minDecibels = -60;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      let hasSpoken = false;
      const SILENCE_THRESHOLD = 2000;
      
      const checkSilence = () => {
        if (!isListeningRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        
        if (average > 10) { // Speech detected
          if (!hasSpoken) {
            // User started speaking, interrupt TTS if playing
            stopSpeaking();
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'speech_start' }));
            }
          }
          hasSpoken = true;
          silenceStart = Date.now();
        } else {
          const timeSilent = Date.now() - silenceStart;
          if (hasSpoken && timeSilent > SILENCE_THRESHOLD) {
            // Silence detected after speech -> trigger backend processing
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'speech_end' }));
            }
            hasSpoken = false;
            silenceStart = Date.now();
            
            // Restart SpeechRecognition to clear its interim buffer
            if (recognitionRef.current) {
               try { recognitionRef.current.stop(); } catch(e){}
            }
          }
        }
        requestAnimationFrame(checkSilence);
      };

      workletNode.port.onmessage = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Send raw PCM Int16 buffer continuously
          wsRef.current.send(event.data);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination); // Required for worklet to process
      
      setIsListening(true);
      isListeningRef.current = true;
      
      // Start silence check loop
      requestAnimationFrame(checkSilence);
      
    } catch (err: any) {
      console.error('Microphone error:', err);
      setError('Microphone access denied or unavailable.');
      setIsListening(false);
      isListeningRef.current = false;
      setInterimTranscript('');
    }
  }, [stopSpeaking]);

  const stopListening = useCallback(() => {
    if (isListeningRef.current) {
      setIsListening(false);
      isListeningRef.current = false;
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'speech_end' }));
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
        recognitionRef.current = null;
      }
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setInterimTranscript('');
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    transcript,
    interimTranscript,
    llmResponse,
    startListening,
    stopListening,
    stopSpeaking,
    resetTranscript,
    hasRecognition: true,
    error
  };
}
