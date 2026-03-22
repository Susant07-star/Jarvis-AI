import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

/**
 * Creates a valid WAV header for raw PCM audio data.
 * Required for Groq Whisper transcription.
 */
export function createWavHeader(dataLength: number, sampleRate: number = 16000, numChannels: number = 1, bitsPerSample: number = 16): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // ByteRate
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * Transcribes raw PCM audio data using Groq's Whisper model.
 */
export async function transcribeAudio(audioBuffer: Buffer[], groq: Groq): Promise<string> {
  try {
    console.log(`[STT] Transcribing ${audioBuffer.length} audio chunks...`);
    
    const pcmData = Buffer.concat(audioBuffer);
    const wavHeader = createWavHeader(pcmData.length);
    const wavBuffer = Buffer.concat([wavHeader, pcmData]);
    
    // Ensure uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    
    const tempFilePath = path.join(process.cwd(), `uploads/temp_${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, wavBuffer);
    
    console.log(`[STT] Saved temporary WAV file: ${tempFilePath} (${wavBuffer.length} bytes)`);
    
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-large-v3",
    });
    
    // Clean up
    fs.unlinkSync(tempFilePath);
    
    const text = transcription.text.trim();
    console.log(`[STT] Transcription complete: "${text}"`);
    
    return text;
  } catch (error) {
    console.error("[STT Error]", error);
    throw error;
  }
}
