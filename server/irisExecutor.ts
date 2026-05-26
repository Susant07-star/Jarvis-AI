import { logger } from "./logger";
import { supabase } from "./supabaseClient";

/**
 * IRIS Executor — The bridge between J.A.R.V.I.S. (Brain) and I.R.I.S. (Hands).
 *
 * This module is responsible for sending physical OS execution commands
 * to the locally-running I.R.I.S. Electron daemon.
 *
 * How it works:
 * 1. I.R.I.S. boots on the user's PC and opens a local HTTP server on port 4000.
 * 2. I.R.I.S. uses 'untun' (Cloudflare Tunnel) to expose that port to the internet with a public URL.
 * 3. That public URL is automatically synced to the Supabase iris_config table.
 * 4. J.A.R.V.I.S. reads the dynamic URL from Supabase and sends commands here.
 *
 * Security: Every request includes the IRIS_API_KEY bearer token to prevent
 *           unauthorized access to the user's physical machine.
 */

const IRIS_API_KEY = process.env.IRIS_API_KEY || "ironman123";

let cachedIrisUrl: string | null = process.env.IRIS_WORMHOLE_URL || null;
let lastFetchTime = 0;

async function getIrisUrl(forceRefresh = false): Promise<string | null> {
  // If we don't have supabase configured, just use env
  if (!supabase) return process.env.IRIS_WORMHOLE_URL || null;

  // Cache URL for 5 minutes unless forced
  const now = Date.now();
  if (!forceRefresh && cachedIrisUrl && (now - lastFetchTime < 300000)) {
    return cachedIrisUrl;
  }

  try {
    const { data, error } = await supabase.from('iris_config').select('tunnel_url').eq('id', 1).single();
    if (error) {
      logger.error("IrisExecutor", `Failed to fetch URL from Supabase: ${error.message}`);
      return cachedIrisUrl;
    }
    
    if (data && data.tunnel_url && data.tunnel_url !== 'offline') {
      cachedIrisUrl = data.tunnel_url;
      lastFetchTime = now;
      logger.info("IrisExecutor", `Synced new I.R.I.S. Tunnel URL from Supabase: ${cachedIrisUrl}`);
      return cachedIrisUrl;
    }
  } catch (err: any) {
    logger.error("IrisExecutor", `Supabase fetch exception: ${err.message}`);
  }
  
  return cachedIrisUrl;
}

export interface IrisCommandResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Sends a physical OS command to the I.R.I.S. daemon on the user's PC.
 * Returns a structured result so J.A.R.V.I.S. can narrate what happened.
 */
export async function executeOnIris(
  action: string,
  payload: Record<string, any>
): Promise<IrisCommandResult> {
  const irisUrl = await getIrisUrl();

  if (!irisUrl) {
    logger.warn(
      "IrisExecutor",
      "IRIS_WORMHOLE_URL is not set. I.R.I.S. is not connected."
    );
    return {
      success: false,
      message:
        "I.R.I.S. is offline. Please start the I.R.I.S. application on your local machine first.",
    };
  }

  const endpoint = `${irisUrl}/execute`;
  logger.info("IrisExecutor", `Sending command: [${action}] → ${endpoint}`);
  logger.info("IrisExecutor", `Payload: ${JSON.stringify(payload, null, 2)}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${IRIS_API_KEY}`,
      },
      body: JSON.stringify({ action, ...payload }),
      // 15 second timeout — OS actions can take a moment
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error("IrisExecutor", `I.R.I.S. returned error ${response.status}: ${errText}`);
      return {
        success: false,
        message: `I.R.I.S. rejected the command (${response.status}): ${errText}`,
      };
    }

    const result = await response.json();
    logger.info("IrisExecutor", `I.R.I.S. Result [${result.success ? 'SUCCESS' : 'FAILED'}]: ${result.message}`);
    if (result.data && Object.keys(result.data).length > 0) {
      logger.info("IrisExecutor", `I.R.I.S. Data: ${JSON.stringify(result.data, null, 2)}`);
    }
    
    return {
      success: result.success ?? true,
      message: result.message || "Command executed on your local machine.",
      data: result,
    };
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      logger.error("IrisExecutor", "Command timed out after 15 seconds.");
      return {
        success: false,
        message:
          "I.R.I.S. did not respond in time. The command may have run anyway, but I cannot confirm.",
      };
    }
    logger.error("IrisExecutor", `Failed to reach I.R.I.S.: ${err.message}`);
    // Clear cache so next request fetches fresh URL in case tunnel died
    lastFetchTime = 0; 
    return {
      success: false,
      message: `Could not reach I.R.I.S. on your PC. Is the app running? Error: ${err.message}`,
    };
  }
}

/**
 * Retrieves the Photographic Memory Buffer from I.R.I.S.
 * Returns an array of up to 10 base64-encoded JPEG frames (1 per second).
 * Returns null if I.R.I.S. is offline or the buffer is empty.
 */
export async function getVisionBuffer(): Promise<string[] | null> {
  const irisUrl = await getIrisUrl();
  if (!irisUrl) return null;

  try {
    const response = await fetch(`${irisUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${IRIS_API_KEY}`,
      },
      body: JSON.stringify({ action: 'get_vision_buffer' }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const frames: string[] = result?.data?.frames || [];
    if (frames.length > 0) {
      logger.info('IrisExecutor', `Vision buffer fetched: ${frames.length} frames.`);
    }
    return frames.length > 0 ? frames : null;
  } catch (err: any) {
    logger.warn('IrisExecutor', `Vision buffer fetch failed: ${err.message}`);
    return null;
  }
}
