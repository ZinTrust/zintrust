/**
 * Configuration Manager
 * Handles reading, writing, and managing configuration files
 */

import {
  ConfigPaths,
  DEFAULT_CONFIG,
  getConfigValue,
  ProjectConfig,
  setConfigValue,
} from '@cli/config/ConfigSchema';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface IConfigManager {
  load(): Promise<ProjectConfig>;
  save(config?: ProjectConfig): Promise<void>;
  getConfig(): ProjectConfig;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  exists(): Promise<boolean>;
  create(initialConfig?: Partial<ProjectConfig>): Promise<void>;
  reset(): Promise<void>;
  merge(partial: Partial<ProjectConfig>): void;
  export(): string;
  getAllKeys(): string[];
}

interface ConfigState {
  config: ProjectConfig | null;
  configPath: string;
}

/**
 * Deep merge helper
 */
const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  const result = { ...target };

  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (target[key] as Record<string, unknown>) ?? {},
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }

  return result;
};

/**
 * Load configuration from file
 */
async function loadConfig(state: ConfigState): Promise<ProjectConfig> {
  try {
    const content = await fs.readFile(state.configPath, 'utf-8');
    state.config = JSON.parse(content) as ProjectConfig;
    return state.config;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      Logger.debug(`Config file not found at ${state.configPath}, using defaults`);
      state.config = structuredClone(DEFAULT_CONFIG);
      return state.config;
    }
    ErrorFactory.createCliError(`Failed to load config: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Save configuration to file
 */
async function saveConfig(state: ConfigState, newConfig?: ProjectConfig): Promise<void> {
  const toSave = newConfig ?? state.config;
  if (!toSave) {
    throw ErrorFactory.createConfigError('No configuration to save');
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(state.configPath);
    if (dir !== '.') {
      await fs.mkdir(dir, { recursive: true });
    }

    // Write config with nice formatting
    await fs.writeFile(state.configPath, JSON.stringify(toSave, null, 2));
    state.config = toSave;
    Logger.debug(`Config saved to ${state.configPath}`);
  } catch (err) {
    ErrorFactory.createCliError(`Failed to save config: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Get current configuration
 */
function getConfig(state: ConfigState): ProjectConfig {
  state.config ??= structuredClone(DEFAULT_CONFIG);
  return state.config;
}

/**
 * Check if config file exists
 */
async function configExists(configPath: string): Promise<boolean> {
  try {
    await fs.access(configPath);
    return true;
  } catch (error) {
    ErrorFactory.createCliError('Config file access check failed', error);
    return false;
  }
}

/**
 * Flatten object keys
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Configuration Manager
 * Handles reading, writing, and managing configuration files
 * Sealed namespace for immutability
 */
export const ConfigManager = Object.freeze({
  /**
   * Create a new config manager instance
   */
  create(configPath: string = ConfigPaths.PROJECT_CONFIG): IConfigManager {
    const state: ConfigState = {
      config: null,
      configPath,
    };

    return {
      load: async () => loadConfig(state),
      save: async (newConfig?: ProjectConfig) => saveConfig(state, newConfig),
      getConfig: () => getConfig(state),
      get(key: string): unknown {
        return getConfigValue(getConfig(state) as Record<string, unknown>, key);
      },
      set(key: string, value: unknown): void {
        setConfigValue(getConfig(state) as Record<string, unknown>, key, value);
      },
      exists: async () => configExists(configPath),
      async create(initialConfig?: Partial<ProjectConfig>): Promise<void> {
        const newConfig = { ...DEFAULT_CONFIG, ...initialConfig };
        await saveConfig(state, newConfig as ProjectConfig);
      },
      async reset(): Promise<void> {
        state.config = structuredClone(DEFAULT_CONFIG);
        await saveConfig(state);
      },
      merge(partial: Partial<ProjectConfig>): void {
        const currentConfig = getConfig(state);
        state.config = deepMerge(
          currentConfig as Record<string, unknown>,
          partial as Record<string, unknown>
        ) as ProjectConfig;
      },
      export: () => JSON.stringify(getConfig(state), null, 2),
      getAllKeys: () => flattenKeys(getConfig(state) as Record<string, unknown>),
    };
  },

  /**
   * Create global config directory if not exists
   */
  async ensureGlobalConfigDir(): Promise<void> {
    try {
      await fs.mkdir(ConfigPaths.GLOBAL_DIR, { recursive: true });
    } catch (err) {
      ErrorFactory.createCliError('Could not create global config dir', err);
      Logger.debug(`Could not create global config dir: ${(err as Error).message}`);
    }
  },

  /**
   * Get or create global config manager
   */
  async getGlobalConfig(): Promise<IConfigManager> {
    await this.ensureGlobalConfigDir();
    const manager = this.create(ConfigPaths.GLOBAL_CONFIG);
    await manager.load();
    return manager;
  },

  /**
   * Get or create project config manager
   */
  async getProjectConfig(): Promise<IConfigManager> {
    const manager = this.create(ConfigPaths.PROJECT_CONFIG);
    await manager.load();
    return manager;
  },
});
