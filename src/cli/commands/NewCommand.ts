import { appConfig } from '@config/app';
/**
 * New Command - Project scaffolding CLI command
 * Handles creation of new Zintrust projects
 */

import { resolveNpmPath } from '@/common';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { ProjectScaffolder } from '@cli/scaffolding/ProjectScaffolder';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import * as path from '@node-singletons/path';
import chalk from 'chalk';
import { Command } from 'commander';

type TemplateType = 'basic' | 'api' | 'microservice';
type DatabaseType = 'sqlite' | 'mysql' | 'postgresql' | 'mongodb';

interface NewProjectConfig {
  name: string;
  template: TemplateType;
  database: DatabaseType;
  port: number;
  author: string;
  description: string;
  interactive: boolean;
}

interface NewProjectConfigResult {
  template: TemplateType;
  database: DatabaseType;
  port: number;
  author: string;
  description: string;
}

type InquirerQuestion = Record<string, unknown>;

const errorToMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
};

const getGitBinary = (): string => 'git';

const checkGitInstalled = (): boolean => {
  try {
    execFileSync(getGitBinary(), ['--version'], { stdio: 'ignore', env: appConfig.getSafeEnv() });
    return true;
  } catch (error) {
    ErrorFactory.createCliError('Git check failed', error);
    return false;
  }
};

const initializeGitRepo = (projectPath: string, log: Pick<IBaseCommand, 'info' | 'warn'>): void => {
  try {
    const git = getGitBinary();
    const env = appConfig.getSafeEnv();
    execFileSync(git, ['init'], { cwd: projectPath, stdio: 'ignore', env });
    execFileSync(git, ['add', '.'], { cwd: projectPath, stdio: 'ignore', env });
    execFileSync(git, ['commit', '-m', 'Initial commit from Zintrust'], {
      cwd: projectPath,
      stdio: 'ignore',
      env,
    });
    log.info('✅ Git repository initialized');
  } catch (error) {
    ErrorFactory.createCliError('Git initialization failed', error);
    log.warn('Could not initialize git repository');
  }
};

const getStringOption = (options: CommandOptions, key: string, fallback: string): string => {
  const value = options[key];
  return typeof value === 'string' && value !== '' ? value : fallback;
};

const getBooleanOption = (options: CommandOptions, key: string, fallback: boolean): boolean => {
  const value = options[key];
  return typeof value === 'boolean' ? value : fallback;
};

const getProjectDefaults = (name: string, options: CommandOptions): NewProjectConfig => {
  const template = getStringOption(options, 'template', 'basic') as TemplateType;
  const database = getStringOption(options, 'database', 'sqlite') as DatabaseType;
  const portRaw = getStringOption(options, 'port', '3003');
  const portParsed = Number.parseInt(portRaw, 10);
  const port = Number.isFinite(portParsed) && portParsed > 0 ? portParsed : 3000;

  const author = getStringOption(options, 'author', '');
  const description = getStringOption(options, 'description', `A new Zintrust project: ${name}`);
  const interactive = getBooleanOption(options, 'interactive', true);

  return { name, template, database, port, author, description, interactive };
};

const toConfigResult = (config: NewProjectConfig): NewProjectConfigResult => ({
  template: config.template,
  database: config.database,
  port: config.port,
  author: config.author,
  description: config.description,
});

const getQuestions = (name: string, defaults: NewProjectConfig): InquirerQuestion[] => {
  return [
    {
      type: 'list',
      name: 'template',
      message: 'Project template:',
      choices: ['basic', 'api', 'microservice'],
      default: defaults.template,
    },
    {
      type: 'list',
      name: 'database',
      message: 'Database driver:',
      choices: ['sqlite', 'mysql', 'postgresql', 'mongodb'],
      default: defaults.database,
    },
    {
      type: 'input',
      name: 'port',
      message: 'Default port number:',
      default: String(defaults.port),
      validate: (value: string): boolean => {
        const port = Number.parseInt(value, 10);
        return Number.isFinite(port) && port > 0 && port < 65536;
      },
    },
    {
      type: 'input',
      name: 'author',
      message: 'Project author:',
      default: defaults.author,
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      default:
        defaults.description === '' ? `A new Zintrust project: ${name}` : defaults.description,
    },
  ];
};

const mergePromptAnswers = (
  defaults: NewProjectConfig,
  answers: Record<string, unknown>
): NewProjectConfig => {
  const template =
    typeof answers['template'] === 'string'
      ? (answers['template'] as TemplateType)
      : defaults.template;
  const database =
    typeof answers['database'] === 'string'
      ? (answers['database'] as DatabaseType)
      : defaults.database;

  let port = defaults.port;
  const portAnswer = answers['port'];
  if (typeof portAnswer === 'string') {
    const parsed = Number.parseInt(portAnswer, 10);
    if (Number.isFinite(parsed)) port = parsed;
  } else if (typeof portAnswer === 'number') {
    if (Number.isFinite(portAnswer)) port = portAnswer;
  }

  const author = typeof answers['author'] === 'string' ? answers['author'] : defaults.author;
  const description =
    typeof answers['description'] === 'string' ? answers['description'] : defaults.description;

  return {
    ...defaults,
    template,
    database,
    port,
    author,
    description,
  };
};

const promptForConfig = async (
  name: string,
  options: CommandOptions
): Promise<NewProjectConfig> => {
  const defaults = getProjectDefaults(name, options);
  if (defaults.interactive === false) return defaults;

  const questions = getQuestions(name, defaults);
  const answers = await PromptHelper.prompt(questions);
  return mergePromptAnswers(defaults, answers);
};

const isFailureResult = (result: unknown): result is { success: false; message?: string } => {
  if (typeof result !== 'object' || result === null) return false;
  const maybe = result as { success?: unknown; message?: unknown };
  return maybe.success === false;
};

const installDependencies = (
  projectPath: string,
  log: Pick<IBaseCommand, 'info' | 'warn'>
): void => {
  log.info('📦 Installing dependencies (this may take a minute)...');
  try {
    const npmPath = resolveNpmPath();
    execFileSync(npmPath, ['install'], {
      cwd: projectPath,
      stdio: 'inherit',
      env: appConfig.getSafeEnv(),
    });
    log.info('✅ Dependencies installed successfully');
  } catch (error) {
    ErrorFactory.createCliError('Dependency installation failed', error);
    log.warn('Please run "npm install" manually in the project directory');
  }
};

interface INewCommand extends IBaseCommand {
  promptForConfig(name: string, options: CommandOptions): Promise<NewProjectConfigResult>;
  getProjectConfig(name: string, options: CommandOptions): Promise<NewProjectConfigResult>;
  getQuestions(name: string, defaults: NewProjectConfigResult): InquirerQuestion[];
  getSafeEnv(): NodeJS.ProcessEnv;
  getGitBinary(): string;
  runScaffolding(
    name: string,
    config: NewProjectConfigResult,
    overwrite?: boolean
  ): Promise<unknown>;
  initializeGit(name: string): void;
}

const addOptions = (command: Command): void => {
  command.argument('<name>', 'Project name');
  command.option('--template <type>', 'Project template (basic, api, microservice)', 'basic');
  command.option('--database <type>', 'Database driver (sqlite, mysql, postgresql)', 'sqlite');
  command.option('--port <number>', 'Default port number', '3003');
  command.option('--author <name>', 'Project author');
  command.option('--description <text>', 'Project description');
  command.option('--interactive', 'Run in interactive mode', true);
  command.option('--no-interactive', 'Disable interactive mode');
  command.option('--no-git', 'Skip git initialization');
  command.option('--no-install', 'Skip dependency installation');
  command.option('--force', 'Overwrite existing directory');
  command.option('--overwrite', 'Overwrite existing directory');
};

const executeNewCommand = async (options: CommandOptions, command: INewCommand): Promise<void> => {
  try {
    const argName = options.args?.[0];
    const projectName = argName ?? (await PromptHelper.projectName('my-zintrust-app', true));
    if (!projectName) throw ErrorFactory.createCliError('Project name is required');

    const config = await command.getProjectConfig(projectName, options);

    command.info(chalk.bold(`\n🚀 Creating new Zintrust project in ${projectName}...\n`));

    const overwrite = options['overwrite'] === true || options['force'] === true ? true : undefined;
    const result = await command.runScaffolding(projectName, config, overwrite);

    if (isFailureResult(result)) {
      throw ErrorFactory.createCliError(result.message ?? 'Project scaffolding failed', result);
    }

    if (options['git'] !== false) {
      command.initializeGit(projectName);
    }

    if (options['install'] !== false) {
      const projectPath = path.resolve(process.cwd(), projectName);
      installDependencies(projectPath, command);
    }

    command.success(`\n✨ Project ${projectName} created successfully!`);
    command.info(`\nNext steps:\n  cd ${projectName}\n  npm run dev\n`);
  } catch (error) {
    throw ErrorFactory.createCliError(`Project creation failed: ${errorToMessage(error)}`, error);
  }
};

const createNewCommandInstance = (): INewCommand => {
  const base = BaseCommand.create({
    name: 'new',
    description: 'Create a new Zintrust project',
    addOptions,
    execute: async (_options: CommandOptions): Promise<void> => {
      // replaced below with NewCommand-aware execute implementation
    },
  });

  const commandInstance: INewCommand = {
    ...base,
    promptForConfig: async (
      name: string,
      options: CommandOptions
    ): Promise<NewProjectConfigResult> => {
      const config = await promptForConfig(name, options);
      return toConfigResult(config);
    },
    getSafeEnv: (): NodeJS.ProcessEnv => appConfig.getSafeEnv(),
    getGitBinary: (): string => getGitBinary(),
    getQuestions: (name: string, defaults: NewProjectConfigResult): InquirerQuestion[] => {
      const fullDefaults: NewProjectConfig = {
        name,
        template: defaults.template,
        database: defaults.database,
        port: defaults.port,
        author: defaults.author,
        description: defaults.description,
        interactive: true,
      };
      return getQuestions(name, fullDefaults);
    },
    getProjectConfig: async (
      name: string,
      options: CommandOptions
    ): Promise<NewProjectConfigResult> => {
      return commandInstance.promptForConfig(name, options);
    },
    runScaffolding: async (
      name: string,
      config: NewProjectConfigResult,
      overwrite?: boolean
    ): Promise<unknown> => {
      return ProjectScaffolder.scaffold(process.cwd(), {
        name,
        force: overwrite === true,
        template: config.template,
        database: config.database,
        port: config.port,
        author: config.author,
        description: config.description,
      });
    },
    initializeGit: (name: string): void => {
      const projectPath = path.resolve(process.cwd(), name);
      if (checkGitInstalled()) {
        initializeGitRepo(projectPath, commandInstance);
      }
    },
    execute: async (options: CommandOptions): Promise<void> => {
      await executeNewCommand(options, commandInstance);
    },
  };

  return commandInstance;
};

/**
 * New Command Factory
 * Sealed namespace for immutability
 */
export const NewCommand = Object.freeze({
  /**
   * Create a new project command instance
   */
  create(): INewCommand {
    return createNewCommandInstance();
  },
});
