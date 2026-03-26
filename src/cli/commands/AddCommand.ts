/**
 * Add Command - Phase 4 Integration
 * Add services and features to existing ZinTrust project
 */

import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import type { ControllerType } from '@cli/scaffolding/ControllerGenerator';
import { ControllerGenerator } from '@cli/scaffolding/ControllerGenerator';
import { FactoryGenerator } from '@cli/scaffolding/FactoryGenerator';
import type { FeatureType } from '@cli/scaffolding/FeatureScaffolder';
import { FeatureScaffolder } from '@cli/scaffolding/FeatureScaffolder';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { GovernanceScaffolder } from '@cli/scaffolding/GovernanceScaffolder';
import type { MigrationType } from '@cli/scaffolding/MigrationGenerator';
import { MigrationGenerator } from '@cli/scaffolding/MigrationGenerator';
import { ModelGenerator } from '@cli/scaffolding/ModelGenerator';
import { RequestFactoryGenerator } from '@cli/scaffolding/RequestFactoryGenerator';
import type {
  ResponseFactoryGeneratorResult,
  ResponseField,
} from '@cli/scaffolding/ResponseFactoryGenerator';
import { ResponseFactoryGenerator } from '@cli/scaffolding/ResponseFactoryGenerator';
import { RouteGenerator } from '@cli/scaffolding/RouteGenerator';
import { SeederGenerator } from '@cli/scaffolding/SeederGenerator';
import { ServiceScaffolder } from '@cli/scaffolding/ServiceScaffolder';
import { WorkflowGenerator } from '@cli/scaffolding/WorkflowGenerator';
import { CommonUtils } from '@common/index';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { PluginManager } from '@runtime/PluginManager';
import type { Command } from 'commander';
import inquirer from 'inquirer';

type PlatformDeploy = 'lambda' | 'fargate' | 'cloudflare' | 'deno' | 'all';

interface AddOptions extends CommandOptions {
  type?: string;
  packageManager?: string;
  database?: 'shared' | 'isolated';
  auth?: 'api-key' | 'jwt' | 'none' | 'custom';
  port?: string;
  domain?: string;
  service?: string;
  withTest?: boolean;
  controllerType?: string;
  softDelete?: boolean;
  timestamps?: boolean;
  resource?: boolean;
  model?: string;
  relationships?: string;
  count?: string;
  states?: boolean;
  truncate?: boolean;
  noInteractive?: boolean;
  platform?: string;
  branch?: string;
  nodeVersion?: string;
}

interface ServicePromptAnswers {
  name: string;
  domain: string;
  port: number;
  database: 'shared' | 'isolated';
  auth: 'api-key' | 'jwt' | 'none' | 'custom';
}

interface FeaturePromptAnswers {
  name: string;
  servicePath: string;
  withTest: boolean;
}

interface MigrationPromptAnswers {
  name: string;
  type: string;
}

interface ModelPromptAnswers {
  name: string;
  softDelete: boolean;
  timestamps: boolean;
}

interface ControllerPromptAnswers {
  name: string;
  type: string;
}

interface RoutesPromptAnswers {
  name: string;
}

interface MiddlewarePromptAnswers {
  name: string;
}

interface FactoryPromptAnswers {
  name: string;
  model: string;
  addRelationships: boolean;
  relationships?: string;
}

interface SeederPromptAnswers {
  name: string;
  model: string;
  count: string;
  states: boolean;
  relationships: boolean;
  truncate: boolean;
}

interface RequestFactoryPromptAnswers {
  factoryName: string;
  requestName: string;
  endpoint: string;
  method: string;
  withDTO: boolean;
}

interface ResponseFactoryPromptAnswers {
  factoryName: string;
  responseName: string;
  responseType: string;
  factoryPath?: string;
  responsePath?: string;
  withDTO: boolean;
}

const isAsciiLowercaseLetter = (value: string): boolean => value >= 'a' && value <= 'z';

const isAsciiUppercaseLetter = (value: string): boolean => value >= 'A' && value <= 'Z';

const isAsciiDigit = (value: string): boolean => value >= '0' && value <= '9';

const isAsciiLetter = (value: string): boolean =>
  isAsciiLowercaseLetter(value) || isAsciiUppercaseLetter(value);

const isLowercaseLettersOnly = (value: string): boolean => {
  if (value.length === 0) return false;
  for (const char of value) {
    if (!isAsciiLowercaseLetter(char)) return false;
  }
  return true;
};

const isSnakeCaseName = (value: string): boolean => {
  if (value.length === 0) return false;
  for (const char of value) {
    if (isAsciiLowercaseLetter(char) || char === '_') continue;
    return false;
  }
  return true;
};

const isPascalCaseBase = (value: string): boolean => {
  if (value.length === 0) return false;
  if (!isAsciiUppercaseLetter(value[0] ?? '')) return false;

  for (let index = 1; index < value.length; index += 1) {
    const char = value[index] ?? '';
    if (isAsciiLetter(char) || isAsciiDigit(char)) continue;
    return false;
  }

  return true;
};

const hasPascalCaseSuffix = (value: string, suffix: string): boolean => {
  if (!value.endsWith(suffix)) return false;
  const base = value.slice(0, -suffix.length);
  return isPascalCaseBase(base);
};

const toSafeSnakeCase = (value: string): string => {
  const snake = CommonUtils.toSnakeCase(value);
  let output = '';
  let previousWasUnderscore = false;

  for (const char of snake) {
    const isAllowed = isAsciiLowercaseLetter(char) || isAsciiDigit(char) || char === '_';
    const nextChar = isAllowed ? char : '_';

    if (nextChar === '_') {
      if (previousWasUnderscore) continue;
      previousWasUnderscore = true;
      output += '_';
      continue;
    }

    previousWasUnderscore = false;
    output += nextChar;
  }

  let start = 0;
  while (start < output.length && output[start] === '_') start += 1;

  let end = output.length;
  while (end > start && output[end - 1] === '_') end -= 1;

  return output.slice(start, end);
};

const stripSuffix = (value: string, suffix: string): string =>
  value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;

const skipInlineWhitespace = (value: string, startIndex: number): number => {
  let nextIndex = startIndex;
  while (nextIndex < value.length) {
    const nextChar = value[nextIndex];
    if (nextChar === ' ' || nextChar === '\t' || nextChar === '\r') {
      nextIndex += 1;
      continue;
    }
    break;
  }
  return nextIndex;
};

const findMatchingObjectBrace = (value: string, startIndex: number): number | undefined => {
  let depth = 0;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char !== '}') continue;

    depth -= 1;
    if (depth === 0) return index;
  }

  return undefined;
};

const findRouteBlockBounds = (
  configSource: string
): { blockStart: number; innerStart: number; innerEnd: number; blockEnd: number } | undefined => {
  const routeLabel = 'route:';
  const routeIndex = configSource.indexOf(routeLabel);
  if (routeIndex === -1) return undefined;

  const braceStart = configSource.indexOf('{', routeIndex + routeLabel.length);
  if (braceStart === -1) return undefined;

  const braceEnd = findMatchingObjectBrace(configSource, braceStart);
  if (braceEnd === undefined) return undefined;

  const nextIndex = skipInlineWhitespace(configSource, braceEnd + 1);
  if (configSource[nextIndex] !== ',') return undefined;

  return {
    blockStart: routeIndex,
    innerStart: braceStart + 1,
    innerEnd: braceEnd,
    blockEnd: nextIndex + 1,
  };
};

const hasTrailingMiddlewaresTypeCast = (configSource: string): boolean => {
  const trimmed = configSource.trimEnd();
  return trimmed.endsWith('} as MiddlewaresType;');
};

const addOptions = (command: Command): void => {
  command
    .argument(
      '<type>',
      'What to add: service, feature, migration, model, controller, routes, middleware, factory, seeder, requestfactory, responsefactory, workflow, or governance'
    )
    .argument(
      '[name]',
      'Name of service/feature/migration/model/controller/middleware/factory/seeder/requestfactory/responsefactory/workflow (governance takes no name)'
    )
    .option(
      '--package-manager <pm>',
      'Specify package manager to use when installing plugins (npm|yarn|pnpm)'
    )
    .option('--domain <name>', 'Service domain (e.g., ecommerce, payments) - for services')
    .option('--database <type>', 'Database (shared|isolated) - for services')
    .option('--auth <strategy>', 'Auth strategy (api-key|jwt|none|custom) - for services')
    .option('--port <number>', 'Service port - for services')
    .option('--service <path>', 'Service path (relative to project root) - for features')
    .option('--with-test', 'Generate test files - for features')
    .option(
      '--controller-type <type>',
      'Controller type: crud, resource, api, graphql, websocket - for controllers'
    )
    .option('--soft-delete', 'Add soft delete to model')
    .option('--timestamps', 'Add timestamps to model (default: true)')
    .option('--resource', 'Generate resource routes')
    .option('--model <name>', 'Model name for factory or seeder')
    .option('--relationships <models>', 'Comma-separated related models for factory or seeder')
    .option('--count <number>', 'Record count for seeder (1-100,000)')
    .option('--states', 'Seed with state distribution (active/inactive/deleted)')
    .option('--truncate', 'Truncate table before seeding')
    .option('--platform <type>', 'Deployment platform: lambda, fargate, cloudflare, deno, all')
    .option('--branch <name>', 'Deployment branch (default: master)')
    .option('--node-version <version>', 'Node.js version (default: 20.x)')
    .option('--no-interactive', 'Skip interactive prompts');
};

const promptServiceConfig = async (defaultName: string): Promise<ServicePromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Service name (lowercase, no spaces):',
      default: defaultName,
      validate: (v: string): string | boolean =>
        isLowercaseLettersOnly(v) || 'Must be lowercase letters only',
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Domain (e.g., ecommerce, payments):',
      default: 'default',
    },
    {
      type: 'number',
      name: 'port',
      message: 'Service port:',
      default: 3001,
    },
    {
      type: 'list',
      name: 'database',
      message: 'Database isolation:',
      choices: ['shared', 'isolated'],
      default: 'shared',
    },
    {
      type: 'list',
      name: 'auth',
      message: 'Authentication strategy:',
      choices: ['api-key', 'jwt', 'none', 'custom'],
      default: 'api-key',
    },
  ]);
};

const addService = async (
  cmd: IBaseCommand,
  serviceName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = serviceName ?? '';

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptServiceConfig(name);
    name = answers.name;
    Object.assign(opts, answers);
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Service name is required');
  }

  cmd.info(`Creating service: ${name}...`);

  const result = await ServiceScaffolder.scaffold(projectRoot, {
    name,
    domain: opts.domain ?? 'default',
    port: opts.port === undefined ? 3001 : Number.parseInt(opts.port, 10),
    database: opts.database ?? 'shared',
    auth: opts.auth ?? 'api-key',
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success(`Service '${name}' created successfully!`);
  cmd.info(`\nFiles created: ${result.filesCreated.length}`);
  cmd.info(`Location: ${result.servicePath}`);
  cmd.info(
    `\nNext steps:\n  • Update service.config.json\n  • Add environment variables\n  • Create routes and controllers`
  );
};

const promptFeatureConfig = async (): Promise<FeaturePromptAnswers> => {
  const availableFeatures = FeatureScaffolder.getAvailableFeatures();
  return inquirer.prompt([
    {
      type: 'list',
      name: 'name',
      message: 'Select feature to add:',
      choices: availableFeatures,
    },
    {
      type: 'input',
      name: 'servicePath',
      message: 'Service path (relative to project):',
      default: 'src/services/default/users',
    },
    {
      type: 'confirm',
      name: 'withTest',
      message: 'Generate test file?',
      default: true,
    },
  ]);
};

const addFeature = async (
  cmd: IBaseCommand,
  featureName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = featureName ?? '';
  let servicePath: string = opts.service ?? '';

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptFeatureConfig();
    name = answers.name;
    servicePath = answers.servicePath;
    opts.withTest = answers.withTest;
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Feature name is required');
  }

  if (servicePath === '') throw ErrorFactory.createValidationError('Service path is required');

  const fullServicePath = path.join(projectRoot, servicePath);
  cmd.info(`Adding feature: ${name}...`);

  const result = FeatureScaffolder.addFeature({
    name: name as FeatureType,
    servicePath: fullServicePath,
    withTest: opts.withTest,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success(`Feature '${name}' added successfully!`);
  cmd.info(`Files created: ${result.filesCreated?.length || 0}`);
  cmd.info(
    `\nNext steps:\n  • Integrate feature in service\n  • Update routes if needed\n  • Add to configuration`
  );
};

const promptMigrationConfig = async (): Promise<MigrationPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Migration name (snake_case, e.g., create_users_table):',
      validate: (v: string): string | boolean => isSnakeCaseName(v) || 'Must be snake_case',
    },
    {
      type: 'list',
      name: 'type',
      message: 'Migration type:',
      choices: ['create', 'alter', 'drop'],
    },
  ]);
};

const pluralize = (snake: string): string => (snake.endsWith('s') ? snake : `${snake}s`);

const findMigrationBySuffix = (migrationsPath: string, suffix: string): string | undefined => {
  const files = FileGenerator.listFiles(migrationsPath, false);
  for (const file of files) {
    if (path.basename(file).endsWith(suffix)) return file;
  }
  return undefined;
};

const buildCreateTableMigrationName = (model: string): string => {
  const modelSnake = toSafeSnakeCase(model);
  const tablePlural = pluralize(modelSnake);
  return `create_${tablePlural}_table`;
};

const buildAddColumnMigrationName = (column: string, model: string): string => {
  const colSnake = toSafeSnakeCase(column);
  const modelSnake = toSafeSnakeCase(model);
  const tablePlural = pluralize(modelSnake);
  return `add_${colSnake}_${tablePlural}_table`;
};

const addMigration = async (
  cmd: IBaseCommand,
  migrationArgs: string[],
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = migrationArgs[0] ?? '';
  let table: string | undefined;
  let column: string | undefined;

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptMigrationConfig();
    name = answers.name;
    opts.type = answers.type;
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Migration name is required');
  }

  const migrationsPath = path.join(projectRoot, 'database', 'migrations');

  // New shorthand semantics:
  // `zin add migration <column> <model>` => add_<column>_<models>_table
  if (migrationArgs.length >= 2) {
    const columnArg = migrationArgs[0] ?? '';
    const modelArg = migrationArgs[1] ?? '';
    if (columnArg === '' || modelArg === '') {
      throw ErrorFactory.createValidationError('Usage: zin add migration <column> <model>');
    }

    const createName = buildCreateTableMigrationName(modelArg);
    const createSuffix = `_${createName}.ts`;
    const existingCreate = findMigrationBySuffix(migrationsPath, createSuffix);
    if (existingCreate === undefined) {
      throw ErrorFactory.createCliError(
        `Missing required create migration for model '${modelArg}'. Create it first: zin create migration ${modelArg}`
      );
    }

    name = buildAddColumnMigrationName(columnArg, modelArg);

    table = pluralize(toSafeSnakeCase(modelArg));
    // Store the normalized column name for generator placeholder.
    column = toSafeSnakeCase(columnArg);
  }

  cmd.info(`Creating migration: ${name}...`);

  const result = await MigrationGenerator.generateMigration({
    name,
    migrationsPath,
    type: (opts.type as MigrationType | undefined) ?? undefined,
    table,
    column,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success('Migration created successfully!');
  cmd.info(`File: ${path.basename(result.filePath)}`);
  cmd.info(
    `\nNext steps:\n  • Edit migration file\n  • Add up() and down() implementations\n  • Run migrations`
  );
};

const promptModelConfig = async (): Promise<ModelPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Model name (PascalCase, e.g., User, Post):',
      validate: (v: string): string | boolean => isPascalCaseBase(v) || 'Must be PascalCase',
    },
    {
      type: 'confirm',
      name: 'softDelete',
      message: 'Add soft delete?',
      default: false,
    },
    {
      type: 'confirm',
      name: 'timestamps',
      message: 'Add timestamps (created_at, updated_at)?',
      default: true,
    },
  ]);
};

const addModel = async (
  cmd: IBaseCommand,
  modelName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = modelName ?? '';

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptModelConfig();
    name = answers.name;
    opts.softDelete = answers.softDelete;
    opts.timestamps = answers.timestamps;
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Model name is required');
  }

  const modelPath = path.join(projectRoot, 'app', 'Models');
  cmd.info(`Creating model: ${name}...`);

  const result = await ModelGenerator.generateModel({
    name,
    modelPath,
    softDelete: opts.softDelete === true,
    timestamps: opts.timestamps !== false,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success(`Model '${name}' created successfully!`);
  cmd.info(`File: ${path.basename(result.modelFile)}`);
  cmd.info(
    `\nNext steps:\n  • Add fillable attributes\n  • Define relationships\n  • Create migration for table`
  );
};

const promptControllerConfig = async (): Promise<ControllerPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Controller name (PascalCase, e.g., UserController):',
      validate: (v: string): string | boolean =>
        hasPascalCaseSuffix(v, 'Controller') || 'Must be PascalCase ending with "Controller"',
    },
    {
      type: 'list',
      name: 'type',
      message: 'Controller type:',
      choices: ['crud', 'resource', 'api', 'graphql', 'websocket'],
      default: 'crud',
    },
  ]);
};

const addController = async (
  cmd: IBaseCommand,
  controllerName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = controllerName ?? '';
  let controllerType: string = opts.controllerType ?? '';

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptControllerConfig();
    name = answers.name;
    controllerType = answers.type;
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Controller name is required');
  }

  const controllerPath = path.join(projectRoot, 'app', 'Controllers');
  cmd.info(`Creating controller: ${name}...`);

  const result = await ControllerGenerator.generateController({
    name,
    controllerPath,
    type: (controllerType === ''
      ? (opts.controllerType ?? 'crud')
      : controllerType) as ControllerType,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success(`Controller '${name}' created successfully!`);
  cmd.info(`File: ${path.basename(result.controllerFile)}`);
  cmd.info(
    `\nNext steps:\n  • Implement action methods\n  • Add validation logic\n  • Register routes for this controller`
  );
};

const promptRoutesConfig = async (): Promise<RoutesPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Route group name (e.g., api, admin, public):',
      default: 'api',
    },
  ]);
};

const addRoutes = async (
  cmd: IBaseCommand,
  routeName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = routeName ?? '';

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptRoutesConfig();
    name = answers.name;
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Route group name is required');
  }

  const routesPath = path.join(projectRoot, 'routes');
  cmd.info(`Creating routes: ${name}...`);

  const result = await RouteGenerator.generateRoutes({
    groupName: name,
    routesPath,
    routes: [],
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success(`Routes file '${name}' created successfully!`);
  cmd.info(`File: ${path.basename(result.routeFile)}`);
  cmd.info(
    `\nNext steps:\n  • Add route definitions\n  • Import controllers\n  • Register in main router`
  );
};

const promptMiddlewareConfig = async (): Promise<MiddlewarePromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Middleware name (PascalCase, e.g., AuthMiddleware):',
      validate: (value: string): string | boolean => {
        return hasPascalCaseSuffix(value, 'Middleware')
          ? true
          : 'Must be PascalCase ending with "Middleware"';
      },
    },
  ]);
};

const buildMiddlewareKey = (middlewareName: string): string => {
  const withoutSuffix = stripSuffix(middlewareName, 'Middleware');
  return `${CommonUtils.camelCase(withoutSuffix)}Middleware`;
};

const buildMiddlewareSource = (middlewareName: string): string => {
  return `import type { Middleware } from '@zintrust/core';

export const ${middlewareName}: Middleware = async (_req, _res, next) => {
  await next();
};
`;
};

const registerMiddlewareImport = (configSource: string, middlewareName: string): string => {
  const importLine = `import { ${middlewareName} } from '@app/Middleware/${middlewareName}';`;
  if (configSource.includes(importLine)) return configSource;

  const lines = configSource.split('\n');
  let insertAt = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.startsWith('import ')) insertAt = index;
  }

  if (insertAt === -1) {
    return `${importLine}\n${configSource}`;
  }

  lines.splice(insertAt + 1, 0, importLine);
  return lines.join('\n');
};

const registerMiddlewareRouteKey = (
  configSource: string,
  middlewareName: string,
  middlewareKey: string
): { content: string; updated: boolean } => {
  if (configSource.includes(`${middlewareKey}: ${middlewareName}`)) {
    return { content: configSource, updated: true };
  }

  const routeBlock = findRouteBlockBounds(configSource);
  if (routeBlock !== undefined) {
    const currentInner = configSource.slice(routeBlock.innerStart, routeBlock.innerEnd);
    const middlewareEntry = `\n    ${middlewareKey}: ${middlewareName},`;
    const routeInner =
      currentInner.trim() === '' ? middlewareEntry : `${currentInner.trimEnd()}${middlewareEntry}`;
    return {
      content:
        configSource.slice(0, routeBlock.blockStart) +
        `route: {${routeInner}\n  },` +
        configSource.slice(routeBlock.blockEnd),
      updated: true,
    };
  }

  if (!hasTrailingMiddlewaresTypeCast(configSource)) {
    return { content: configSource, updated: false };
  }

  const trimmed = configSource.trimEnd();
  const middlewareBlock = `\n  global: [],\n  route: {\n    ${middlewareKey}: ${middlewareName},\n  },\n} as MiddlewaresType;\n`;
  const inserted = `${trimmed.slice(0, -'} as MiddlewaresType;'.length)}${middlewareBlock}`;

  return { content: inserted, updated: true };
};

const printManualMiddlewareRegistrationSnippet = (
  cmd: IBaseCommand,
  middlewareName: string,
  middlewareKey: string
): void => {
  cmd.warn('Could not update config/middleware.ts automatically. Add this manually:');
  cmd.info(`import { ${middlewareName} } from '@app/Middleware/${middlewareName}';`);
  cmd.info(`route: { ${middlewareKey}: ${middlewareName} }`);
  cmd.info(`Route typing example: type AppMiddlewareKey = MiddlewareKey | '${middlewareKey}';`);
};

const addMiddleware = async (
  cmd: IBaseCommand,
  middlewareName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name = middlewareName ?? '';

  if (name === '' && opts.noInteractive !== true) {
    const answers = await promptMiddlewareConfig();
    name = answers.name;
  } else if (name === '') {
    throw ErrorFactory.createValidationError('Middleware name is required');
  }

  if (!hasPascalCaseSuffix(name, 'Middleware')) {
    throw ErrorFactory.createValidationError(
      'Middleware name must be PascalCase ending with "Middleware"'
    );
  }

  const middlewareDir = path.join(projectRoot, 'app', 'Middleware');
  const middlewarePath = path.join(middlewareDir, `${name}.ts`);
  const configPath = path.join(projectRoot, 'config', 'middleware.ts');
  const middlewareKey = buildMiddlewareKey(name);

  ensureDirectoryExists(middlewareDir);

  const created = FileGenerator.writeFile(middlewarePath, buildMiddlewareSource(name), {
    overwrite: false,
  });

  if (!FileGenerator.fileExists(configPath)) {
    cmd.success(`Middleware '${name}' created successfully!`);
    cmd.warn('config/middleware.ts was not found, so registration was skipped.');
    printManualMiddlewareRegistrationSnippet(cmd, name, middlewareKey);
    return;
  }

  const currentConfig = FileGenerator.readFile(configPath);
  const withImport = registerMiddlewareImport(currentConfig, name);
  const registered = registerMiddlewareRouteKey(withImport, name, middlewareKey);

  if (!registered.updated) {
    cmd.success(`Middleware '${name}' created successfully!`);
    printManualMiddlewareRegistrationSnippet(cmd, name, middlewareKey);
    return;
  }

  fs.writeFileSync(configPath, registered.content, 'utf-8');

  cmd.success(`Middleware '${name}' ${created ? 'created' : 'updated'} successfully!`);
  cmd.info(`File: ${path.basename(middlewarePath)}`);
  cmd.info(`Registered route key: ${middlewareKey}`);
  cmd.info(
    `\nNext steps:\n  • Use '${middlewareKey}' in route metadata\n  • If your route file uses MiddlewareKey, extend it locally: type AppMiddlewareKey = MiddlewareKey | '${middlewareKey}'`
  );
};

const getFactoryInitialConfig = (
  factoryName: string | undefined,
  opts: AddOptions
): { name: string; modelName: string; relationships: string } => {
  return {
    name: factoryName ?? '',
    modelName: opts.model ?? '',
    relationships: opts.relationships ?? '',
  };
};

const displayFactorySuccess = (cmd: IBaseCommand, name: string, filePath?: string): void => {
  cmd.success(`Factory '${name}' created successfully!`);
  cmd.info(`File: ${filePath === undefined ? 'factory' : path.basename(filePath)}`);
  cmd.info(
    `\nUsage in tests:\n  const user = new ${name}().create();\n  const users = new ${name}().count(10).create();`
  );
  cmd.info(
    `\nAvailable states:\n  • active() - for published/active data\n  • inactive() - for draft/inactive data\n  • deleted() - for soft-deleted data`
  );
};

const promptFactoryConfig = async (): Promise<FactoryPromptAnswers> => {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Factory name (PascalCase, must end with "Factory", e.g., UserFactory):',
      validate: (v: string): string | boolean =>
        hasPascalCaseSuffix(v, 'Factory') || 'Must be PascalCase ending with "Factory"',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model name (e.g., User, Post):',
      validate: (v: string): string | boolean => isPascalCaseBase(v) || 'Must be PascalCase',
    },
    {
      type: 'confirm',
      name: 'addRelationships',
      message: 'Add relationships (will be prompted for each)?',
      default: false,
    },
  ]);

  if (answers.addRelationships === true) {
    const relAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'relationships',
        message: 'Related models (comma-separated, e.g., User,Category):',
        default: '',
      },
    ]);
    return { ...answers, relationships: relAnswers.relationships as string };
  }

  return answers;
};

const addFactory = async (
  cmd: IBaseCommand,
  factoryName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let config = getFactoryInitialConfig(factoryName, opts);

  if (config.name === '' && opts.noInteractive !== true) {
    const answers = await promptFactoryConfig();
    config = {
      name: answers.name,
      modelName: answers.model,
      relationships: answers.relationships ?? '',
    };
  } else if (config.name === '') {
    throw ErrorFactory.createValidationError('Factory name is required');
  }

  if (config.modelName === '') {
    throw ErrorFactory.createValidationError('Model name is required for factory generation');
  }

  const factoriesPath = path.join(projectRoot, 'database', 'factories');
  ensureDirectoryExists(factoriesPath);
  cmd.info(`Creating factory: ${config.name} for model ${config.modelName}...`);

  const result = await FactoryGenerator.generateFactory({
    factoryName: config.name,
    modelName: config.modelName,
    factoriesPath,
    relationships:
      config.relationships === ''
        ? undefined
        : config.relationships.split(',').map((r: string) => r.trim()),
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  displayFactorySuccess(cmd, config.name, result.filePath);
};

const getSeederInitialConfig = (
  seederName: string | undefined,
  opts: AddOptions
): {
  name: string;
  modelName: string;
  count: number;
  states: boolean;
  relationships: boolean;
  truncate: boolean;
} => {
  return {
    name: seederName ?? '',
    modelName: opts.model ?? '',
    count: opts.count === undefined ? 100 : Number.parseInt(opts.count, 10),
    states: opts.states === true,
    relationships: opts.relationships !== undefined,
    truncate: opts.truncate !== false,
  };
};

const ensureDirectoryExists = (dirPath: string): void => {
  if (fs.existsSync(dirPath) === false) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const displaySeederSuccess = (
  cmd: IBaseCommand,
  name: string,
  count: number,
  filePath: string,
  states: boolean,
  relationships: boolean
): void => {
  cmd.success(`Seeder '${name}' created successfully!`);
  cmd.info(`File: ${path.basename(filePath)}`);
  cmd.info(
    `\nUsage in migrations or database seeds:\n  await ${name}.run()          // Run with ${count} records\n  await ${name}.getRecords()   // Get records without inserting`
  );
  if (states === true) {
    cmd.info(
      `\nWith state distribution:\n  await ${name}.seedWithStates()     // 50% active, 30% inactive, 20% deleted`
    );
  }
  if (relationships === true) {
    cmd.info(
      `\nWith relationships:\n  await ${name}.seedWithRelationships()  // Seed with related data`
    );
  }
  cmd.info(
    `\nOther methods:\n  await ${name}.reset()            // Truncate table\n  await ${name}.runWithTruncate()  // Reset and seed`
  );
};

const displayDatabaseSeederSuccess = (cmd: IBaseCommand, filePath: string): void => {
  cmd.success(`Seeder 'DatabaseSeeder' created successfully!`);
  cmd.info(`File: ${path.basename(filePath)}`);
  cmd.info(`\nNext steps:\n  • Add additional seeders into this directory\n  • Run: zin db:seed`);
};

const promptSeederConfig = async (): Promise<SeederPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Seeder name (PascalCase, must end with "Seeder", e.g., UserSeeder):',
      validate: (v: string): string | boolean =>
        hasPascalCaseSuffix(v, 'Seeder') || 'Must be PascalCase ending with "Seeder"',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model name (e.g., User, Post):',
      when: (ans: { name?: string }): boolean => ans.name !== 'DatabaseSeeder',
      validate: (v: string): string | boolean => isPascalCaseBase(v) || 'Must be PascalCase',
    },
    {
      type: 'input',
      name: 'count',
      message: 'Number of records to seed (1-100,000):',
      default: '100',
      when: (ans: { name?: string }): boolean => ans.name !== 'DatabaseSeeder',
      validate: (v: string): string | boolean => {
        const num = Number.parseInt(v, 10);
        return (num >= 1 && num <= 100000) || 'Must be between 1 and 100,000';
      },
    },
    {
      type: 'confirm',
      name: 'states',
      message: 'Use state distribution (50% active, 30% inactive, 20% deleted)?',
      default: false,
      when: (ans: { name?: string }): boolean => ans.name !== 'DatabaseSeeder',
    },
    {
      type: 'confirm',
      name: 'relationships',
      message: 'Seed with relationships?',
      default: false,
      when: (ans: { name?: string }): boolean => ans.name !== 'DatabaseSeeder',
    },
    {
      type: 'confirm',
      name: 'truncate',
      message: 'Truncate table before seeding?',
      default: true,
      when: (ans: { name?: string }): boolean => ans.name !== 'DatabaseSeeder',
    },
  ]);
};

const addSeeder = async (
  cmd: IBaseCommand,
  seederName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let config = getSeederInitialConfig(seederName, opts);

  if (config.name === '' && opts.noInteractive !== true) {
    const answers = await promptSeederConfig();
    config = {
      name: answers.name,
      modelName: answers.model,
      count: Number.parseInt(answers.count, 10),
      states: answers.states,
      relationships: answers.relationships,
      truncate: answers.truncate,
    };
  } else if (config.name === '') {
    throw ErrorFactory.createValidationError('Seeder name is required');
  }

  const seedersPath = path.join(projectRoot, 'database', 'seeders');
  ensureDirectoryExists(seedersPath);

  if (config.name === 'DatabaseSeeder') {
    cmd.info('Creating seeder: DatabaseSeeder...');

    const result = await SeederGenerator.generateDatabaseSeeder({ seedersPath });
    if (result.success === false) throw ErrorFactory.createCliError(result.message);

    displayDatabaseSeederSuccess(cmd, result.filePath);
    return;
  }

  if (config.modelName === '') {
    throw ErrorFactory.createValidationError('Model name is required for seeder generation');
  }
  cmd.info(`Creating seeder: ${config.name} for model ${config.modelName}...`);

  const result = await SeederGenerator.generateSeeder({
    seederName: config.name,
    modelName: config.modelName,
    count: config.count,
    seedersPath,
    relationships: config.relationships === true ? ['related'] : undefined,
    truncate: config.truncate,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  displaySeederSuccess(
    cmd,
    config.name,
    config.count,
    result.filePath,
    config.states,
    config.relationships
  );
};

const promptRequestFactoryConfig = async (): Promise<RequestFactoryPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'factoryName',
      message: 'Request factory name (e.g., CreateUserRequestFactory):',
      validate: (input: string): string | boolean => {
        if (input === '') return 'Factory name is required';
        if (!input.endsWith('RequestFactory')) return 'Factory name must end with "RequestFactory"';
        return true;
      },
    },
    {
      type: 'input',
      name: 'requestName',
      message: 'Request name:',
      default: (ans: { factoryName: string }): string => ans.factoryName.replace('Factory', ''),
    },
    {
      type: 'input',
      name: 'endpoint',
      message: 'API endpoint (e.g., /api/v1/users):',
      default: '/api/v1/resource',
    },
    {
      type: 'list',
      name: 'method',
      message: 'HTTP method:',
      choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      default: 'POST',
    },
    {
      type: 'confirm',
      name: 'withDTO',
      message: 'Generate request DTO?',
      default: true,
    },
  ]);
};

const addRequestFactory = async (
  cmd: IBaseCommand,
  factoryName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  let name: string = factoryName ?? '';
  let requestName = '';
  let endpoint = '';
  let method = 'POST';
  let withDTO = true;

  if (name === '' && opts.noInteractive !== true) {
    const answer = await promptRequestFactoryConfig();
    name = answer.factoryName;
    requestName = answer.requestName;
    endpoint = answer.endpoint;
    method = answer.method;
    withDTO = answer.withDTO;
  }

  if (name === '') throw ErrorFactory.createValidationError('Factory name is required');

  const factoriesPath = path.join(process.cwd(), 'database', 'factories');
  const requestsPath = withDTO === true ? path.join(process.cwd(), 'app', 'Requests') : undefined;

  ensureDirectoryExists(factoriesPath);
  if (requestsPath !== undefined) ensureDirectoryExists(requestsPath);

  const result = await RequestFactoryGenerator.generateRequestFactory({
    factoryName: name,
    requestName: requestName === '' ? name.replace('Factory', '') : requestName,
    endpoint: endpoint === '' ? '/api/v1/resource' : endpoint,
    method: (method === '' ? 'POST' : method) as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    factoriesPath,
    requestsPath,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  cmd.success(`Request factory '${name}' created successfully!`);
  cmd.info(`Factory: ${path.basename(result.factoryPath)}`);
  if (result.requestPath !== undefined) cmd.info(`DTO: ${path.basename(result.requestPath)}`);

  cmd.info(
    `\nUsage in tests:\n  const request = ${name}.create()           // Create single request\n  const requests = ${name}.times(5).makeMany() // Create multiple requests\n  const invalid = ${name}.create().state('invalid').make() // Test validation`
  );
};

const promptResponseFactoryName = async (): Promise<string> => {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'factoryName',
      message: 'Response factory name (e.g., UserResponseFactory):',
      validate: (input: string): string | boolean => {
        if (input === '') return 'Factory name is required';
        if (!input.endsWith('ResponseFactory'))
          return 'Factory name must end with "ResponseFactory"';
        return true;
      },
    },
  ]);
  return answer.factoryName as string;
};

const promptResponseFactoryConfig = async (
  defaultResponseName: string
): Promise<ResponseFactoryPromptAnswers> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'factoryName',
      message: 'Factory name:',
      default: `${defaultResponseName}Factory`,
      validate: (input: string): string | boolean => {
        if (input === '') return 'Factory name is required';
        if (!input.endsWith('Factory')) return 'Factory name must end with "Factory"';
        return true;
      },
    },
    {
      type: 'input',
      name: 'responseName',
      message: 'Response name:',
      default: defaultResponseName,
      validate: (input: string): string | boolean => {
        if (input === '') return 'Response name is required';
        if (!input.endsWith('Response')) return 'Response name must end with "Response"';
        return true;
      },
    },
    {
      type: 'list',
      name: 'responseType',
      message: 'Response type:',
      choices: ['success', 'error', 'paginated', 'custom'],
      default: 'success',
    },
    {
      type: 'confirm',
      name: 'withDTO',
      message: 'Generate response DTO?',
      default: true,
    },
  ]);
};

const getResponseFactoryAnswers = async (
  name: string,
  responseName: string,
  opts: AddOptions
): Promise<ResponseFactoryPromptAnswers> => {
  if (opts.noInteractive === true) {
    return { factoryName: name, responseName, responseType: 'success', withDTO: true };
  }
  return promptResponseFactoryConfig(responseName);
};

const getDefaultResponseFields = (responseType: string): ResponseField[] => {
  const fields: ResponseField[] = [];
  if (responseType === 'success') {
    fields.push(
      { name: 'id', type: 'uuid' },
      { name: 'name', type: 'string' },
      { name: 'created_at', type: 'date' }
    );
  } else if (responseType === 'error') {
    fields.push({ name: 'code', type: 'number' }, { name: 'message', type: 'string' });
  } else if (responseType === 'paginated') {
    fields.push({ name: 'id', type: 'uuid' }, { name: 'name', type: 'string' });
  }
  return fields;
};

const displayResponseFactorySuccess = (
  cmd: IBaseCommand,
  name: string,
  result: ResponseFactoryPromptAnswers | ResponseFactoryGeneratorResult
): void => {
  cmd.success(`Response factory '${name}' created successfully!`);
  cmd.info(`Factory: ${path.basename(result.factoryPath ?? '')}`);
  if (result.responsePath !== undefined) cmd.info(`DTO: ${path.basename(result.responsePath)}`);
  cmd.info(
    `\nUsage in tests:\n  const response = ${name}.create()           // Create single response\n  const responses = ${name}.times(5).makeMany() // Create multiple responses\n  const error = ${name}.create().state('error').make() // Test error responses`
  );
};

const addResponseFactory = async (
  cmd: IBaseCommand,
  factoryName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  let name: string = factoryName ?? '';
  if (name === '' && opts.noInteractive !== true) {
    name = await promptResponseFactoryName();
  }

  if (name === '') throw ErrorFactory.createValidationError('Factory name is required');

  const responseName = name.replace('Factory', '');
  const answers = await getResponseFactoryAnswers(name, responseName, opts);

  const factoriesPath = path.join(process.cwd(), 'database', 'factories');
  const responsesPath =
    answers.withDTO === true ? path.join(process.cwd(), 'app', 'Responses') : undefined;

  ensureDirectoryExists(factoriesPath);
  if (responsesPath !== undefined) ensureDirectoryExists(responsesPath);

  const result = await ResponseFactoryGenerator.generate({
    factoryName: name,
    responseName: answers.responseName,
    fields: getDefaultResponseFields(answers.responseType),
    factoriesPath,
    responsesPath,
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);

  displayResponseFactorySuccess(cmd, name, result);
};

const promptWorkflowConfig = async (
  defaultName: string
): Promise<{ name: string; platform: 'lambda' | 'fargate' | 'cloudflare' | 'deno' | 'all' }> => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Workflow name:',
      default: defaultName,
    },
    {
      type: 'list',
      name: 'platform',
      message: 'Target platform:',
      choices: ['lambda', 'fargate', 'cloudflare', 'deno', 'all'],
      default: 'all',
    },
  ]);
};

const addWorkflow = async (
  cmd: IBaseCommand,
  workflowName: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const projectRoot = process.cwd();
  let name: string = workflowName ?? 'deploy-cloud';

  const validPlatforms: PlatformDeploy[] = ['lambda', 'fargate', 'cloudflare', 'deno', 'all'];
  let platform: PlatformDeploy = 'all';
  if (opts.platform !== undefined && validPlatforms.includes(opts.platform as PlatformDeploy)) {
    platform = opts.platform as PlatformDeploy;
  }

  const isInteractive = opts.noInteractive !== true;
  const hasNoName = workflowName === undefined || workflowName === '';
  const hasNoPlatform = opts.platform === undefined || opts.platform === '';

  if (isInteractive && (hasNoName || hasNoPlatform)) {
    const answers = await promptWorkflowConfig(name);
    name = answers.name;
    platform = answers.platform;
  }

  cmd.info(`Generating workflow: ${name}...`);

  const result = await WorkflowGenerator.generate({
    name,
    platform,
    projectRoot,
    branch: opts.branch ?? 'master',
    nodeVersion: opts.nodeVersion ?? '20.x',
  });

  if (result.success === false) throw ErrorFactory.createCliError(result.message);
  cmd.success(result.message);
};

const addGovernance = async (
  cmd: IBaseCommand,
  name: string | undefined,
  opts: AddOptions
): Promise<void> => {
  if (typeof name === 'string' && name.trim() !== '') {
    throw ErrorFactory.createValidationError(
      'governance does not take a name argument. Usage: zin add governance'
    );
  }

  const projectRoot = process.cwd();
  cmd.info('Installing governance tooling (ESLint + architecture tests)...');

  const result = await GovernanceScaffolder.scaffold(projectRoot, {
    writeEslintConfig: true,
    writeArchTests: true,
    install: true,
    packageManager: opts.packageManager,
  });

  if (result.success === false) {
    throw ErrorFactory.createCliError(result.message ?? 'Governance installation failed', result);
  }

  cmd.success('Governance installed successfully!');
  if (result.filesCreated.length > 0) {
    cmd.info(`Files created: ${result.filesCreated.length}`);
  }
};

type AddHandler = (cmd: IBaseCommand, name: string | undefined, opts: AddOptions) => Promise<void>;

const TYPE_HANDLERS: Record<string, AddHandler> = {
  service: addService,
  feature: addFeature,
  migration: async (cmd, name, opts) =>
    addMigration(cmd, typeof name === 'string' && name.length > 0 ? [name] : [], opts),
  model: addModel,
  controller: addController,
  routes: addRoutes,
  middleware: addMiddleware,
  factory: addFactory,
  seeder: addSeeder,
  requestfactory: addRequestFactory,
  'request-factory': addRequestFactory,
  responsefactory: addResponseFactory,
  'response-factory': addResponseFactory,
  workflow: addWorkflow,
  governance: addGovernance,
};

const handleType = async (
  cmd: IBaseCommand,
  type: string,
  name: string | undefined,
  opts: AddOptions
): Promise<void> => {
  const handler = TYPE_HANDLERS[type];
  if (handler === undefined) {
    throw ErrorFactory.createCliError(
      `Unknown type "${type}". Use: service, feature, migration, model, controller, routes, middleware, factory, seeder, requestfactory, responsefactory, workflow, or governance`
    );
  }
  await handler(cmd, name, opts);
};

const getArgs = (args: unknown): string[] | undefined =>
  Array.isArray(args) ? (args as string[]) : undefined;

const installPlugin = async (
  cmd: IBaseCommand,
  type: string,
  name: string | undefined,
  addOpts: AddOptions
): Promise<void> => {
  const normalizedType = type.toLowerCase();
  if (name !== undefined && name.length > 0) {
    throw ErrorFactory.createCliError(
      `"${type}" looks like a plugin id. Run: zin add ${type} (without a name argument).`
    );
  }

  cmd.info(`Installing plugin: ${normalizedType}...`);
  const pm = typeof addOpts.packageManager === 'string' ? addOpts.packageManager : undefined;
  if (pm === undefined) {
    await PluginManager.install(normalizedType);
  } else {
    await PluginManager.install(normalizedType, { packageManager: pm });
  }
  cmd.success(`Plugin '${normalizedType}' installed successfully!`);
};

const executeAdd = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  const command = cmd.getCommand();
  const args = getArgs(options.args) ?? getArgs(command.args) ?? [];
  const type = args[0];
  const name = args[1];

  const commandOpts = typeof command.opts === 'function' ? command.opts() : {};
  const addOpts = { ...options, ...commandOpts } as AddOptions;

  try {
    if (type === undefined || type === '') {
      throw ErrorFactory.createCliError(
        'Please specify what to add: service, feature, migration, model, controller, routes, middleware, factory, or seeder'
      );
    }

    // Planned modular adapter syntax: `zin add db:sqlite` (delegate to plugin installer)
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes(':')) {
      await installPlugin(cmd, type, name, addOpts);
      return;
    }

    if (normalizedType === 'migration') {
      await addMigration(cmd, args.slice(1), addOpts);
      return;
    }

    await handleType(cmd, normalizedType, name, addOpts);
  } catch (error) {
    ErrorFactory.createCliError('Add command failed', error);
    cmd.warn(`Failed: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Add Command Factory
 */
export const AddCommand = Object.freeze({
  /**
   * Create a new add command instance
   */
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'add',
      description: 'Add services and features to existing project',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeAdd(cmd, options),
    });

    return cmd;
  },

  /**
   * Internal helpers for testing
   * @internal
   */
  _helpers: {
    promptServiceConfig,
    promptFeatureConfig,
    promptMigrationConfig,
    promptModelConfig,
    promptControllerConfig,
    promptRoutesConfig,
    promptMiddlewareConfig,
    promptFactoryConfig,
    promptSeederConfig,
    promptRequestFactoryConfig,
    promptResponseFactoryName,
    promptResponseFactoryConfig,
    promptWorkflowConfig,
    getDefaultResponseFields,
    isPascalCaseBase,
    toSafeSnakeCase,
    stripSuffix,
    skipInlineWhitespace,
    findMatchingObjectBrace,
    findRouteBlockBounds,
    hasTrailingMiddlewaresTypeCast,
    registerMiddlewareRouteKey,
  },
});
