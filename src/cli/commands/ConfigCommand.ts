/**
 * Config Command - Configuration management CLI command
 * Handles configuration operations: get, set, list, reset, edit, export
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { ConfigManager, IConfigManager } from '@cli/config/ConfigManager';
import type { ProjectConfig } from '@cli/config/ConfigSchema';
import { ConfigValidator } from '@cli/config/ConfigValidator';
import { ErrorHandler } from '@cli/ErrorHandler';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import chalk from 'chalk';
import { Command } from 'commander';

type ConfigManagerLike = {
  get?: (key: string) => unknown;
  set?: (key: string, value: unknown) => void;
  save?: () => Promise<void>;
  reset?: () => Promise<void>;
  getConfig?: () => ProjectConfig;
  getAllKeys?: () => string[];
  export?: () => string;
};

type IConfigCommand = IBaseCommand & {
  getConfigManager: (isGlobal: boolean) => Promise<IConfigManager>;
  handleAction: (
    action: string,
    manager: ConfigManagerLike,
    key?: string,
    value?: string,
    options?: CommandOptions
  ) => Promise<void>;
  handleGet: (manager: ConfigManagerLike, key?: string, value?: string) => Promise<void>;
  handleSet: (
    manager: ConfigManagerLike,
    key?: string,
    value?: string,
    options?: CommandOptions
  ) => Promise<void>;
  handleList: (manager: ConfigManagerLike, options: CommandOptions) => Promise<void>;
  handleReset: (manager: ConfigManagerLike) => Promise<void>;
  handleEdit: (manager: ConfigManagerLike) => Promise<void>;
  handleExport: (manager: ConfigManagerLike) => void;
  parseConfigValue: (value?: string) => unknown;
  formatConfigValue: (value: unknown) => string;
  displayValidationStatus: (config: ProjectConfig) => void;
  displayConfigurationKeys: (keys: string[]) => void;
  displayConfigurationValues: (config: ProjectConfig) => void;
  editSingleConfig: (manager: ConfigManagerLike, selectedKey: string) => Promise<void>;
};

const addOptions = (command: Command): void => {
  command.argument('[action]', 'Action: get, set, list, reset, edit, export');
  command.argument('[key]', 'Configuration key (for get/set)');
  command.argument('[value]', 'Configuration value (for set)');
  command.option('--global', 'Use global config instead of project config');
  command.option('--json', 'Output as JSON');
  command.option('--show-defaults', 'Show default values in list');
};

const getGlobalConfigManager = async (): Promise<IConfigManager> => ConfigManager.getGlobalConfig();

const getProjectConfigManager = async (): Promise<IConfigManager> =>
  ConfigManager.getProjectConfig();

const formatConfigValue = (value: unknown): string => {
  if (value === undefined || value === null) return chalk.gray('null');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'boolean') return value ? chalk.green('true') : chalk.red('false');
  if (typeof value === 'number') return chalk.yellow(value.toString());
  return String(value);
};

const parseConfigValue = (value?: string): unknown => {
  if (value === undefined) return undefined;
  if (value === '') return '';

  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;

  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);

  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value) as unknown;
    } catch (error) {
      Logger.error('Failed to parse JSON config value', error);
      return value;
    }
  }

  return value;
};

const displayValidationStatus = (cmd: IBaseCommand, config: ProjectConfig): void => {
  const validation = ConfigValidator.validate(config);
  if (validation?.valid === true) {
    cmd.info(chalk.green('  ✅ Configuration is valid'));
    return;
  }

  const errors = validation?.errors ?? [];
  cmd.info(chalk.red(`  ❌ Configuration has ${errors.length} errors:`));
  for (const error of errors) {
    const message =
      error !== null && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    cmd.info(chalk.red(`     - ${message}`));
  }
};

const displayConfigurationKeys = (cmd: IBaseCommand, keys: string[]): void => {
  const sorted = keys.slice().sort((a, b) => a.localeCompare(b));
  cmd.info(chalk.cyan('\n  Available Keys:'));
  for (const key of sorted) {
    cmd.info(`  • ${key}`);
  }
};

const displayConfigurationValues = (cmd: IBaseCommand, config: ProjectConfig): void => {
  cmd.info('');
  const entries = Object.entries(config).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    cmd.info(`${chalk.cyan(key)}: ${formatConfigValue(value)}`);
  }
};

const handleGet = async (
  cmd: IBaseCommand,
  manager: ConfigManagerLike,
  key?: string
): Promise<void> => {
  if (key === undefined) {
    ErrorHandler.usageError('Configuration key is required for "get"');
    return;
  }

  if (typeof manager.get !== 'function') {
    cmd.warn('Configuration manager does not support "get"');
    return;
  }

  const value = manager.get(key);
  if (value === undefined) {
    cmd.warn(`Configuration key "${key}" not found`);
    return;
  }

  cmd.info(formatConfigValue(value));
};

const handleSet = async (
  cmd: IBaseCommand,
  manager: ConfigManagerLike,
  key?: string,
  value?: string
): Promise<void> => {
  if (key === undefined || value === undefined) {
    ErrorHandler.usageError('Both key and value are required for "set"');
    return;
  }

  if (typeof manager.set !== 'function') {
    cmd.warn('Configuration manager does not support "set"');
    return;
  }

  const parsedValue = parseConfigValue(value);
  const validationError = ConfigValidator.validateValue(key, parsedValue);
  if (validationError) {
    cmd.warn(`Validation error for "${key}": ${validationError.message}`);
    return;
  }

  manager.set(key, parsedValue);
  if (typeof manager.save === 'function') {
    await manager.save();
  }
  cmd.success(`Configuration updated: ${key} = ${value}`);
};

const handleList = async (
  cmd: IBaseCommand,
  manager: ConfigManagerLike,
  options: CommandOptions
): Promise<void> => {
  if (options['json'] === true && typeof manager.export === 'function') {
    cmd.info(manager.export());
    return;
  }

  const config =
    typeof manager.getConfig === 'function' ? manager.getConfig() : ({} as ProjectConfig);
  cmd.info(chalk.bold('\n🛠️  Current Configuration:\n'));
  displayValidationStatus(cmd, config);
  displayConfigurationKeys(cmd, Object.keys(config));
  displayConfigurationValues(cmd, config);

  if (options['showDefaults'] === true) {
    cmd.info(chalk.gray('\n(Default values shown above)'));
  }
};

const handleReset = async (cmd: IBaseCommand, manager: ConfigManagerLike): Promise<void> => {
  const confirmed = await PromptHelper.confirm(
    'Are you sure you want to reset configuration to defaults?',
    false
  );

  if (!confirmed) {
    cmd.info('Reset cancelled');
    return;
  }

  if (typeof manager.reset === 'function') {
    await manager.reset();
  }
  cmd.success('Configuration reset to defaults');
};

const editSingleConfig = async (
  cmd: IBaseCommand,
  manager: ConfigManagerLike,
  selectedKey: string
): Promise<void> => {
  const currentValue = typeof manager.get === 'function' ? manager.get(selectedKey) : undefined;
  let defaultValue = '';
  if (currentValue !== undefined) {
    defaultValue =
      typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue);
  }

  const newValue = await PromptHelper.textInput(
    `Enter new value for "${selectedKey}":`,
    defaultValue
  );
  if (newValue === undefined) return;

  const parsedValue = parseConfigValue(newValue);
  const validationError = ConfigValidator.validateValue(selectedKey, parsedValue);
  if (validationError) {
    cmd.warn(`Validation error: ${validationError.message}`);
    return;
  }

  if (typeof manager.set === 'function') {
    manager.set(selectedKey, parsedValue);
  }
  if (typeof manager.save === 'function') {
    await manager.save();
  }
  cmd.success(`Updated ${selectedKey}`);
};

const handleEdit = async (cmd: IBaseCommand, manager: ConfigManagerLike): Promise<void> => {
  cmd.info(chalk.bold('\n📝 Interactive Configuration Editor\n'));

  const config =
    typeof manager.getConfig === 'function' ? manager.getConfig() : ({} as ProjectConfig);
  const keys = Object.keys(config);
  const fallbackKeys = typeof manager.getAllKeys === 'function' ? manager.getAllKeys() : [];
  const availableKeys = keys.length > 0 ? keys : fallbackKeys;

  if (availableKeys.length === 0) {
    cmd.warn('No configuration keys found');
    return;
  }

  const menuKeys = [...availableKeys].sort((a, b) => a.localeCompare(b)).concat(['(Done)']);

  // Interactive prompt loop must be sequential.
  /* eslint-disable no-await-in-loop */
  while (true) {
    const selectedKey = await PromptHelper.chooseFrom(
      'Select configuration key to edit:',
      menuKeys
    );
    if (selectedKey === '' || selectedKey === '(Done)') break;
    await editSingleConfig(cmd, manager, selectedKey);
  }
  /* eslint-enable no-await-in-loop */

  cmd.success('Configuration editing complete');
};

const handleExport = (cmd: IBaseCommand, manager: ConfigManagerLike): void => {
  cmd.info(typeof manager.export === 'function' ? manager.export() : '{}');
};

const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

const getArg = (args: unknown, index: number): string | undefined => {
  if (!isUnknownArray(args)) return undefined;
  const value = args[index];
  return typeof value === 'string' ? value : undefined;
};

const executeConfig = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const typedCmd = cmd as IConfigCommand;
  const command = cmd.getCommand();
  const toRecord = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  };

  const commandOpts: Record<string, unknown> =
    typeof command.opts === 'function' ? toRecord(command.opts() as unknown) : {};

  const mergedOptions: CommandOptions = {
    ...commandOpts,
    ...options,
  };

  const action = getArg(options.args, 0) ?? getArg(command.args, 0) ?? 'list';
  const key = getArg(options.args, 1) ?? getArg(command.args, 1);
  const value = getArg(options.args, 2) ?? getArg(command.args, 2);

  const manager = await typedCmd.getConfigManager(mergedOptions['global'] === true);
  await typedCmd.handleAction(action, manager, key, value, mergedOptions);
};

/**
 * Config Command Factory
 */
export const ConfigCommand = Object.freeze({
  /**
   * Create a new config command instance
   */
  create(): IBaseCommand {
    const cmd = BaseCommand.create({
      name: 'config',
      description: 'Manage application configuration',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeConfig(cmd, options),
    }) as IConfigCommand;

    cmd.getConfigManager = async (isGlobal: boolean): Promise<IConfigManager> =>
      isGlobal ? getGlobalConfigManager() : getProjectConfigManager();

    cmd.handleGet = async (
      manager: ConfigManagerLike,
      key?: string,
      value?: string
    ): Promise<void> => handleGet(cmd, manager, key ?? value);

    cmd.handleSet = async (
      manager: ConfigManagerLike,
      key?: string,
      value?: string
    ): Promise<void> => handleSet(cmd, manager, key, value);

    cmd.handleList = async (manager: ConfigManagerLike, options: CommandOptions): Promise<void> =>
      handleList(cmd, manager, options);

    cmd.handleReset = async (manager: ConfigManagerLike): Promise<void> =>
      handleReset(cmd, manager);

    cmd.handleEdit = async (manager: ConfigManagerLike): Promise<void> => handleEdit(cmd, manager);

    cmd.handleExport = (manager: ConfigManagerLike): void => handleExport(cmd, manager);

    cmd.handleAction = async (
      action: string,
      manager: ConfigManagerLike,
      key?: string,
      value?: string,
      options?: CommandOptions
    ): Promise<void> => {
      switch (action.toLowerCase()) {
        case 'get':
          await cmd.handleGet(manager, key, value);
          return;
        case 'set':
          await cmd.handleSet(manager, key, value, options);
          return;
        case 'list':
          await cmd.handleList(manager, options ?? {});
          return;
        case 'reset':
          await cmd.handleReset(manager);
          return;
        case 'edit':
          await cmd.handleEdit(manager);
          return;
        case 'export':
          cmd.handleExport(manager);
          return;
        default:
          ErrorHandler.usageError(`Unknown action: ${action}`);
      }
    };

    cmd.parseConfigValue = (value?: string): unknown => parseConfigValue(value);
    cmd.formatConfigValue = (value: unknown): string => formatConfigValue(value);
    cmd.displayValidationStatus = (config: ProjectConfig): void =>
      displayValidationStatus(cmd, config);
    cmd.displayConfigurationKeys = (keys: string[]): void => displayConfigurationKeys(cmd, keys);
    cmd.displayConfigurationValues = (config: ProjectConfig): void =>
      displayConfigurationValues(cmd, config);
    cmd.editSingleConfig = async (manager: ConfigManagerLike, selectedKey: string): Promise<void> =>
      editSingleConfig(cmd, manager, selectedKey);

    return cmd;
  },
});
