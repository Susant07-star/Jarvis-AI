import { useState, useCallback, useRef } from 'react';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setInterimTranscript('Listening...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone API is not supported in this browser or context.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Silence detection setup
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.minDecibels = -60;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      let hasSpoken = false;
      const SILENCE_THRESHOLD = 2000; // 2 seconds of silence to auto-stop after speaking
      const INITIAL_TIMEOUT = 5000; // 5 seconds to start speaking

      const checkSilence = () => {
        if (mediaRecorder.state !== 'recording') return;
        
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        
        if (average > 5) { // Sound detected
          hasSpoken = true;
          silenceStart = Date.now();
        } else { // Silence
          const timeSilent = Date.now() - silenceStart;
          if (hasSpoken && timeSilent > SILENCE_THRESHOLD) {
            // Auto stop after threshold
            mediaRecorder.stop();
            return;
          } else if (!hasSpoken && timeSilent > INITIAL_TIMEOUT) {
            // Auto stop if no speech detected initially
            mediaRecorder.stop();
            return;
          }
        }
        requestAnimationFrame(checkSilence);
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        audioContext.close();
        
        if (!hasSpoken) {
          setInterimTranscript('');
          setIsListening(false);
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        setInterimTranscript('Processing audio...');
        
        try {
          const formData = new FormData();
          const ext = mimeType.includes('mp4') ? '.mp4' : mimeType.includes('ogg') ? '.ogg' : '.webm';
          formData.append('audio', audioBlob, `recording${ext}`);
          
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });
          
          const responseText = await response.text();
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.error('Transcription API returned non-JSON:', responseText.substring(0, 150));
            throw new Error(`Server error: ${response.status}. Please try again.`);
          }
          
          if (!response.ok) {
            throw new Error(data.error || 'Transcription failed');
          }
          
          setInterimTranscript('');
          if (data.text) {
            setTranscript(data.text.trim());
          }
        } catch (err: any) {
          console.error(err);
          setError(err.message || 'Transcription error');
          setInterimTranscript('');
        }
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
      checkSilence();
    } catch (err: any) {
      console.error('Microphone error:', err);
      setError('Microphone access denied or unavailable.');
      setIsListening(false);
      setInterimTranscript('');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    hasRecognition: true,
    error,
    setAwake: () => {}
  };
}
