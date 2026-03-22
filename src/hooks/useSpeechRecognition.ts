import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isAwakeRef = useRef<boolean>(false); // For "Hey Jarvis" wake word

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech Recognition API not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      setInterimTranscript(currentInterim);

      if (finalTranscript) {
        const lowerTranscript = finalTranscript.toLowerCase().trim();
        
        // Wake word detection
        if (lowerTranscript.includes('hey jarvis') || lowerTranscript.includes('jarvis')) {
          isAwakeRef.current = true;
          // Strip the wake word from the transcript if we want, or just pass it
          const cleaned = lowerTranscript.replace(/hey jarvis/g, '').replace(/jarvis/g, '').trim();
          if (cleaned) {
            setTranscript(cleaned);
          } else {
            // Just woke up, maybe play a sound or just wait
            setTranscript('...'); // Indicate awake
          }
        } else if (isAwakeRef.current) {
          setTranscript(finalTranscript.trim());
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      if (event.error !== 'no-speech') {
        setError(`Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if it was supposed to be listening
      if (isListening) {
        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        isAwakeRef.current = true; // Force awake when manually started
        recognitionRef.current.start();
      } catch (e) {
        console.error("Failed to start recognition", e);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      isAwakeRef.current = false;
      setIsListening(false);
      recognitionRef.current.stop();
    }
  }, [isListening]);

  // Optional: A function to explicitly set awake state
  const setAwake = (awake: boolean) => {
    isAwakeRef.current = awake;
  };

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
    hasRecognition: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    error,
    setAwake
  };
}
