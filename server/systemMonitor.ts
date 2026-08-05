import si from 'systeminformation';
import { logger } from './logger';
import { executeOnIris } from './irisExecutor';

export interface SystemMetrics {
  cpu: {
    usage: number;
    load: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  };
  battery: {
    hasBattery: boolean;
    percent: number | null;
    charging: boolean | null;
  };
  processes: Array<{
    name: string;
    cpu: number;
    memory: number;
  }>;
  timestamp: string;
}

export interface AlertThresholds {
  cpu: number;
  ram: number;
  battery: number;
}

export interface SuspiciousProcessAlert {
  processName: string;
  cpu: number;
  memory: number;
  reason: string;
}

// Default thresholds - will be configurable via Electron app settings
const DEFAULT_THRESHOLDS: AlertThresholds = {
  cpu: 85, // Alert when CPU usage exceeds 85%
  ram: 90, // Alert when RAM usage exceeds 90%
  battery: 20, // Alert when battery drops below 20%
};

let currentThresholds: AlertThresholds = { ...DEFAULT_THRESHOLDS };
let knownApplications = new Set<string>();
let monitoringInterval: NodeJS.Timeout | null = null;
let isAdminAlerted = false;

/**
 * Fetches current system metrics using systeminformation package
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    const [cpuData, memData, batteryData, processListData, cpuInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.battery(),
      si.processLoad(''),
      si.cpu(),
    ]);

    const metrics: SystemMetrics = {
      cpu: {
        usage: Math.round(cpuData.currentLoad),
        load: [cpuData.avgLoad],
        cores: cpuInfo.physicalCores,
      },
      memory: {
        total: memData.total,
        used: memData.used,
        available: memData.available,
        usagePercent: Math.round((memData.used / memData.total) * 100),
      },
      battery: {
        hasBattery: batteryData.hasBattery,
        percent: batteryData.percent,
        charging: batteryData.isCharging,
      },
      processes: processListData.slice(0, 20).map(p => ({
        name: p.proc,
        cpu: p.cpu,
        memory: p.mem,
      })),
      timestamp: new Date().toISOString(),
    };

    return metrics;
  } catch (error: any) {
    logger.error('SystemMonitor', `Failed to fetch system metrics: ${error.message}`);
    throw error;
  }
}

/**
 * Updates known applications set for baseline
 */
export async function updateKnownApplications(): Promise<void> {
  try {
    const processes = await si.processes();
    const processList = await si.processLoad('');
    
    // Add all currently running processes to known set
    processList.forEach(p => {
      if (p.proc) {
        knownApplications.add(p.proc.toLowerCase());
      }
    });

    // Also check common Windows applications
    const commonApps = [
      'code', 'chrome', 'msedge', 'brave', 'firefox', 'notepad', 'explorer',
      'telegram', 'discord', 'spotify', 'vlc', 'obs64', 'steam', 'winword',
      'excel', 'powerpnt', 'mspaint', 'calc', 'taskmgr', 'powershell',
      'runtimebroker', 'dllhost', 'svchost', 'audiodg',
    ];
    
    commonApps.forEach(app => knownApplications.add(app));
    
    logger.info('SystemMonitor', `Updated known applications baseline: ${knownApplications.size} known processes`);
  } catch (error: any) {
    logger.error('SystemMonitor', `Failed to update known applications: ${error.message}`);
  }
}

/**
 * Detects suspicious/unknown processes
 */
export async function detectSuspiciousProcesses(
  metrics: SystemMetrics
): Promise<SuspiciousProcessAlert[]> {
  const alerts: SuspiciousProcessAlert[] = [];
  
  for (const proc of metrics.processes) {
    const procName = proc.name.toLowerCase();
    
    // Skip system processes and known applications
    if (procName.startsWith('system') || 
        procName.startsWith('smss') ||
        procName.startsWith('csrss') ||
        procName.includes('dllhost') ||
        procName.includes('svchost')) {
      continue;
    }
    
    // Check for suspicious resource usage patterns
    if (proc.cpu > 50 && !knownApplications.has(procName)) {
      alerts.push({
        processName: proc.name,
        cpu: proc.cpu,
        memory: proc.memory,
        reason: 'High CPU usage by unknown process',
      });
    }
    
    if (proc.memory > 1000 && !knownApplications.has(procName)) { // > 1GB memory
      alerts.push({
        processName: proc.name,
        cpu: proc.cpu,
        memory: proc.memory,
        reason: 'High memory usage by unknown process',
      });
    }
  }
  
  return alerts;
}

/**
 * Performs background research on suspicious processes
 */
async function researchProcess(processName: string): Promise<string> {
  try {
    const response = await fetch(`https://r.jina.ai/http://google.com/search?q=${encodeURIComponent(processName + ' malware virus scan process')}`);
    const summary = await response.text();
    return summary.substring(0, 2000);
  } catch (error: any) {
    logger.error('SystemMonitor', `Research failed for ${processName}: ${error.message}`);
    return `Could not research ${processName} at this time.`;
  }
}

/**
 * Sends alert to user via Telegram
 */
async function sendAlert(message: string): Promise<void> {
  // Get admin chat ID from environment
  const adminChatId = process.env.TELEGRAM_CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!adminChatId || !botToken) {
    logger.warn('SystemMonitor', 'No Telegram credentials configured for alerts');
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: `🚨 **J.A.R.V.I.S. SYSTEM ALERT** 🚨\n\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
    
    if (response.ok) {
      logger.info('SystemMonitor', 'Alert sent successfully to user');
      isAdminAlerted = true;
    }
  } catch (error: any) {
    logger.error('SystemMonitor', `Failed to send alert: ${error.message}`);
  }
}

/**
 * Checks metrics against thresholds and sends alerts if needed
 */
export async function checkAndAlert(metrics: SystemMetrics): Promise<void> {
  const alerts: string[] = [];
  
  // CPU Alert
  if (metrics.cpu.usage > currentThresholds.cpu) {
    alerts.push(`🔴 **CPU Alert**: Usage at ${metrics.cpu.usage}% (threshold: ${currentThresholds.cpu}%)`);
    logger.warn('SystemMonitor', `CPU usage critical: ${metrics.cpu.usage}%`);
  }
  
  // RAM Alert
  if (metrics.memory.usagePercent > currentThresholds.ram) {
    alerts.push(`🟠 **Memory Alert**: RAM usage at ${metrics.memory.usagePercent}% (threshold: ${currentThresholds.ram}%)`);
    logger.warn('SystemMonitor', `Memory usage critical: ${metrics.memory.usagePercent}%`);
  }
  
  // Battery Alert
  if (metrics.battery.hasBattery && metrics.battery.percent !== null && 
      metrics.battery.percent < currentThresholds.battery && !metrics.battery.charging) {
    alerts.push(`🟡 **Battery Alert**: Level at ${metrics.battery.percent}% (threshold: ${currentThresholds.battery}%, not charging)`);
    logger.warn('SystemMonitor', `Battery low: ${metrics.battery.percent}%`);
  }
  
  // Check for suspicious processes
  const suspicious = await detectSuspiciousProcesses(metrics);
  
  for (const susp of suspicious) {
    const research = await researchProcess(susp.processName);
    
    alerts.push(`⚠️ **Suspicious Process Detected**: \`${susp.processName}\`\n` +
                 `CPU: ${susp.cpu}%, Memory: ${susp.memory}MB\n` +
                 `Reason: ${susp.reason}\n\n` +
                 `🔍 *Research Summary*:\n${research}`);
  }
  
  // Send consolidated alert
  if (alerts.length > 0) {
    await sendAlert(alerts.join('\n\n---\n\n'));
  } else {
    isAdminAlerted = false;
  }
}

/**
 * Sets custom alert thresholds
 */
export function setThresholds(thresholds: Partial<AlertThresholds>): void {
  currentThresholds = { ...currentThresholds, ...thresholds };
  logger.info('SystemMonitor', `Thresholds updated: CPU=${currentThresholds.cpu}%, RAM=${currentThresholds.ram}%, Battery=${currentThresholds.battery}%`);
}

/**
 * Gets current thresholds
 */
export function getThresholds(): AlertThresholds {
  return { ...currentThresholds };
}

/**
 * Starts continuous monitoring
 */
export function startMonitoring(intervalMs: number = 10000): void {
  if (monitoringInterval) {
    logger.info('SystemMonitor', 'Monitoring already active, stopping previous interval');
    stopMonitoring();
  }
  
  // Initialize known applications on first run
  updateKnownApplications();
  
  monitoringInterval = setInterval(async () => {
    try {
      const metrics = await getSystemMetrics();
      await checkAndAlert(metrics);
    } catch (error: any) {
      logger.error('SystemMonitor', `Monitoring cycle error: ${error.message}`);
    }
  }, intervalMs);
  
  logger.info('SystemMonitor', `Started continuous monitoring every ${intervalMs}ms`);
}

/**
 * Stops monitoring
 */
export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('SystemMonitor', 'Monitoring stopped');
  }
}

/**
 * Gets current monitoring status
 */
export function getMonitoringStatus(): { active: boolean; thresholds: AlertThresholds } {
  return {
    active: monitoringInterval !== null,
    thresholds: getThresholds(),
  };
}