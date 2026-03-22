import { useState, useCallback, useRef } from 'react';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);

  const SILENCE_THRESHOLD = 5; // Very low threshold for noise-suppressed audio
  const SILENCE_DURATION = 2000; // 2 seconds of silence

  const playSound = (type: 'start' | 'stop') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  };

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      playSound('stop');
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const checkSilence = useCallback(() => {
    if (!analyserRef.current || !isRecordingRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    
    if (average < SILENCE_THRESHOLD) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          stopListening();
        }, SILENCE_DURATION);
      }
    } else {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }
    
    if (isRecordingRef.current) {
      requestAnimationFrame(checkSilence);
    }
  }, [stopListening]);

  const startListening = useCallback(async () => {
    try {
      setTranscript('');
      setError(null);
      
      playSound('start');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) {
          setIsListening(false);
          isRecordingRef.current = false;
          setError('No audio recorded');
          return;
        }

        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 100) {
          setIsListening(false);
          isRecordingRef.current = false;
          setError('Audio too short');
          return;
        }
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        
        try {
          setIsListening(false);
          isRecordingRef.current = false;
          setTranscript('Processing audio...');
          
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.${ext}`);
          
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Transcription failed');
          }
          
          const data = await response.json();
          setTranscript(data.text);
          
        } catch (err: any) {
          console.error('Transcription error:', err);
          setError(err.message || 'Failed to transcribe audio');
          setTranscript('');
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      isRecordingRef.current = true;
      
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
      }, SILENCE_DURATION * 2);
      
      requestAnimationFrame(checkSilence);
      
    } catch (err: any) {
      console.error('Microphone error:', err);
      setError('Microphone access denied or not available.');
      setIsListening(false);
      isRecordingRef.current = false;
    }
  }, [checkSilence, stopListening]);

  return { 
    isListening, 
    transcript, 
    startListening, 
    stopListening, 
    hasRecognition: true,
    error
  };
}
