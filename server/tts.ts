/**
 * Generates Text-to-Speech audio using a fallback API.
 * In production, replace with a high-quality TTS provider (e.g., ElevenLabs, OpenAI).
 */
export async function generateTTS(text: string): Promise<Buffer | null> {
  try {
    console.log(`[TTS] Generating audio for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // Using Google Translate TTS as a free, no-auth fallback for the prototype
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TTS failed with status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[TTS] Generated ${arrayBuffer.byteLength} bytes of audio.`);
    
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error("[TTS Error]", e);
    return null;
  }
}
