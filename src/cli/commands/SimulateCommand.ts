/**
 * Simulate Command
 * Internal dev tool that generates a simulated Zintrust app under ./simulate/
 * IMPORTANT: this uses the same ProjectScaffolder as `zin new`.
 * Usage: zin -sim my-blog
 */

import { IBaseCommand } from '@cli/BaseCommand';
import { ProjectScaffolder } from '@cli/scaffolding/ProjectScaffolder';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import chalk from 'chalk';
import { Command } from 'commander';

const ensureDistIsInstallablePackage = (distPath: string): void => {
  if (!fs.existsSync(distPath)) {
    throw ErrorFactory.createConfigError(`Missing dist output at: ${distPath}`);
  }

  const rootPackageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(rootPackageJsonPath)) {
    throw ErrorFactory.createConfigError(`Missing package.json at: ${rootPackageJsonPath}`);
  }

  const rootPkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {
    name?: unknown;
    version?: unknown;
    dependencies?: unknown;
  };

  const distPackageJsonPath = path.join(distPath, 'package.json');
  const distIndexJsPath = path.join(distPath, 'index.js');
  const distIndexDtsPath = path.join(distPath, 'index.d.ts');

  const distPackageJson = {
    name: String(rootPkg.name ?? 'zintrust'),
    version: String(rootPkg.version ?? '0.0.0'),
    private: true,
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        default: './index.js',
      },
    },
    dependencies:
      typeof rootPkg.dependencies === 'object' && rootPkg.dependencies !== null
        ? rootPkg.dependencies
        : {},
  };

  fs.writeFileSync(distPackageJsonPath, JSON.stringify(distPackageJson, null, 2) + '\n');
  fs.writeFileSync(distIndexJsPath, "export * from './src/index.js';\n");
  fs.writeFileSync(distIndexDtsPath, "export * from './src/index';\n");
};

const rewriteSimulatedAppDependencyToDist = (appPath: string, distPath: string): void => {
  const packageJsonPath = path.join(appPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw ErrorFactory.createCliError(`Missing simulated app package.json at: ${packageJsonPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  const dependencies: Record<string, string> = { ...(pkg.dependencies ?? {}) };
  dependencies['zintrust'] = `file:${distPath}`;

  const nextPkg = {
    ...pkg,
    dependencies,
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(nextPkg, null, 2) + '\n');
};

/**
 * SimulateCommand - Generate simulated apps for testing
 */
export const SimulateCommand = {
  name: 'simulate',
  description: '[INTERNAL] Generate simulated Zintrust app for testing new developer experience',

  getCommand(): Command {
    const command = new Command('simulate')
      .alias('-sim')
      .alias('--sim')
      .description('[INTERNAL DEV] Create a simulated Zintrust application in simulate/ folder')
      .argument('<name>', 'Name of the simulated app')
      .action(async (appName: string) => {
        try {
          const simulateBasePath = path.join(process.cwd(), 'simulate');

          if (!appName || appName.trim() === '') {
            throw ErrorFactory.createValidationError('App name is required');
          }

          // Delegate validation + file generation to the same scaffolder used by `zin new`.
          Logger.info(`Creating simulated app via ProjectScaffolder: ${chalk.cyan(appName)}`);

          const result = await ProjectScaffolder.scaffold(simulateBasePath, {
            name: appName,
            template: 'basic',
            database: 'sqlite',
            author: 'Internal',
            description: `Simulated Zintrust app - ${appName}`,
          });

          if (!result.success) {
            throw ErrorFactory.createCliError(result.message, result.error);
          }

          const appPath = path.join(simulateBasePath, appName);

          // For simulate apps only: install the locally-built framework from dist/
          // so the dev experience matches "fresh install" of the current build output.
          const distPath = path.join(process.cwd(), 'dist');
          ensureDistIsInstallablePackage(distPath);
          rewriteSimulatedAppDependencyToDist(appPath, distPath);

          Logger.info('✅ Simulated app created successfully!');
          Logger.info(`📁 Location: ${chalk.cyan(appPath)}`);
          Logger.info(`\n${chalk.bold('Next steps:')}`);
          Logger.info(`  cd ${path.relative(process.cwd(), appPath)}`);
          Logger.info('  npm install');
          Logger.info('  npm run dev');
        } catch (error) {
          Logger.error('Failed to create simulated app', error);
          process.exit(1);
        }
      });

    return command;
  },
} as IBaseCommand;
