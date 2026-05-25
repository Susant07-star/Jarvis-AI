import { logger } from "./logger";

/**
 * IRIS Executor — The bridge between J.A.R.V.I.S. (Brain) and I.R.I.S. (Hands).
 *
 * This module is responsible for sending physical OS execution commands
 * to the locally-running I.R.I.S. Electron daemon.
 *
 * How it works:
 * 1. I.R.I.S. boots on the user's PC and opens a local HTTP server on port 4000.
 * 2. I.R.I.S. uses 'untun' (Cloudflare Tunnel) to expose that port to the internet with a public URL.
 * 3. That public URL is saved into the IRIS_WORMHOLE_URL environment variable.
 * 4. J.A.R.V.I.S. reads IRIS_WORMHOLE_URL and sends commands here.
 *
 * Security: Every request includes the IRIS_API_KEY bearer token to prevent
 *           unauthorized access to the user's physical machine.
 */

const IRIS_API_KEY = process.env.IRIS_API_KEY || "ironman123";

function getIrisUrl(): string | null {
  return process.env.IRIS_WORMHOLE_URL || null;
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
  const irisUrl = getIrisUrl();

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
    return {
      success: false,
      message: `Could not reach I.R.I.S. on your PC. Is the app running? Error: ${err.message}`,
    };
  }
}
