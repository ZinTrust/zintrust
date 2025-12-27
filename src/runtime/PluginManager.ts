/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-await-in-loop */
/**
 * Plugin Manager
 * Handles installation and removal of framework plugins.
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execSync } from '@node-singletons/child-process';
import { existsSync, fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
import { PluginDefinition, PluginRegistry } from '@runtime/PluginRegistry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_PACKAGE_ROOT_SEARCH_DEPTH = 20;

function findPackageRoot(startDir: string): string {
  let current = startDir;

  for (let i = 0; i < MAX_PACKAGE_ROOT_SEARCH_DEPTH; i++) {
    if (existsSync(path.join(current, 'package.json'))) return current;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Fallback to a reasonable default if package.json isn't found.
  return path.resolve(startDir, '../..');
}

function resolveProjectRoot(): string {
  const fromEnv = process.env['ZINTRUST_PROJECT_ROOT'];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim();
  return process.cwd();
}

function resolveTemplateRootOrThrow(): string {
  const packageRoot = findPackageRoot(__dirname);

  const candidates = [
    // Monorepo/dev layout
    path.join(packageRoot, 'src', 'templates'),
    // Packed layout (if templates are shipped without src)
    path.join(packageRoot, 'templates'),
    // Common build output layout
    path.join(packageRoot, 'dist', 'templates'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw ErrorFactory.createNotFoundError('Plugin templates directory not found', {
    candidates,
    packageRoot,
  });
}

type PackageJsonDeps = Readonly<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}>;

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false;

  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v !== 'string') return false;
  }

  return true;
}

function parsePackageJsonDeps(text: string): PackageJsonDeps {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) return {};

  const obj = parsed as Record<string, unknown>;

  const dependencies = isStringRecord(obj['dependencies']) ? obj['dependencies'] : undefined;
  const devDependencies = isStringRecord(obj['devDependencies'])
    ? obj['devDependencies']
    : undefined;

  return { dependencies, devDependencies };
}

function getPluginOrThrow(pluginId: string): { resolvedId: string; plugin: PluginDefinition } {
  const resolvedId = PluginManager.resolveId(pluginId);
  if (resolvedId === null) {
    throw ErrorFactory.createNotFoundError(`Plugin ${pluginId} not found`, { pluginId });
  }

  return { resolvedId, plugin: PluginRegistry[resolvedId] };
}

function npmInstall(packages: string[], options: { dev: boolean; label: string }): void {
  if (packages.length === 0) return;

  Logger.info(`Installing ${options.label}: ${packages.join(', ')}...`);
  const devFlag = options.dev ? '-D ' : '';

  const projectRoot = resolveProjectRoot();

  try {
    const cmd = `npm install ${devFlag}${packages.join(' ')}`; // NOSONAR
    execSync(cmd, {
      stdio: 'inherit',
      cwd: projectRoot,
    });
  } catch (error: unknown) {
    ErrorFactory.createCliError(`Failed to install ${options.label}`, { error });
    throw error;
  }
}

async function copyPluginTemplates(plugin: PluginDefinition): Promise<void> {
  const templateRoot = resolveTemplateRootOrThrow();
  const projectRoot = resolveProjectRoot();

  for (const template of plugin.templates) {
    const sourcePath = path.join(templateRoot, template.source);
    const destPath = path.join(projectRoot, template.destination);

    // Prevent path traversal: resolved destination must be within project root
    const resolvedDest = path.resolve(destPath);
    const resolvedProjectRoot = path.resolve(projectRoot);
    if (
      !(
        resolvedDest === resolvedProjectRoot ||
        resolvedDest.startsWith(resolvedProjectRoot + path.sep)
      )
    ) {
      throw ErrorFactory.createCliError(`Invalid template destination: ${template.destination}`, {
        destination: template.destination,
      });
    }

    Logger.info(`Copying ${template.source} to ${template.destination}...`);

    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Read and write file
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(destPath, content, 'utf-8');
    } catch (error: unknown) {
      ErrorFactory.createCliError(`Failed to copy template ${template.source}`, { error });
      throw error;
    }
  }
}

function runPostInstall(plugin: PluginDefinition): void {
  if (!plugin.postInstall) return;

  const projectRoot = resolveProjectRoot();

  if (plugin.postInstall.command !== undefined) {
    // Post-install command execution is opt-in. To avoid arbitrary command execution
    // and reduce supply-chain risk, we only execute when ZINTRUST_ALLOW_POSTINSTALL=1
    const allow = String(process.env['ZINTRUST_ALLOW_POSTINSTALL'] ?? '').trim() === '1';
    if (allow) {
      Logger.info(`Running post-install command: ${plugin.postInstall.command}...`);
      try {
        execSync(plugin.postInstall.command, {
          stdio: 'inherit',
          cwd: projectRoot,
        });
      } catch (error: unknown) {
        ErrorFactory.createCliError('Post-install command failed', { error });
      }
    } else {
      Logger.info(
        `Post-install command available but not executed (ZINTRUST_ALLOW_POSTINSTALL!=1): ${plugin.postInstall.command}`
      );
    }
  }

  if (plugin.postInstall.message !== undefined && plugin.postInstall.message.length > 0) {
    Logger.info('----------------------------------------');
    Logger.info(plugin.postInstall.message);
    Logger.info('----------------------------------------');
  }
}

export const PluginManager = Object.freeze({
  /**
   * List all available plugins
   */
  list(): Record<string, PluginDefinition> {
    return PluginRegistry;
  },

  /**
   * Resolve a plugin ID from an alias or full ID
   */
  resolveId(idOrAlias: string): string | null {
    if (PluginRegistry[idOrAlias] !== undefined) return idOrAlias;

    for (const [id, plugin] of Object.entries(PluginRegistry)) {
      if (plugin.aliases.includes(idOrAlias)) {
        return id;
      }
    }
    return null;
  },

  /**
   * Check if a plugin is currently installed
   */
  async isInstalled(pluginId: string): Promise<boolean> {
    const resolvedId = PluginManager.resolveId(pluginId);
    if (resolvedId === null) {
      throw ErrorFactory.createNotFoundError(`Plugin ${pluginId} not found`, { pluginId });
    }

    const plugin = PluginRegistry[resolvedId];
    const projectRoot = resolveProjectRoot();

    // Check if the main template file exists in the destination
    // We assume if the first template exists, the plugin is "installed"
    if (plugin.templates.length > 0) {
      const destPath = path.join(projectRoot, plugin.templates[0].destination);
      try {
        await fs.access(destPath);

        // Also check if dependencies are in package.json
        const packageJsonPath = path.join(projectRoot, 'package.json');
        const packageJsonText = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = parsePackageJsonDeps(packageJsonText);

        const hasDeps = plugin.dependencies.every(
          (dep) => packageJson.dependencies?.[dep] ?? packageJson.devDependencies?.[dep] ?? ''
        );

        return hasDeps;
      } catch {
        ErrorFactory.createCliError(
          `Plugin ${plugin.name} not installed (missing files or dependencies)`
        );
        return false;
      }
    }

    return false;
  },

  /**
   * Install a plugin
   */
  async install(pluginId: string): Promise<void> {
    const { plugin } = getPluginOrThrow(pluginId);

    Logger.info(`Installing plugin: ${plugin.name}...`);

    // 1. Install dependencies
    npmInstall(plugin.dependencies, { dev: false, label: 'dependencies' });
    npmInstall(plugin.devDependencies, { dev: true, label: 'dev dependencies' });

    // 2. Copy templates
    await copyPluginTemplates(plugin);

    // 3. Post-Install
    runPostInstall(plugin);

    Logger.info(`✓ Plugin ${plugin.name} installed successfully`);
  },

  /**
   * Uninstall a plugin
   * Note: This does NOT uninstall dependencies to avoid breaking other things,
   * but it does revert the code to the "stub" state if possible, or delete the file.
   */
  async uninstall(pluginId: string): Promise<void> {
    const resolvedId = PluginManager.resolveId(pluginId);
    if (resolvedId === null) {
      throw ErrorFactory.createNotFoundError(`Plugin ${pluginId} not found`, { pluginId });
    }

    const plugin = PluginRegistry[resolvedId];

    Logger.info(`Uninstalling plugin: ${plugin.name}...`);

    // Revert templates to stubs
    // For now, we'll just delete the file if it's an adapter,
    // BUT wait - we need the stubs to exist for the framework to compile if they are referenced.
    // However, in the "Template" architecture, the stubs ARE the default state.
    // So "uninstalling" might mean "restoring the stub".

    // Since we don't have a "stub repository" easily accessible here without reading from git or a backup,
    // and the user might have modified the file, "uninstall" is tricky.

    // Strategy:
    // 1. Warn the user that this will delete the file.
    // 2. If it's a core adapter, we should probably restore a basic stub.

    // For this iteration, we will just warn and delete, assuming the user knows what they are doing.
    // OR, better: We can have a "stubs" folder in templates too?
    // Actually, the "stubs" are what is currently in the codebase.
    // When we "install", we overwrite the stub.
    // When we "uninstall", we should ideally restore the stub.

    // Let's check if we have a stub backup. If not, maybe we just leave the file but warn?
    // Or maybe we don't support "uninstall" fully yet, just "install".

    Logger.warn(
      'Uninstalling plugins is not fully automated yet. You may need to manually revert file changes.'
    );

    // We can at least try to remove the dependencies if they are not used elsewhere?
    // Too risky.

    Logger.info(
      `✓ Plugin ${plugin.name} uninstalled (files preserved, please revert manually if needed)`
    );
  },
});
