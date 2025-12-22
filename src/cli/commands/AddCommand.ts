/**
 * Add Command - Phase 4 Integration
 * Add services and features to existing Zintrust project
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { ControllerGenerator, ControllerType } from '@cli/scaffolding/ControllerGenerator';
import { FactoryGenerator } from '@cli/scaffolding/FactoryGenerator';
import { FeatureScaffolder, FeatureType } from '@cli/scaffolding/FeatureScaffolder';
import { MigrationGenerator, MigrationType } from '@cli/scaffolding/MigrationGenerator';
import { ModelGenerator } from '@cli/scaffolding/ModelGenerator';
import { RequestFactoryGenerator } from '@cli/scaffolding/RequestFactoryGenerator';
import {
  ResponseFactoryGenerator,
  ResponseFactoryGeneratorResult,
  ResponseField,
} from '@cli/scaffolding/ResponseFactoryGenerator';
import { RouteGenerator } from '@cli/scaffolding/RouteGenerator';
import { SeederGenerator } from '@cli/scaffolding/SeederGenerator';
import { ServiceScaffolder } from '@cli/scaffolding/ServiceScaffolder';
import { WorkflowGenerator } from '@cli/scaffolding/WorkflowGenerator';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'node:fs';
import path from 'node:path';

type PlatformDeploy = 'lambda' | 'fargate' | 'cloudflare' | 'deno' | 'all';

interface AddOptions extends CommandOptions {
  type?: string;
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

export class AddCommand extends BaseCommand {
  constructor() {
    super();
    this.name = 'add';
    this.description = 'Add services and features to existing project';
  }

  protected addOptions(command: Command): void {
    command
      .argument(
        '<type>',
        'What to add: service, feature, migration, model, controller, routes, factory, seeder, requestfactory, responsefactory, or workflow'
      )
      .argument(
        '[name]',
        'Name of service/feature/migration/model/controller/factory/seeder/requestfactory/responsefactory/workflow'
      )
      .option('--database <type>', 'Database (shared|isolated) - for services')
      .option('--auth <strategy>', 'Auth strategy (api-key|jwt|none|custom) - for services')
      .option('--port <number>', 'Service port - for services')
      .option('--with-test', 'Generate test files - for features')
      .option(
        '--controller-type <type>',
        'Controller type: crud, resource, api, graphql, websocket, webhook - for controllers'
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
  }

  async execute(options: CommandOptions): Promise<void> {
    const args = options.args || [];
    const type = args[0];
    const name = args[1];
    const addOptions = options as AddOptions;

    try {
      if (type === undefined || type === '') {
        throw new Error(
          'Please specify what to add: service, feature, migration, model, controller, routes, factory, or seeder'
        );
      }

      await this.handleType(type.toLowerCase(), name, addOptions);
    } catch (error) {
      Logger.error('Add command failed', error);
      this.warn(`Failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Handle the specific type of component to add
   */
  private async handleType(
    type: string,
    name: string | undefined,
    addOptions: AddOptions
  ): Promise<void> {
    switch (type) {
      case 'service':
        await this.addService(name, addOptions);
        break;
      case 'feature':
        await this.addFeature(name, addOptions);
        break;
      case 'migration':
        await this.addMigration(name, addOptions);
        break;
      case 'model':
        await this.addModel(name, addOptions);
        break;
      case 'controller':
        await this.addController(name, addOptions);
        break;
      case 'routes':
        await this.addRoutes(name, addOptions);
        break;
      case 'factory':
        await this.addFactory(name, addOptions);
        break;
      case 'seeder':
        await this.addSeeder(name, addOptions);
        break;
      case 'requestfactory':
      case 'request-factory':
        await this.addRequestFactory(name, addOptions);
        break;
      case 'responsefactory':
      case 'response-factory':
        await this.addResponseFactory(name, addOptions);
        break;
      case 'workflow':
        await this.addWorkflow(name, addOptions);
        break;
      default:
        throw new Error(
          `Unknown type "${type}". Use: service, feature, migration, model, controller, routes, factory, seeder, requestfactory, responsefactory, or workflow`
        );
    }
  }

  /**
   * Add a new microservice
   */
  private async addService(serviceName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = serviceName ?? '';

    // Get service name if not provided
    if (name === '' && opts.noInteractive !== true) {
      const answers = await this.promptServiceConfig(name);
      name = answers.name;
      Object.assign(opts, answers);
    } else if (name === '') {
      throw new Error('Service name is required');
    }

    this.info(`Creating service: ${name}...`);

    const result = await ServiceScaffolder.scaffold(projectRoot, {
      name,
      domain: opts.domain ?? 'default',
      port: opts.port === undefined ? 3001 : Number.parseInt(opts.port, 10),
      database: opts.database ?? 'shared',
      auth: opts.auth ?? 'api-key',
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Service '${name}' created successfully!`);
    this.info(`\nFiles created: ${result.filesCreated.length}`);
    this.info(`Location: ${result.servicePath}`);
    this.info(
      `\nNext steps:\n  • Update service.config.json\n  • Add environment variables\n  • Create routes and controllers`
    );
  }

  /**
   * Prompt for service configuration
   */
  private async promptServiceConfig(defaultName: string): Promise<ServicePromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Service name (lowercase, no spaces):',
        default: defaultName,
        validate: (v: string): string | boolean =>
          /^[a-z]+$/.test(v) || 'Must be lowercase letters only',
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
  }

  /**
   * Add a feature to service
   */
  private async addFeature(featureName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = featureName ?? '';
    let servicePath: string = opts.service ?? '';

    // Get feature name if not provided
    if (name === '' && opts.noInteractive !== true) {
      const answers = await this.promptFeatureConfig();
      name = answers.name;
      servicePath = answers.servicePath;
      opts.withTest = answers.withTest;
    } else if (name === '') {
      throw new Error('Feature name is required');
    }

    if (servicePath === '') {
      throw new Error('Service path is required');
    }

    const fullServicePath = path.join(projectRoot, servicePath);
    this.info(`Adding feature: ${name}...`);

    const result = await FeatureScaffolder.addFeature({
      name: name as FeatureType,
      servicePath: fullServicePath,
      withTest: opts.withTest,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Feature '${name}' added successfully!`);
    this.info(`Files created: ${result.filesCreated.length}`);
    this.info(
      `\nNext steps:\n  • Integrate feature in service\n  • Update routes if needed\n  • Add to configuration`
    );
  }

  /**
   * Prompt for feature configuration
   */
  private async promptFeatureConfig(): Promise<FeaturePromptAnswers> {
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
  }

  /**
   * Add a database migration
   */
  private async addMigration(migrationName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = migrationName ?? '';

    // Get migration name if not provided
    if (name === '' && opts.noInteractive !== true) {
      const answers = await this.promptMigrationConfig();
      name = answers.name;
      opts.type = answers.type;
    } else if (name === undefined || name === '') {
      throw new Error('Migration name is required');
    }

    const migrationsPath = path.join(projectRoot, 'database', 'migrations');
    this.info(`Creating migration: ${name}...`);

    const result = await MigrationGenerator.generateMigration({
      name,
      migrationsPath,
      type: (opts.type ?? 'create') as MigrationType,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Migration created successfully!`);
    this.info(`File: ${path.basename(result.filePath)}`);
    this.info(
      `\nNext steps:\n  • Edit migration file\n  • Add up() and down() implementations\n  • Run migrations`
    );
  }

  /**
   * Prompt for migration configuration
   */
  private async promptMigrationConfig(): Promise<MigrationPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Migration name (snake_case, e.g., create_users_table):',
        validate: (v: string): string | boolean => /^[a-z_]+$/.test(v) || 'Must be snake_case',
      },
      {
        type: 'list',
        name: 'type',
        message: 'Migration type:',
        choices: ['create', 'alter', 'drop'],
      },
    ]);
  }

  /**
   * Add a new model
   */
  private async addModel(modelName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = modelName ?? '';

    // Get model name if not provided
    if (name === '' && opts.noInteractive !== true) {
      const answers = await this.promptModelConfig();
      name = answers.name;
      opts.softDelete = answers.softDelete;
      opts.timestamps = answers.timestamps;
    } else if (name === '') {
      throw new Error('Model name is required');
    }

    const modelPath = path.join(projectRoot, 'app', 'Models');
    this.info(`Creating model: ${name}...`);

    const result = await ModelGenerator.generateModel({
      name,
      modelPath,
      softDelete: opts.softDelete === true,
      timestamps: opts.timestamps !== false,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Model '${name}' created successfully!`);
    this.info(`File: ${path.basename(result.modelFile)}`);
    this.info(
      `\nNext steps:\n  • Add fillable attributes\n  • Define relationships\n  • Create migration for table`
    );
  }

  /**
   * Prompt for model configuration
   */
  private async promptModelConfig(): Promise<ModelPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Model name (PascalCase, e.g., User, Post):',
        validate: (v: string): string | boolean =>
          /^[A-Z][a-zA-Z\d]*$/.test(v) || 'Must be PascalCase',
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
  }

  /**
   * Add a new controller
   */
  private async addController(controllerName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = controllerName ?? '';
    let controllerType: string = opts.controllerType ?? '';

    // Get controller name and type if not provided
    if (name === '' && opts.noInteractive !== true) {
      const answers = await this.promptControllerConfig();
      name = answers.name;
      controllerType = answers.type;
    } else if (name === '') {
      throw new Error('Controller name is required');
    }

    const controllerPath = path.join(projectRoot, 'app', 'Controllers');
    this.info(`Creating controller: ${name}...`);

    const result = await ControllerGenerator.generateController({
      name,
      controllerPath,
      type: (controllerType === ''
        ? (opts.controllerType ?? 'crud')
        : controllerType) as ControllerType,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Controller '${name}' created successfully!`);
    this.info(`File: ${path.basename(result.controllerFile)}`);
    this.info(
      `\nNext steps:\n  • Implement action methods\n  • Add validation logic\n  • Register routes for this controller`
    );
  }

  /**
   * Prompt for controller configuration
   */
  private async promptControllerConfig(): Promise<ControllerPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Controller name (PascalCase, e.g., UserController):',
        validate: (v: string): string | boolean =>
          /^[A-Z][a-zA-Z\d]*Controller$/.test(v) || 'Must be PascalCase ending with "Controller"',
      },
      {
        type: 'list',
        name: 'type',
        message: 'Controller type:',
        choices: ['crud', 'resource', 'api', 'graphql', 'websocket', 'webhook'],
        default: 'crud',
      },
    ]);
  }

  /**
   * Add routes
   */
  private async addRoutes(routeName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = routeName ?? '';

    // Get route file name if not provided
    if (name === '' && opts.noInteractive !== true) {
      const answers = await this.promptRoutesConfig();
      name = answers.name;
    } else if (name === '') {
      throw new Error('Route group name is required');
    }

    const routesPath = path.join(projectRoot, 'routes');
    this.info(`Creating routes: ${name}...`);

    const result = await RouteGenerator.generateRoutes({
      groupName: name,
      routesPath,
      routes: [],
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Routes file '${name}' created successfully!`);
    this.info(`File: ${path.basename(result.routeFile)}`);
    this.info(
      `\nNext steps:\n  • Add route definitions\n  • Import controllers\n  • Register in main router`
    );
  }

  /**
   * Prompt for routes configuration
   */
  private async promptRoutesConfig(): Promise<RoutesPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Route group name (e.g., api, admin, public):',
        default: 'api',
      },
    ]);
  }

  /**
   * Add factory for test data generation
   */
  private async addFactory(factoryName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let config = this.getFactoryInitialConfig(factoryName, opts);

    // Get factory name and model if not provided
    if (config.name === '' && opts.noInteractive !== true) {
      const answers = await this.promptFactoryConfig();
      config = {
        name: answers.name,
        modelName: answers.model,
        relationships: answers.relationships ?? '',
      };
    } else if (config.name === '') {
      throw new Error('Factory name is required');
    }

    if (config.modelName === '' && opts.noInteractive !== true) {
      throw new Error('Model name is required for factory generation');
    }

    const factoriesPath = path.join(projectRoot, 'database', 'factories');
    this.info(`Creating factory: ${config.name} for model ${config.modelName}...`);

    const result = await FactoryGenerator.generateFactory({
      factoryName: config.name,
      modelName: config.modelName,
      factoriesPath,
      relationships:
        config.relationships === ''
          ? undefined
          : config.relationships.split(',').map((r) => r.trim()),
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.displayFactorySuccess(config.name, result.filePath);
  }

  /**
   * Get initial factory configuration from options
   */
  private getFactoryInitialConfig(
    factoryName: string | undefined,
    opts: AddOptions
  ): { name: string; modelName: string; relationships: string } {
    return {
      name: factoryName ?? '',
      modelName: opts.model ?? '',
      relationships: opts.relationships ?? '',
    };
  }

  /**
   * Display factory success message
   */
  private displayFactorySuccess(name: string, filePath?: string): void {
    this.success(`Factory '${name}' created successfully!`);
    this.info(`File: ${filePath === undefined ? 'factory' : path.basename(filePath)}`);
    this.info(
      `\nUsage in tests:\n  const user = new ${name}().create();\n  const users = new ${name}().count(10).create();`
    );
    this.info(
      `\nAvailable states:\n  • active() - for published/active data\n  • inactive() - for draft/inactive data\n  • deleted() - for soft-deleted data`
    );
  }

  /**
   * Prompt for factory configuration
   */
  private async promptFactoryConfig(): Promise<FactoryPromptAnswers> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Factory name (PascalCase, must end with "Factory", e.g., UserFactory):',
        validate: (v: string): string | boolean =>
          /^[A-Z][a-zA-Z\d]*Factory$/.test(v) || 'Must be PascalCase ending with "Factory"',
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model name (e.g., User, Post):',
        validate: (v: string): string | boolean =>
          /^[A-Z][a-zA-Z\d]*$/.test(v) || 'Must be PascalCase',
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
      return { ...answers, relationships: relAnswers.relationships };
    }

    return answers;
  }

  /**
   * Add a new seeder
   */
  private async addSeeder(seederName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let config = this.getSeederInitialConfig(seederName, opts);

    // Get seeder name and model if not provided
    if (config.name === '' && opts.noInteractive !== true) {
      const answers = await this.promptSeederConfig();
      config = {
        name: answers.name,
        modelName: answers.model,
        count: Number.parseInt(answers.count, 10),
        states: answers.states,
        relationships: answers.relationships,
        truncate: answers.truncate,
      };
    } else if (config.name === '') {
      throw new Error('Seeder name is required');
    }

    if (config.modelName === '' && opts.noInteractive !== true) {
      throw new Error('Model name is required for seeder generation');
    }

    const seedersPath = path.join(projectRoot, 'database', 'seeders');
    this.ensureDirectoryExists(seedersPath);

    this.info(`Creating seeder: ${config.name} for model ${config.modelName}...`);

    const result = await SeederGenerator.generateSeeder({
      seederName: config.name,
      modelName: config.modelName,
      count: config.count,
      seedersPath,
      relationships: config.relationships === true ? ['related'] : undefined,
      truncate: config.truncate,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.displaySeederSuccess(
      config.name,
      config.count,
      result.filePath,
      config.states,
      config.relationships
    );
  }

  /**
   * Get initial seeder configuration from options
   */
  private getSeederInitialConfig(
    seederName: string | undefined,
    opts: AddOptions
  ): {
    name: string;
    modelName: string;
    count: number;
    states: boolean;
    relationships: boolean;
    truncate: boolean;
  } {
    return {
      name: seederName ?? '',
      modelName: opts.model ?? '',
      count: opts.count === undefined ? 100 : Number.parseInt(opts.count, 10),
      states: opts.states === true,
      relationships: opts.relationships !== undefined,
      truncate: opts.truncate !== false,
    };
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (fs.existsSync(dirPath) === false) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Display seeder success message
   */
  private displaySeederSuccess(
    name: string,
    count: number,
    filePath: string,
    states: boolean,
    relationships: boolean
  ): void {
    this.success(`Seeder '${name}' created successfully!`);
    this.info(`File: ${path.basename(filePath)}`);
    this.info(
      `\nUsage in migrations or database seeds:\n  await ${name}.run()          // Run with ${count} records\n  await ${name}.getRecords()   // Get records without inserting`
    );
    if (states === true) {
      this.info(
        `\nWith state distribution:\n  await ${name}.seedWithStates()     // 50% active, 30% inactive, 20% deleted`
      );
    }
    if (relationships === true) {
      this.info(
        `\nWith relationships:\n  await ${name}.seedWithRelationships()  // Seed with related data`
      );
    }
    this.info(
      `\nOther methods:\n  await ${name}.reset()            // Truncate table\n  await ${name}.runWithTruncate()  // Reset and seed`
    );
  }

  /**
   * Prompt for seeder configuration
   */
  private async promptSeederConfig(): Promise<SeederPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Seeder name (PascalCase, must end with "Seeder", e.g., UserSeeder):',
        validate: (v: string): string | boolean =>
          /^[A-Z][a-zA-Z\d]*Seeder$/.test(v) || 'Must be PascalCase ending with "Seeder"',
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model name (e.g., User, Post):',
        validate: (v: string): string | boolean =>
          /^[A-Z][a-zA-Z\d]*$/.test(v) || 'Must be PascalCase',
      },
      {
        type: 'input',
        name: 'count',
        message: 'Number of records to seed (1-100,000):',
        default: '100',
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
      },
      {
        type: 'confirm',
        name: 'relationships',
        message: 'Seed with relationships?',
        default: false,
      },
      {
        type: 'confirm',
        name: 'truncate',
        message: 'Truncate table before seeding?',
        default: true,
      },
    ]);
  }

  /**
   * Add request factory command
   */
  private async addRequestFactory(
    factoryName: string | undefined,
    opts: AddOptions
  ): Promise<void> {
    let name: string = factoryName ?? '';
    let requestName: string = '';
    let endpoint: string = '';
    let method: string = 'POST';
    let withDTO: boolean = true;

    if (name === '' && opts.noInteractive !== true) {
      const answer = await this.promptRequestFactoryConfig();
      name = answer.factoryName;
      requestName = answer.requestName;
      endpoint = answer.endpoint;
      method = answer.method;
      withDTO = answer.withDTO;
    }

    // Ensure name is a string before proceeding
    if (name === '') {
      throw new Error('Factory name is required');
    }

    const factoriesPath = path.join(process.cwd(), 'database', 'factories');
    const requestsPath = withDTO === true ? path.join(process.cwd(), 'app', 'Requests') : undefined;

    // Ensure paths exist
    if (!fs.existsSync(factoriesPath)) {
      fs.mkdirSync(factoriesPath, { recursive: true });
    }
    if (requestsPath !== undefined && !fs.existsSync(requestsPath)) {
      fs.mkdirSync(requestsPath, { recursive: true });
    }

    const result = await RequestFactoryGenerator.generateRequestFactory({
      factoryName: name,
      requestName: requestName === '' ? name.replace('Factory', '') : requestName,
      endpoint: endpoint === '' ? '/api/v1/resource' : endpoint,
      method: (method === '' ? 'POST' : method) as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      factoriesPath,
      requestsPath,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(`Request factory '${name}' created successfully!`);
    this.info(`Factory: ${path.basename(result.factoryPath)}`);

    if (result.requestPath !== undefined) {
      this.info(`DTO: ${path.basename(result.requestPath)}`);
    }

    this.info(
      `\nUsage in tests:\n  const request = ${name}.create()           // Create single request\n  const requests = ${name}.times(5).makeMany() // Create multiple requests\n  const invalid = ${name}.create().state('invalid').make() // Test validation`
    );
  }

  /**
   * Prompt for request factory configuration
   */
  private async promptRequestFactoryConfig(): Promise<RequestFactoryPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'factoryName',
        message: 'Request factory name (e.g., CreateUserRequestFactory):',
        validate: (input: string): string | boolean => {
          if (input === '') return 'Factory name is required';
          if (!input.endsWith('RequestFactory')) {
            return 'Factory name must end with "RequestFactory"';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'requestName',
        message: 'Request class name:',
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
        message: 'Generate request DTO class?',
        default: true,
      },
    ]);
  }

  /**
   * Add a new response factory (Phase 7)
   */
  private async addResponseFactory(
    factoryName: string | undefined,
    opts: AddOptions
  ): Promise<void> {
    let name: string = factoryName ?? '';
    if (name === '' && opts.noInteractive !== true) {
      name = await this.promptResponseFactoryName();
    }

    if (name === '') {
      throw new Error('Factory name is required');
    }

    const responseName = name.replace('Factory', '');
    const answers = await this.getResponseFactoryAnswers(name, responseName, opts);

    const factoriesPath = path.join(process.cwd(), 'database', 'factories');
    const responsesPath =
      answers.withDTO === true ? path.join(process.cwd(), 'app', 'Responses') : undefined;

    this.ensureDirectoryExists(factoriesPath);
    if (responsesPath !== undefined) {
      this.ensureDirectoryExists(responsesPath);
    }

    const result = await ResponseFactoryGenerator.generate({
      factoryName: name,
      responseName: answers.responseName,
      fields: this.getDefaultResponseFields(answers.responseType),
      factoriesPath,
      responsesPath,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.displayResponseFactorySuccess(name, result);
  }

  /**
   * Prompt for response factory name
   */
  private async promptResponseFactoryName(): Promise<string> {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'factoryName',
        message: 'Response factory name (e.g., UserResponseFactory):',
        validate: (input: string): string | boolean => {
          if (input === '') return 'Factory name is required';
          if (!input.endsWith('ResponseFactory')) {
            return 'Factory name must end with "ResponseFactory"';
          }
          return true;
        },
      },
    ]);
    return answer.factoryName;
  }

  /**
   * Get response factory answers
   */
  private async getResponseFactoryAnswers(
    name: string,
    responseName: string,
    opts: AddOptions
  ): Promise<ResponseFactoryPromptAnswers> {
    if (opts.noInteractive === true) {
      return { factoryName: name, responseName, responseType: 'success', withDTO: true };
    }
    return this.promptResponseFactoryConfig(responseName);
  }

  /**
   * Display response factory success message
   */
  private displayResponseFactorySuccess(
    name: string,
    result: ResponseFactoryPromptAnswers | ResponseFactoryGeneratorResult
  ): void {
    this.success(`Response factory '${name}' created successfully!`);
    this.info(`Factory: ${path.basename(result.factoryPath ?? '')}`);

    if (result.responsePath !== undefined) {
      this.info(`DTO: ${path.basename(result.responsePath)}`);
    }

    this.info(
      `\nUsage in tests:\n  const response = ${name}.create()           // Create single response\n  const responses = ${name}.times(5).makeMany() // Create multiple responses\n  const error = ${name}.create().state('error').make() // Test error responses`
    );
  }

  /**
   * Prompt for response factory configuration
   */
  private async promptResponseFactoryConfig(
    defaultResponseName: string
  ): Promise<ResponseFactoryPromptAnswers> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'factoryName',
        message: 'Factory class name:',
        default: `${defaultResponseName}Factory`,
        validate: (input: string): string | boolean => {
          if (input === '') return 'Factory name is required';
          if (!input.endsWith('Factory')) {
            return 'Factory name must end with "Factory"';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'responseName',
        message: 'Response class name:',
        default: defaultResponseName,
        validate: (input: string): string | boolean => {
          if (input === '') return 'Response name is required';
          if (!input.endsWith('Response')) {
            return 'Response name must end with "Response"';
          }
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
        message: 'Generate response DTO class?',
        default: true,
      },
    ]);
  }

  /**
   * Get default fields for response type
   */
  private getDefaultResponseFields(responseType: string): ResponseField[] {
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
  }

  /**
   * Add a new workflow
   */
  private async addWorkflow(workflowName: string | undefined, opts: AddOptions): Promise<void> {
    const projectRoot = process.cwd();
    let name: string = workflowName ?? 'deploy-cloud';

    // Define valid platforms for type safety
    const validPlatforms = ['lambda', 'fargate', 'cloudflare', 'deno', 'all'];
    let platform: PlatformDeploy = 'all';

    if (opts.platform !== undefined && validPlatforms.includes(opts.platform)) {
      platform = opts.platform as PlatformDeploy;
    }

    // Explicitly check for nullish/empty values to satisfy linter
    const isInteractive = opts.noInteractive !== true;
    const hasNoName = workflowName === undefined || workflowName === '';
    const hasNoPlatform = opts.platform === undefined || opts.platform === '';

    if (isInteractive && (hasNoName || hasNoPlatform)) {
      const answers = await this.promptWorkflowConfig(name);
      name = answers.name;
      platform = answers.platform;
    }

    this.info(`Generating workflow: ${name}...`);

    const result = await WorkflowGenerator.generate({
      name,
      platform,
      projectRoot,
      branch: opts.branch ?? 'master',
      nodeVersion: opts.nodeVersion ?? '20.x',
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(result.message);
  }

  /**
   * Prompt for workflow configuration
   */
  private async promptWorkflowConfig(
    defaultName: string
  ): Promise<{ name: string; platform: 'lambda' | 'fargate' | 'cloudflare' | 'deno' | 'all' }> {
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
  }
}
