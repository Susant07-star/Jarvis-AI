/**
 * Pings the Hugging Face Voice Biometrics engine every 10 minutes
 * to ensure the free Space never goes to sleep.
 */
export function startVoiceEngineHeartbeat() {
  const hfUrl = process.env.HUGGINGFACE_VOICE_API_URL;
  if (!hfUrl) {
    console.log("[VoiceEngine] Heartbeat disabled: HUGGINGFACE_VOICE_API_URL not set in .env");
    return;
  }

  // Ping every 10 minutes (600,000 ms)
  const INTERVAL = 10 * 60 * 1000;

  console.log(`[VoiceEngine] Starting heartbeat monitor for: ${hfUrl}`);

  setInterval(async () => {
    try {
      // Send a lightweight GET request to the root health check endpoint using native fetch
      const response = await fetch(hfUrl);
      console.log(`[VoiceEngine] Heartbeat successful (Status: ${response.status})`);
    } catch (error: any) {
      console.error(`[VoiceEngine] Heartbeat failed! Space might be sleeping. Error: ${error.message}`);
    }
  }, INTERVAL);
}
