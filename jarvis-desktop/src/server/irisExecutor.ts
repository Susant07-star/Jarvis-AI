import { logger } from "./logger";
import { supabase } from "./supabaseClient";

/**
 * Desktop executor - bridge between J.A.R.V.I.S. brain and local hands.
 *
 * This module is responsible for sending physical OS execution commands
 * to the locally-running J.A.R.V.I.S. desktop bridge.
 *
 * How it works:
 * 1. J.A.R.V.I.S. boots on the user's PC and opens a local HTTP server on port 4000.
 * 2. J.A.R.V.I.S. can use 'untun' (Cloudflare Tunnel) to expose that port with a public URL.
 * 3. That public URL can be synced to the Supabase desktop config table.
 * 4. J.A.R.V.I.S. reads the dynamic URL from Supabase and sends commands here.
 *
 * Security: Every request includes the desktop bridge bearer token to prevent
 *           unauthorized access to the user's physical machine.
 */

const IRIS_API_KEY = process.env.JARVIS_BRIDGE_API_KEY || process.env.IRIS_API_KEY || "ironman123";

let cachedIrisUrl: string | null = process.env.JARVIS_WORMHOLE_URL || process.env.IRIS_WORMHOLE_URL || null;
let lastFetchTime = 0;

/**
 * Enhanced executor with visual verification
 */
export async function executeOnIrisWithVerification(
  action: string,
  payload: Record<string, any>
): Promise<IrisCommandResult> {
  // Execute the original action
  const result = await executeOnIris(action, payload);
  
  // If action was successful and is an OS interaction action, verify with screenshot
  if (result.success && 
      ['open_app', 'close_app', 'click_screen', 'phantom_type', 'type_text', 
       'press_key', 'press_keys', 'run_command', 'scroll'].includes(action)) {
    
    // Minimal delay to let the action settle (reduced from 500ms to 100ms for speed)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Take verification screenshot
    const verifyResult = await executeOnIris('screenshot', {});
    
    if (verifyResult.success && verifyResult.data) {
      // Attach verification data to result
      return {
        ...result,
        verification: {
          screenshotTaken: true,
          timestamp: new Date().toISOString(),
          data: verifyResult.data
        }
      };
    }
  }
  
  return result;
}

async function getIrisUrl(forceRefresh = false): Promise<string | null> {
  // If we don't have supabase configured, just use env
  if (!supabase) return process.env.JARVIS_WORMHOLE_URL || process.env.IRIS_WORMHOLE_URL || null;

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
      logger.info("IrisExecutor", `Synced new J.A.R.V.I.S. desktop tunnel URL from Supabase: ${cachedIrisUrl}`);
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
  verification?: {
    screenshotTaken: boolean;
    timestamp: string;
    data?: any;
  };
}

/**
 * Sends a physical OS command to the J.A.R.V.I.S. desktop bridge on the user's PC.
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
      "Desktop bridge URL is not set. J.A.R.V.I.S. desktop control is not connected."
    );
    return {
      success: false,
      message:
        "J.A.R.V.I.S. desktop control is offline. Please start the J.A.R.V.I.S. application on your local machine first.",
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
      logger.error("IrisExecutor", `J.A.R.V.I.S. desktop bridge returned error ${response.status}: ${errText}`);
      return {
        success: false,
        message: `J.A.R.V.I.S. desktop bridge rejected the command (${response.status}): ${errText}`,
      };
    }

    const result = await response.json();
    logger.info("IrisExecutor", `J.A.R.V.I.S. desktop result [${result.success ? 'SUCCESS' : 'FAILED'}]: ${result.message}`);
    if (result.data && Object.keys(result.data).length > 0) {
      logger.info("IrisExecutor", `J.A.R.V.I.S. desktop data: ${JSON.stringify(result.data, null, 2)}`);
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
          "J.A.R.V.I.S. desktop control did not respond in time. The command may have run anyway, but I cannot confirm.",
      };
    }
    logger.error("IrisExecutor", `Failed to reach J.A.R.V.I.S. desktop bridge: ${err.message}`);
    // Clear cache so next request fetches fresh URL in case tunnel died
    lastFetchTime = 0; 
    return {
      success: false,
      message: `Could not reach J.A.R.V.I.S. desktop control on your PC. Is the app running? Error: ${err.message}`,
    };
  }
}

/**
 * Retrieves the Photographic Memory Buffer from J.A.R.V.I.S. desktop vision.
 * Returns an array of up to 10 base64-encoded JPEG frames (1 per second).
 * Returns null if desktop vision is offline or the buffer is empty.
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
