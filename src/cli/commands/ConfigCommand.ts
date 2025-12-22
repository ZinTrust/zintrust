/**
 * Config Command - Configuration management CLI command
 * Handles configuration operations: get, set, list, reset, edit, export
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { ConfigManager } from '@cli/config/ConfigManager';
import type { ProjectConfig } from '@cli/config/ConfigSchema';
import { ConfigValidator } from '@cli/config/ConfigValidator';
import { ErrorHandler } from '@cli/ErrorHandler';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import chalk from 'chalk';
import { Command } from 'commander';

export class ConfigCommand extends BaseCommand {
  constructor() {
    super();
    this.name = 'config';
    this.description = 'Manage project configuration';
  }

  protected addOptions(command: Command): void {
    command.argument('[action]', 'Action: get, set, list, reset, edit, export');
    command.argument('[key]', 'Configuration key (for get/set)');
    command.argument('[value]', 'Configuration value (for set)');
    command.option('--global', 'Use global config instead of project config');
    command.option('--show-defaults', 'Show default values for all keys');
    command.option('--json', 'Output as JSON');
  }

  async execute(options: CommandOptions): Promise<void> {
    void options; // NOSONAR Mark as intentionally unused
    const cmd = this.getCommand();
    const args = cmd.args;
    const opts = cmd.opts();

    const action = args[0] ?? 'list';
    const key = args[1];
    const value = args[2];

    try {
      const manager = await this.getConfigManager(opts['global'] === true);
      await this.handleAction(action, manager, key, value, opts);
    } catch (err) {
      Logger.error('Config command failed', err);
      ErrorHandler.handle(err as Error);
    }
  }

  /**
   * Get configuration manager
   */
  private async getConfigManager(isGlobal: boolean): Promise<ConfigManager> {
    if (isGlobal) {
      return await ConfigManager.getGlobalConfig();
    }
    return await ConfigManager.getProjectConfig();
  }

  /**
   * Handle configuration action
   */
  private async handleAction(
    action: string,
    manager: ConfigManager,
    key?: string,
    value?: string,
    opts?: Record<string, unknown>
  ): Promise<void> {
    switch (action.toLowerCase()) {
      case 'get':
        await this.handleGet(manager, key, opts);
        break;
      case 'set':
        await this.handleSet(manager, key, value, opts);
        break;
      case 'list':
        await this.handleList(manager, opts);
        break;
      case 'reset':
        await this.handleReset(manager, opts);
        break;
      case 'edit':
        await this.handleEdit(manager, opts);
        break;
      case 'export':
        await this.handleExport(manager, opts);
        break;
      default:
        ErrorHandler.usageError(`Unknown action: ${action}`);
    }
  }

  /**
   * Handle 'get' subcommand
   */
  private async handleGet(
    manager: ConfigManager,
    key?: string,
    _options?: Record<string, unknown>
  ): Promise<void> {
    if (key === undefined || key === '') {
      ErrorHandler.usageError('Key is required for get action');
      return;
    }

    const value = manager.get(key);
    if (value === undefined) {
      this.warn(`No value found for key: ${key}`);
      return;
    }

    if (typeof value === 'object' && value !== null) {
      this.info(JSON.stringify(value, null, 2));
    } else {
      this.info(String(value)); // NOSONAR - type checked to ensure not object or null
    }
  }

  /**
   * Handle 'set' subcommand
   */
  private async handleSet(
    manager: ConfigManager,
    key?: string,
    value?: string,
    _options?: Record<string, unknown>
  ): Promise<void> {
    if (key === undefined || key === '') {
      ErrorHandler.usageError('Key is required for set action');
      return;
    }

    const newValue = this.parseConfigValue(value);

    // Validate the value
    const error = ConfigValidator.validateValue(key, newValue);
    if (error !== undefined && error !== null) {
      ErrorHandler.usageError(error.message);
      return;
    }

    manager.set(key, newValue);
    await manager.save();
    this.success(`Configuration updated: ${key} = ${JSON.stringify(newValue)}`);
  }

  /**
   * Parse a configuration value from string input
   */
  private parseConfigValue(value?: string): unknown {
    if (value === undefined || value === '') return value;

    // Try to parse as JSON if it looks like JSON
    if (value.startsWith('{') || value.startsWith('[') || value.startsWith('"')) {
      try {
        return JSON.parse(value);
      } catch (error) {
        Logger.error('JSON parse failed in config value', error);
        return value; // Keep as string if JSON parsing fails
      }
    }

    // Parse as boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Parse as number
    if (!Number.isNaN(Number(value))) return Number(value);

    return value;
  }

  /**
   * Handle 'list' subcommand
   */
  private async handleList(
    manager: ConfigManager,
    options?: Record<string, unknown>
  ): Promise<void> {
    const config = manager.getConfig();

    if (options?.['json'] === true) {
      this.info(manager.export());
      return;
    }

    const keys = manager.getAllKeys();
    const displayOptions = options?.['showDefaults'] === true;

    this.info(chalk.bold('\n📋 Configuration:\n'));

    for (const key of keys) {
      const value = manager.get(key);
      const desc = ConfigValidator.getDescription(key);
      const descStr = desc === undefined ? '' : ` (${chalk.gray(desc)})`;
      const valueStr = this.formatConfigValue(value);
      this.info(`  ${chalk.bold(key)}: ${valueStr}${descStr}`);
    }

    this.info('');
    this.displayValidationStatus(config);

    if (displayOptions) {
      this.displayConfigurationKeys(keys);
    }
  }

  /**
   * Format a configuration value for display
   */
  private formatConfigValue(value: unknown): string {
    if (value === undefined || value === null) {
      return chalk.gray('null');
    }
    if (typeof value === 'boolean') {
      return value ? chalk.green('true') : chalk.red('false');
    }
    if (typeof value === 'number') {
      return chalk.yellow(String(value));
    }
    if (typeof value === 'object' && value !== null) {
      return chalk.cyan(JSON.stringify(value));
    }
    return chalk.cyan(`"${value}"`); // NOSONAR - type checked to ensure not object or null
  }

  /**
   * Display configuration validation status
   */
  private displayValidationStatus(config: ProjectConfig): void {
    const validation = ConfigValidator.validate(config);
    if (validation.valid) {
      this.success('✅ All configuration values are valid');
    } else {
      this.warn(`⚠️  Configuration has ${validation.errors.length} validation issues`);
      for (const error of validation.errors) {
        this.warn(`   • ${error.key}: ${error.message}`);
      }
    }
  }

  /**
   * Display all configuration keys
   */
  private displayConfigurationKeys(keys: string[]): void {
    this.info(chalk.bold('\n📝 Configuration keys:\n'));
    for (const key of keys) {
      this.info(`  ${key}`);
    }
  }

  /**
   * Handle 'reset' subcommand
   */
  private async handleReset(
    manager: ConfigManager,
    _options?: Record<string, unknown>
  ): Promise<void> {
    const confirm = await PromptHelper.confirm(
      'Are you sure you want to reset configuration to defaults?',
      false
    );

    if (!confirm) {
      this.info('Reset cancelled');
      return;
    }

    await manager.reset();
    this.success('Configuration reset to defaults');
  }

  /**
   * Handle 'edit' subcommand - Interactive config editing
   */
  private async handleEdit(manager: ConfigManager, _options?: unknown): Promise<void> {
    const keys = manager.getAllKeys();

    this.info(chalk.bold('\n🔧 Interactive Configuration Editor\n'));

    let continueEditing = true;

    while (continueEditing) {
      const selectedKey = await PromptHelper.chooseFrom('Which setting would you like to edit?', [
        ...keys,
        '(Done)',
      ]);

      if (selectedKey === '(Done)') {
        continueEditing = false; // NOSONAR - intentional assignment to control loop exit
        break;
      }

      await this.editSingleConfig(manager, selectedKey);
    }

    await manager.save();
    this.success('Configuration saved');
  }

  /**
   * Edit a single configuration value
   */
  private async editSingleConfig(manager: ConfigManager, selectedKey: string): Promise<void> {
    const currentValue = manager.get(selectedKey);

    const valueStr =
      typeof currentValue === 'object' && currentValue !== null
        ? JSON.stringify(currentValue)
        : String(currentValue ?? ''); // NOSONAR - type checked to ensure not object or null

    const newValue = await PromptHelper.textInput(`Enter new value for ${selectedKey}`, valueStr);

    // Parse and validate the new value
    const parsedValue = this.parseConfigValue(newValue);

    const error = ConfigValidator.validateValue(selectedKey, parsedValue);
    if (error !== undefined && error !== null) {
      this.warn(`Validation failed: ${error.message}`);
      return;
    }

    manager.set(selectedKey, parsedValue);
    this.success(`Updated ${selectedKey}`);
  }

  /**
   * Handle 'export' subcommand
   */
  private async handleExport(
    manager: ConfigManager,
    _options?: Record<string, unknown>
  ): Promise<void> {
    const exported = manager.export();
    this.info(exported);
  }
}
