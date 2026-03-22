export class TTSManager {
  private static instance: TTSManager;
  private queue: { text: string, onEnd?: () => void }[] = [];
  private isSpeaking = false;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private currentCallback?: () => void;

  private constructor() {
    this.initVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = this.initVoices.bind(this);
    }
  }

  public static getInstance(): TTSManager {
    if (!TTSManager.instance) {
      TTSManager.instance = new TTSManager();
    }
    return TTSManager.instance;
  }

  private initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    this.preferredVoice = voices.find(v => 
      v.name.includes('Google UK English Male') || 
      v.name.includes('Daniel') || 
      v.name.includes('Samantha') ||
      (v.lang === 'en-GB' && v.name.includes('Male'))
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
  }

  public speak(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEnd) onEnd();
      return;
    }
    
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted for speech.')
      .replace(/[*_~`]/g, '')
      .replace(/\[.*?\]\(.*?\)/g, 'Link omitted.')
      .trim();

    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    
    sentences.forEach((s, index) => {
      this.queue.push({ 
        text: s.trim(), 
        onEnd: index === sentences.length - 1 ? onEnd : undefined 
      });
    });
    
    this.processQueue();
  }

  private processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;

    this.isSpeaking = true;
    const item = this.queue.shift()!;
    this.currentCallback = item.onEnd;
    
    const utterance = new SpeechSynthesisUtterance(item.text);
    if (this.preferredVoice) {
      utterance.voice = this.preferredVoice;
    }
    
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    
    utterance.onend = () => {
      this.isSpeaking = false;
      if (this.currentCallback) {
        this.currentCallback();
        this.currentCallback = undefined;
      }
      this.processQueue();
    };
    
    utterance.onerror = (e) => {
      console.error("TTS Error:", e);
      this.isSpeaking = false;
      if (this.currentCallback) {
        this.currentCallback();
        this.currentCallback = undefined;
      }
      this.processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }

  public stop() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    this.queue = [];
    window.speechSynthesis.cancel();
    this.isSpeaking = false;
    if (this.currentCallback) {
      this.currentCallback();
      this.currentCallback = undefined;
    }
  }
}

export const tts = TTSManager.getInstance();
