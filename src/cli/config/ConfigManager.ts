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
import fs from 'node:fs/promises';
import path from 'node:path';

export class ConfigManager {
  private config: ProjectConfig | null = null;
  private readonly configPath: string;

  constructor(configPath: string = ConfigPaths.PROJECT_CONFIG, _isGlobal = false) {
    this.configPath = configPath;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<ProjectConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content) as ProjectConfig;
      return this.config;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        Logger.debug(`Config file not found at ${this.configPath}, using defaults`);
        this.config = structuredClone(DEFAULT_CONFIG);
        return this.config;
      }
      Logger.error(`Failed to load config: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Save configuration to file
   */
  async save(config?: ProjectConfig): Promise<void> {
    const toSave = config || this.config;
    if (!toSave) {
      throw new Error('No configuration to save');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (dir !== '.') {
        await fs.mkdir(dir, { recursive: true });
      }

      // Write config with nice formatting
      await fs.writeFile(this.configPath, JSON.stringify(toSave, null, 2));
      this.config = toSave;
      Logger.debug(`Config saved to ${this.configPath}`);
    } catch (err) {
      Logger.error(`Failed to save config: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ProjectConfig {
    this.config ??= structuredClone(DEFAULT_CONFIG);
    return this.config;
  }

  /**
   * Get a specific config value
   */
  get(key: string): unknown {
    const config = this.getConfig();
    return getConfigValue(config as Record<string, unknown>, key);
  }

  /**
   * Set a specific config value
   */
  set(key: string, value: unknown): void {
    const config = this.getConfig();
    setConfigValue(config as Record<string, unknown>, key, value);
  }

  /**
   * Check if config file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create default config file
   */
  async create(initialConfig?: Partial<ProjectConfig>): Promise<void> {
    const config = {
      ...DEFAULT_CONFIG,
      ...initialConfig,
    };
    await this.save(config as ProjectConfig);
  }

  /**
   * Reset to default configuration
   */
  async reset(): Promise<void> {
    this.config = structuredClone(DEFAULT_CONFIG);
    await this.save();
  }

  /**
   * Merge configuration
   */
  merge(partial: Partial<ProjectConfig>): void {
    const config = this.getConfig();
    this.config = this.deepMerge(config, partial as Record<string, unknown>) as ProjectConfig;
  }

  /**
   * Deep merge helper
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key in source) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(
          (target[key] as Record<string, unknown>) ?? {},
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Export configuration as JSON string
   */
  export(): string {
    return JSON.stringify(this.getConfig(), null, 2);
  }

  /**
   * Get all keys in config (flat list)
   */
  getAllKeys(): string[] {
    const config = this.getConfig();
    const keys: string[] = [];

    const flatten = (obj: Record<string, unknown>, prefix = ''): void => {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flatten(value as Record<string, unknown>, fullKey);
        } else {
          keys.push(fullKey);
        }
      }
    };

    flatten(config as Record<string, unknown>);
    return keys;
  }

  /**
   * Create global config directory if not exists
   */
  static async ensureGlobalConfigDir(): Promise<void> {
    try {
      await fs.mkdir(ConfigPaths.GLOBAL_DIR, { recursive: true });
    } catch (err) {
      Logger.debug(`Could not create global config dir: ${(err as Error).message}`);
    }
  }

  /**
   * Get or create global config manager
   */
  static async getGlobalConfig(): Promise<ConfigManager> {
    await ConfigManager.ensureGlobalConfigDir();
    const manager = new ConfigManager(ConfigPaths.GLOBAL_CONFIG, true);
    await manager.load();
    return manager;
  }

  /**
   * Get or create project config manager
   */
  static async getProjectConfig(): Promise<ConfigManager> {
    const manager = new ConfigManager(ConfigPaths.PROJECT_CONFIG, false);
    await manager.load();
    return manager;
  }
}
