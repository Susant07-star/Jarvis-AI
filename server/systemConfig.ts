import { supabase } from './supabaseClient';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

export interface SystemConfig {
  thresholds: {
    cpu: number;
    ram: number;
    battery: number;
  };
  monitoring: {
    enabled: boolean;
    interval: number;
  };
  knownApplications: string[];
  createdAt: string;
  updatedAt: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'data', 'system-config.json');
const DEFAULT_CONFIG: SystemConfig = {
  thresholds: {
    cpu: 85,
    ram: 90,
    battery: 20,
  },
  monitoring: {
    enabled: true,
    interval: 10000,
  },
  knownApplications: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let cachedConfig: SystemConfig | null = null;

/**
 * Load configuration from Supabase or fallback to local file
 */
export async function loadSystemConfig(): Promise<SystemConfig> {
  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (!error && data) {
        cachedConfig = data as SystemConfig;
        logger.info('SystemConfig', 'Loaded config from Supabase');
        return cachedConfig;
      }
    } catch (error: any) {
      logger.warn('SystemConfig', `Failed to load from Supabase: ${error.message}`);
    }
  }
  
  // Fallback to local file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      cachedConfig = JSON.parse(content);
      logger.info('SystemConfig', 'Loaded config from local file');
      return cachedConfig!;
    }
  } catch (error: any) {
    logger.warn('SystemConfig', `Failed to load local config: ${error.message}`);
  }
  
  // Return defaults
  cachedConfig = { ...DEFAULT_CONFIG };
  await saveSystemConfig(cachedConfig);
  return cachedConfig;
}

/**
 * Save configuration to Supabase and local file
 */
export async function saveSystemConfig(config: SystemConfig): Promise<void> {
  config.updatedAt = new Date().toISOString();
  cachedConfig = config;
  
  // Save to Supabase
  if (supabase) {
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({ ...config, id: 1 });
      
      if (!error) {
        logger.info('SystemConfig', 'Config saved to Supabase');
      } else {
        logger.error('SystemConfig', `Failed to save to Supabase: ${error.message}`);
      }
    } catch (error: any) {
      logger.error('SystemConfig', `Supabase save error: ${error.message}`);
    }
  }
  
  // Save to local file as backup
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    logger.info('SystemConfig', 'Config saved to local file');
  } catch (error: any) {
    logger.error('SystemConfig', `Failed to save local config: ${error.message}`);
  }
}

/**
 * Update thresholds
 */
export async function updateThresholds(thresholds: Partial<SystemConfig['thresholds']>): Promise<SystemConfig> {
  const config = cachedConfig || await loadSystemConfig();
  config.thresholds = { ...config.thresholds, ...thresholds };
  await saveSystemConfig(config);
  return config;
}

/**
 * Update known applications
 */
export async function updateKnownApplications(apps: string[]): Promise<SystemConfig> {
  const config = cachedConfig || await loadSystemConfig();
  config.knownApplications = apps;
  await saveSystemConfig(config);
  return config;
}

/**
 * Reset known applications (clear baseline)
 */
export async function resetKnownApplications(): Promise<SystemConfig> {
  const config = cachedConfig || await loadSystemConfig();
  config.knownApplications = [];
  await saveSystemConfig(config);
  return config;
}

/**
 * Get current config (from cache or load)
 */
export async function getSystemConfig(): Promise<SystemConfig> {
  if (!cachedConfig) {
    cachedConfig = await loadSystemConfig();
  }
  return cachedConfig;
}