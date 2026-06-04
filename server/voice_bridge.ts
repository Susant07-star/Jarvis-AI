import fs from "fs";
import path from "path";
import { logger } from "./logger";

const HF_URL = process.env.HUGGINGFACE_VOICE_API_URL;
const HF_KEY = process.env.HUGGINGFACE_VOICE_API_KEY;

// ── Heartbeat ─────────────────────────────────────────────────────────────────
/**
 * Pings the Hugging Face Voice Biometrics engine every 10 minutes
 * to ensure the free Space never goes to sleep.
 */
export function startVoiceEngineHeartbeat() {
  if (!HF_URL) {
    logger.warn("VoiceEngine", "Heartbeat disabled: HUGGINGFACE_VOICE_API_URL not set.");
    return;
  }
  const INTERVAL = 10 * 60 * 1000;
  logger.info("VoiceEngine", `Starting heartbeat monitor for: ${HF_URL}`);
  setInterval(async () => {
    try {
      const response = await fetch(HF_URL);
      logger.info("VoiceEngine", `Heartbeat OK (Status: ${response.status})`);
    } catch (error: any) {
      logger.error("VoiceEngine", `Heartbeat FAILED: ${error.message}`);
    }
  }, INTERVAL);
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface VoiceVerificationResult {
  speaker: "boss" | "known" | "unknown" | "rejected";
  confidence: number;
  liveness: boolean;
  name?: string;        // set if speaker is "known"
  embedding?: string;   // set if speaker is "unknown" (for enrollment)
  reason?: string;      // set if speaker is "rejected"
}

// ── Voice Verification ────────────────────────────────────────────────────────
/**
 * Sends an audio file to the Hugging Face Voice Engine for speaker verification.
 * Returns a structured result with the speaker identity.
 */
export async function verifyVoice(audioSource: string | Buffer): Promise<VoiceVerificationResult> {
  if (!HF_URL || !HF_KEY) {
    logger.warn("VoiceEngine", "Voice verification skipped: env vars not set. Treating as Boss.");
    return { speaker: "boss", confidence: 1.0, liveness: true };
  }

  try {
    let audioBuffer: Buffer;
    let fileName = "audio.ogg";
    
    if (Buffer.isBuffer(audioSource)) {
      audioBuffer = audioSource;
    } else {
      audioBuffer = fs.readFileSync(audioSource);
      fileName = path.basename(audioSource);
    }

    // Build multipart/form-data manually (no external dependencies needed)
    const boundary = `----JarvisFormBoundary${Date.now()}`;
    const CRLF = "\r\n";

    const header = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="audio_file"; filename="${fileName}"${CRLF}` +
      `Content-Type: audio/ogg${CRLF}${CRLF}`
    );
    const footer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const body = Buffer.concat([header, audioBuffer, footer]);

    logger.info("VoiceEngine", `Verifying voice for file: ${fileName} (${audioBuffer.length} bytes)`);

    const response = await fetch(`${HF_URL}/verify`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error("VoiceEngine", `Verification API error ${response.status}: ${errText.substring(0, 200)}`);
      // Fail open — if the engine is down, don't lock the Boss out
      return { speaker: "boss", confidence: 0.5, liveness: true };
    }

    const result = await response.json() as VoiceVerificationResult;
    logger.info("VoiceEngine", `Verification result: speaker=${result.speaker}, confidence=${result.confidence}`);
    return result;

  } catch (error: any) {
    logger.error("VoiceEngine", `Voice verification failed with exception: ${error.message}`);
    // Fail open — network issues shouldn't lock the Boss out
    return { speaker: "boss", confidence: 0.5, liveness: true };
  }
}

