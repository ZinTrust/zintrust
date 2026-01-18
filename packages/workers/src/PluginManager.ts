/**
 * Plugin Manager
 * Extensible plugin system with lifecycle hooks
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger } from '@zintrust/core';

export type PluginHook =
  | 'beforeStart'
  | 'afterStart'
  | 'beforeProcess'
  | 'afterProcess'
  | 'beforeStop'
  | 'afterStop'
  | 'onError'
  | 'onComplete'
  | 'onRetry'
  | 'onCircuitOpen'
  | 'onCircuitClose'
  | 'onScaleUp'
  | 'onScaleDown';

export type HookContext = {
  workerName: string;
  jobId?: string;
  version?: string;
  jobData?: unknown;
  error?: Error;
  metadata?: Record<string, unknown>;
  timestamp: Date;
};

export type HookResult = {
  modified?: boolean;
  jobData?: unknown;
  stop?: boolean;
  error?: Error;
};

export type PluginMetadata = {
  name: string;
  version: string;
  author?: string;
  description?: string;
  dependencies?: string[]; // Other plugin names this plugin depends on
};

export type Plugin = {
  metadata: PluginMetadata;
  hooks: Partial<Record<PluginHook, PluginHookHandler>>;
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
};

export type PluginHookHandler = (
  context: HookContext
) => HookResult | Promise<HookResult> | undefined | Promise<HookResult | undefined>;

export type RegisteredPlugin = {
  plugin: Plugin;
  enabled: boolean;
  registeredAt: Date;
  priority: number; // Lower number = higher priority (executes first)
};

export type HookExecutionResult = {
  data: unknown;
  hook: PluginHook;
  executionTime: number;
  pluginsExecuted: number;
  errors: Array<{ pluginName: string; error: Error }>;
  context: HookContext;
  modified: boolean;
  stopped: boolean;
};

// Internal state
const plugins = new Map<string, RegisteredPlugin>();
const hookExecutionHistory: HookExecutionResult[] = [];
const MAX_HISTORY = 1000;

/**
 * Helper: Validate plugin metadata
 */
const validatePlugin = (plugin: Plugin): void => {
  if (!plugin.metadata.name) {
    throw ErrorFactory.createWorkerError('Plugin name is required');
  }

  if (!plugin.metadata.version) {
    throw ErrorFactory.createWorkerError('Plugin version is required');
  }

  if (Object.keys(plugin.hooks).length === 0) {
    throw ErrorFactory.createWorkerError('Plugin must implement at least one hook');
  }
};

/**
 * Helper: Check plugin dependencies
 */
const checkDependencies = (plugin: Plugin): { satisfied: boolean; missing: string[] } => {
  if (!plugin.metadata.dependencies || plugin.metadata.dependencies.length === 0) {
    return { satisfied: true, missing: [] };
  }

  const missing: string[] = [];

  for (const depName of plugin.metadata.dependencies) {
    const dep = plugins.get(depName);
    if (dep?.enabled !== true) {
      missing.push(depName);
    }
  }

  return {
    satisfied: missing.length === 0,
    missing,
  };
};

/**
 * Helper: Get enabled plugins for a hook, sorted by priority
 */
const getEnabledPluginsForHook = (hook: PluginHook): RegisteredPlugin[] => {
  const enabledPlugins: RegisteredPlugin[] = [];

  for (const registered of plugins.values()) {
    if (registered.enabled && registered.plugin.hooks[hook]) {
      enabledPlugins.push(registered);
    }
  }

  // Sort by priority (lower number = higher priority)
  return enabledPlugins.sort((a, b) => a.priority - b.priority);
};

/**
 * Helper: Store execution result
 */
const storeExecutionResult = (result: HookExecutionResult): void => {
  hookExecutionHistory.push(result);

  // Keep only last MAX_HISTORY results
  if (hookExecutionHistory.length > MAX_HISTORY) {
    hookExecutionHistory.shift();
  }
};

/**
 * Plugin Manager - Sealed namespace
 */
export const PluginManager = Object.freeze({
  /**
   * Register a plugin
   */
  async register(plugin: Plugin, priority = 100): Promise<void> {
    validatePlugin(plugin);

    const { name } = plugin.metadata;

    if (plugins.has(name)) {
      throw ErrorFactory.createWorkerError(`Plugin "${name}" is already registered`);
    }

    // Check dependencies
    const depCheck = checkDependencies(plugin);
    if (!depCheck.satisfied) {
      throw ErrorFactory.createWorkerError(
        `Plugin "${name}" has unsatisfied dependencies: ${depCheck.missing.join(', ')}`
      );
    }

    const registered: RegisteredPlugin = {
      plugin,
      enabled: true,
      registeredAt: new Date(),
      priority,
    };

    plugins.set(name, registered);

    // Call onEnable if provided
    if (plugin.onEnable) {
      try {
        await plugin.onEnable();
      } catch (error) {
        Logger.error(`Plugin "${name}" onEnable failed`, error);
        plugins.delete(name);
        throw error;
      }
    }

    Logger.info(`Plugin registered: ${name}@${plugin.metadata.version}`, {
      hooks: Object.keys(plugin.hooks),
      priority,
    });
  },

  /**
   * Unregister a plugin
   */
  async unregister(pluginName: string): Promise<void> {
    const registered = plugins.get(pluginName);

    if (!registered) {
      throw ErrorFactory.createNotFoundError(`Plugin "${pluginName}" not found`);
    }

    // Check if other plugins depend on this one
    const dependents: string[] = [];
    for (const [name, reg] of plugins.entries()) {
      if (name !== pluginName && reg.enabled) {
        const deps = reg.plugin.metadata.dependencies ?? [];
        if (deps.includes(pluginName)) {
          dependents.push(name);
        }
      }
    }

    if (dependents.length > 0) {
      throw ErrorFactory.createWorkerError(
        `Cannot unregister plugin "${pluginName}": required by ${dependents.join(', ')}`
      );
    }

    // Call onDisable if provided
    if (registered.plugin.onDisable) {
      try {
        await registered.plugin.onDisable();
      } catch (error) {
        Logger.error(`Plugin "${pluginName}" onDisable failed`, error);
      }
    }

    plugins.delete(pluginName);

    Logger.info(`Plugin unregistered: ${pluginName}`);
  },

  /**
   * Enable a plugin
   */
  async enable(pluginName: string): Promise<void> {
    const registered = plugins.get(pluginName);

    if (!registered) {
      throw ErrorFactory.createNotFoundError(`Plugin "${pluginName}" not found`);
    }

    if (registered.enabled) {
      Logger.warn(`Plugin "${pluginName}" is already enabled`);
      return;
    }

    // Check dependencies
    const depCheck = checkDependencies(registered.plugin);
    if (!depCheck.satisfied) {
      throw ErrorFactory.createWorkerError(
        `Cannot enable plugin "${pluginName}": unsatisfied dependencies: ${depCheck.missing.join(', ')}`
      );
    }

    registered.enabled = true;

    // Call onEnable if provided
    if (registered.plugin.onEnable) {
      try {
        await registered.plugin.onEnable();
      } catch (error) {
        Logger.error(`Plugin "${pluginName}" onEnable failed`, error);
        registered.enabled = false;
        throw error;
      }
    }

    Logger.info(`Plugin enabled: ${pluginName}`);
  },

  /**
   * Disable a plugin
   */
  async disable(pluginName: string): Promise<void> {
    const registered = plugins.get(pluginName);

    if (!registered) {
      throw ErrorFactory.createNotFoundError(`Plugin "${pluginName}" not found`);
    }

    if (!registered.enabled) {
      Logger.warn(`Plugin "${pluginName}" is already disabled`);
      return;
    }

    // Check if other enabled plugins depend on this one
    const dependents: string[] = [];
    for (const [name, reg] of plugins.entries()) {
      if (name !== pluginName && reg.enabled) {
        const deps = reg.plugin.metadata.dependencies ?? [];
        if (deps.includes(pluginName)) {
          dependents.push(name);
        }
      }
    }

    if (dependents.length > 0) {
      throw ErrorFactory.createWorkerError(
        `Cannot disable plugin "${pluginName}": required by enabled plugins: ${dependents.join(', ')}`
      );
    }

    registered.enabled = false;

    // Call onDisable if provided
    if (registered.plugin.onDisable) {
      try {
        await registered.plugin.onDisable();
      } catch (error) {
        Logger.error(`Plugin "${pluginName}" onDisable failed`, error);
      }
    }

    Logger.info(`Plugin disabled: ${pluginName}`);
  },

  /**
   * Execute hooks for a lifecycle event
   */
  async executeHook(hook: PluginHook, context: HookContext): Promise<HookExecutionResult> {
    const startTime = Date.now();
    const enabledPlugins = getEnabledPluginsForHook(hook);

    const result: HookExecutionResult = {
      data: context.jobData,
      hook,
      executionTime: 0,
      pluginsExecuted: 0,
      errors: [],
      context,
      modified: false,
      stopped: false,
    };

    const currentContext = { ...context };

    let stopped = false;

    const executeHandler = async (registered: RegisteredPlugin): Promise<void> => {
      if (stopped) return;

      const { plugin } = registered;
      const handler = plugin.hooks[hook];
      if (!handler) return;

      try {
        const hookResult = await handler(currentContext);
        result.pluginsExecuted++;

        if (hookResult !== undefined) {
          if (hookResult.modified === true) {
            result.modified = true;
          }

          if (hookResult.jobData !== undefined) {
            currentContext.jobData = hookResult.jobData;
            result.data = hookResult.jobData;
          }

          if (hookResult.stop === true) {
            result.stopped = true;
            stopped = true;
            Logger.warn(`Hook execution stopped by plugin: ${plugin.metadata.name}`, { hook });
          }

          if (hookResult.error instanceof Error) {
            result.errors.push({
              pluginName: plugin.metadata.name,
              error: hookResult.error,
            });
          }
        }
      } catch (error) {
        Logger.error(`Plugin "${plugin.metadata.name}" hook "${hook}" failed`, error);
        result.errors.push({
          pluginName: plugin.metadata.name,
          error: error as Error,
        });

        if (hook === 'beforeStart' || hook === 'beforeStop') {
          result.stopped = true;
          stopped = true;
        }
      }
    };

    let chain = Promise.resolve();
    for (const registered of enabledPlugins) {
      chain = chain.then(async () => executeHandler(registered));
    }

    await chain;

    result.executionTime = Date.now() - startTime;
    storeExecutionResult(result);

    Logger.debug(`Hook executed: ${hook}`, {
      pluginsExecuted: result.pluginsExecuted,
      executionTime: result.executionTime,
      errors: result.errors.length,
    });

    return result;
  },

  /**
   * Get registered plugins
   */
  getPlugins(): ReadonlyArray<RegisteredPlugin & { name: string }> {
    return Array.from(plugins.entries()).map(([name, registered]) => ({
      name,
      ...registered,
    }));
  },

  /**
   * Get plugin by name
   */
  getPlugin(pluginName: string): (RegisteredPlugin & { name: string }) | null {
    const registered = plugins.get(pluginName);
    if (!registered) return null;

    return {
      name: pluginName,
      ...registered,
    };
  },

  /**
   * Check if plugin is registered
   */
  isRegistered(pluginName: string): boolean {
    return plugins.has(pluginName);
  },

  /**
   * Check if plugin is enabled
   */
  isEnabled(pluginName: string): boolean {
    const registered = plugins.get(pluginName);
    return registered ? registered.enabled : false;
  },

  /**
   * Get hook execution history
   */
  getExecutionHistory(hook?: PluginHook, limit = 100): ReadonlyArray<HookExecutionResult> {
    let history = hookExecutionHistory;

    if (hook) {
      history = history.filter((result) => result.hook === hook);
    }

    return history.slice(-limit).map((result) => ({ ...result }));
  },

  /**
   * Get plugin statistics
   */
  getStatistics(): {
    totalPlugins: number;
    enabledPlugins: number;
    disabledPlugins: number;
    totalHookExecutions: number;
    hookExecutionsByType: Record<PluginHook, number>;
    averageExecutionTime: number;
    totalErrors: number;
  } {
    const stats = {
      totalPlugins: plugins.size,
      enabledPlugins: 0,
      disabledPlugins: 0,
      totalHookExecutions: hookExecutionHistory.length,
      hookExecutionsByType: {} as Record<PluginHook, number>,
      averageExecutionTime: 0,
      totalErrors: 0,
    };

    for (const registered of plugins.values()) {
      if (registered.enabled) {
        stats.enabledPlugins++;
      } else {
        stats.disabledPlugins++;
      }
    }

    let totalExecutionTime = 0;

    for (const result of hookExecutionHistory) {
      const hookType = result.hook;
      stats.hookExecutionsByType[hookType] = (stats.hookExecutionsByType[hookType] || 0) + 1;
      totalExecutionTime += result.executionTime;
      stats.totalErrors += result.errors.length;
    }

    if (hookExecutionHistory.length > 0) {
      stats.averageExecutionTime = totalExecutionTime / hookExecutionHistory.length;
    }

    return stats;
  },

  /**
   * Clear execution history
   */
  clearHistory(): void {
    hookExecutionHistory.length = 0;
    Logger.info('Plugin execution history cleared');
  },

  /**
   * Shutdown and disable all plugins
   */
  async shutdown(): Promise<void> {
    Logger.info('PluginManager shutting down...');

    // Disable all plugins in reverse order of priority
    const sortedPlugins = Array.from(plugins.entries()).sort(
      ([, a], [, b]) => b.priority - a.priority
    );

    const disableTasks = sortedPlugins.map(async ([name, registered]) => {
      if (!registered.enabled || !registered.plugin.onDisable) return;
      try {
        await registered.plugin.onDisable();
        Logger.debug(`Plugin disabled: ${name}`);
      } catch (error) {
        Logger.error(`Plugin "${name}" onDisable failed during shutdown`, error);
      }
    });

    await Promise.allSettled(disableTasks);

    plugins.clear();
    hookExecutionHistory.length = 0;

    Logger.info('PluginManager shutdown complete');
  },
});

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  await PluginManager.shutdown();
});

process.on('SIGINT', async () => {
  await PluginManager.shutdown();
});
