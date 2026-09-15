import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

/**
 * Creates a valid WAV header for raw PCM audio data.
 */
export function createWavHeader(dataLength: number, sampleRate: number = 16000, numChannels: number = 1, bitsPerSample: number = 16): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
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
    if (!audioBuffer || audioBuffer.length === 0) {
      logger.warn('STT', 'Empty audio buffer, skipping transcription');
      return '';
    }

    const pcmData = Buffer.concat(audioBuffer);
    
    // Skip if audio is too short (< 0.5s at 16kHz 16-bit mono = 16000 bytes)
    if (pcmData.length < 16000) {
      logger.warn('STT', `Audio too short (${pcmData.length} bytes), skipping`);
      return '';
    }

    logger.info('STT', `Transcribing ${audioBuffer.length} chunks (${pcmData.length} bytes)`);
    
    const wavHeader = createWavHeader(pcmData.length);
    const wavBuffer = Buffer.concat([wavHeader, pcmData]);
    
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    
    const tempFilePath = path.join(process.cwd(), `uploads/temp_${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, wavBuffer);
    
    logger.info('STT', `WAV saved: ${wavBuffer.length} bytes`);
    
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-large-v3",
    });
    
    // Clean up temp file
    try { fs.unlinkSync(tempFilePath); } catch {}
    
    const text = transcription.text.trim();
    logger.info('STT', `Result: "${text}"`);
    
    return text;
  } catch (error) {
    logger.error('STT', 'Transcription failed', error);
    throw error;
  }
}
