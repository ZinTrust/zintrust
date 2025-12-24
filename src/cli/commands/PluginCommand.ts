/**
 * Plugin Command
 * Manage framework plugins (install, uninstall, list)
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { PluginManager } from '@runtime/PluginManager';
import { Command } from 'commander';

export const PluginCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'plugin',
      description: 'Manage framework plugins',
      addOptions: (command: Command) => {
        command.alias('p');

        // Options for short syntax (zin p -i a:sqlite)
        command.option('-i, --install <pluginId>', 'Install a plugin');
        command.option('-u, --uninstall <pluginId>', 'Uninstall a plugin');
        command.option('-l, --list', 'List available plugins');

        command
          .command('list')
          .alias('ls')
          .description('List available plugins')
          .action(async () => {
            await listPlugins();
          });

        command
          .command('install <pluginId>')
          .alias('i')
          .description('Install a plugin')
          .action(async (pluginId: string) => {
            await installPlugin(pluginId);
          });

        command
          .command('uninstall <pluginId>')
          .alias('un')
          .description('Uninstall a plugin')
          .action(async (pluginId: string) => {
            await uninstallPlugin(pluginId);
          });
      },
      execute: async (options: CommandOptions) => {
        const installId = options['install'];
        const uninstallId = options['uninstall'];
        const shouldList = options['list'];

        if (typeof installId === 'string' && installId.length > 0) {
          await installPlugin(installId);
        } else if (typeof uninstallId === 'string' && uninstallId.length > 0) {
          await uninstallPlugin(uninstallId);
        } else if (shouldList === true) {
          await listPlugins();
        } else {
          Logger.info('Use "plugin list", "plugin install <id>", or "plugin uninstall <id>"');
          Logger.info('Shortcuts: "zin p -l", "zin p -i <id>", "zin p -u <id>"');
        }
      },
    });
  },
});

async function listPlugins() {
  const plugins = PluginManager.list();
  Logger.info('Available Plugins:');

  for (const [id, plugin] of Object.entries(plugins)) {
    const isInstalled = await PluginManager.isInstalled(id);
    const status = isInstalled ? '✓ Installed' : '- Available';
    const aliases = plugin.aliases ? `(aliases: ${plugin.aliases.join(', ')})` : '';
    Logger.info(`  ${id.padEnd(20)} ${status.padEnd(15)} ${plugin.description} ${aliases}`);
  }
}

async function installPlugin(pluginId: string) {
  try {
    await PluginManager.install(pluginId);
  } catch (error) {
    Logger.error(`Failed to install plugin ${pluginId}`, error);
    process.exit(1);
  }
}

async function uninstallPlugin(pluginId: string) {
  try {
    await PluginManager.uninstall(pluginId);
  } catch (error) {
    Logger.error(`Failed to uninstall plugin ${pluginId}`, error);
    process.exit(1);
  }
}
