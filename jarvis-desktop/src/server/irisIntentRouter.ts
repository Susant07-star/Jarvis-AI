import { logger } from "./logger";

// Desktop Intent Router
// Detects website/app requests and routes them through J.A.R.V.I.S. desktop control.

/**
 * Website URL mapping to system commands
 */
const WEBSITE_COMMANDS: Record<string, { app: string; url?: string }> = {
  'youtube.com': { app: 'chrome' },
  'www.youtube.com': { app: 'chrome' },
  'google.com': { app: 'chrome' },
  'www.google.com': { app: 'chrome' },
  'facebook.com': { app: 'chrome' },
  'www.facebook.com': { app: 'chrome' },
  'twitter.com': { app: 'chrome' },
  'www.twitter.com': { app: 'chrome' },
  'instagram.com': { app: 'chrome' },
  'www.instagram.com': { app: 'chrome' },
  'reddit.com': { app: 'chrome' },
  'www.reddit.com': { app: 'chrome' },
  'linkedin.com': { app: 'chrome' },
  'www.linkedin.com': { app: 'chrome' },
  'github.com': { app: 'chrome' },
  'www.github.com': { app: 'chrome' },
  'amazon.com': { app: 'chrome' },
  'www.amazon.com': { app: 'chrome' },
  'netflix.com': { app: 'chrome' },
  'www.netflix.com': { app: 'chrome' },
};

/**
 * Converts a navigation URL to a J.A.R.V.I.S. desktop open_app command.
 * Returns null if not a website request
 */
export function convertNavigationToIris(url: string): { action: string; payload: any } | null {
  const lowerUrl = url.toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '');
  
  // Check for known websites
  for (const [site, config] of Object.entries(WEBSITE_COMMANDS)) {
    if (lowerUrl.includes(site) || lowerUrl.includes(site.replace('www.', ''))) {
      logger.info("IrisRouter", `Converting ${url} to J.A.R.V.I.S. desktop ${config.app} command`);
      return {
        action: "open_app",
        payload: { appName: config.app }
      };
    }
  }
  
  // Check for open_url with full URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Extract domain
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      const mapped = WEBSITE_COMMANDS[domain];
      if (mapped) {
        return {
          action: "open_app",
          payload: { appName: mapped.app }
        };
      }
    } catch {
      return null;
    }
  }
  
  return null;
}

/**
 * Intercepts and transforms browser planner steps to J.A.R.V.I.S. desktop commands.
 * Returns transformed steps or original if no transformation needed
 */
export function transformStepsToIRIS(steps: any[]): { transformed: any[]; originalCount: number; transformedCount: number } {
  const transformed: any[] = [];
  let originalCount = steps.length;
  let transformedCount = 0;
  
  for (const step of steps) {
    // Transform open_url to desktop open_app.
    if (step.action === 'open_url' && step.url) {
      const iris = convertNavigationToIris(step.url);
      if (iris) {
        transformed.push(iris);
        transformedCount++;
        logger.info("IrisRouter", `Transformed open_url(${step.url}) -> J.A.R.V.I.S. desktop open_app`);
        continue;
      }
      // If no mapping found, keep the original step
      transformed.push(step);
      
    // Transform open_tab to desktop open_app.
    } else if (step.action === 'open_tab' && step.url) {
      const iris = convertNavigationToIris(step.url);
      if (iris) {
        transformed.push(iris);
        transformedCount++;
        logger.info("IrisRouter", `Transformed open_tab(${step.url}) -> J.A.R.V.I.S. desktop open_app`);
        continue;
      }
      // If no mapping found, keep the original step
      transformed.push(step);
      
    // Keep other actions as-is
    } else {
      transformed.push(step);
    }
  }
  
  logger.info("IrisRouter", `Step transformation complete: ${transformedCount}/${originalCount} converted to J.A.R.V.I.S. desktop control.`);
  return { transformed, originalCount, transformedCount };
}
