/**
 * New Command
 * Create new Zintrust project with scaffolding
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { ProjectScaffolder } from '@cli/scaffolding/ProjectScaffolder';
import { Logger } from '@config/logger';
import { Command } from 'commander';

interface ProjectConfig {
  template: string;
  database: string;
  port: number;
  author: string;
  description: string;
}

export class NewCommand extends BaseCommand {
  constructor() {
    super();
    this.name = 'new';
    this.description = 'Create a new Zintrust project';
  }

  protected addOptions(command: Command): void {
    command
      .argument('<name>', 'Project name')
      .option('--template <name>', 'Project template (basic, api)', 'basic')
      .option('--database <type>', 'Database type (postgresql, mysql, sqlite)', 'postgresql')
      .option('--port <number>', 'Server port', '3000')
      .option('--author <name>', 'Author name')
      .option('--description <text>', 'Project description')
      .option('--interactive', 'Use interactive prompts')
      .option('--no-git', 'Skip git initialization')
      .option('--overwrite', 'Overwrite existing project');
  }

  async execute(options: CommandOptions): Promise<void> {
    const projectName = options.args?.[0];

    if (projectName === undefined || projectName === '') {
      throw new Error('Project name is required');
    }

    this.debug(`New command executed with project: ${projectName}`);

    try {
      this.info(`Creating new Zintrust project: ${projectName}`);

      // Get project configuration
      const config = await this.getProjectConfig(projectName, options);

      this.success(
        `Project configured with ${config.template} template, ${config.database} database on port ${config.port}`
      );

      // Execute scaffolding
      await this.runScaffolding(projectName, config, options['overwrite'] as boolean);

      // Initialize git if not disabled
      if (options['git'] !== false) {
        await this.initializeGit(projectName);
      }

      this.info(`\nNext steps:\n  cd ${projectName}\n  npm install\n  npm run dev`);
    } catch (error) {
      Logger.error('New command failed', error);
      throw new Error(`Project creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get project configuration from options or interactive prompts
   */
  private async getProjectConfig(
    projectName: string,
    options: CommandOptions
  ): Promise<ProjectConfig> {
    const config: ProjectConfig = {
      template: (options['template'] as string) ?? 'basic',
      database: (options['database'] as string) ?? 'postgresql',
      port: Number.parseInt((options['port'] as string) ?? '3000', 10),
      author: (options['author'] as string) ?? '',
      description: (options['description'] as string) ?? '',
    };

    // Use interactive prompts if requested or no interactive flag present
    if (options['interactive'] === true || options['template'] === undefined) {
      return this.promptForConfig(projectName, config);
    }

    return config;
  }

  /**
   * Prompt for project configuration
   */
  private async promptForConfig(
    projectName: string,
    defaults: ProjectConfig
  ): Promise<ProjectConfig> {
    this.debug('Prompting for configuration...');

    const prompter = new PromptHelper();
    const questions = this.getQuestions(projectName, defaults);
    const answers = await prompter.prompt(questions);

    return {
      template: answers['template'] as string,
      database: answers['database'] as string,
      port: Number.parseInt(answers['port'] as string, 10),
      author: answers['author'] as string,
      description: answers['description'] as string,
    };
  }

  /**
   * Get configuration questions
   */
  private getQuestions(projectName: string, defaults: ProjectConfig): unknown[] {
    return [
      {
        type: 'list',
        name: 'template',
        message: 'Select project template:',
        choices: ProjectScaffolder.getAvailableTemplates(),
        default: defaults.template,
      },
      {
        type: 'list',
        name: 'database',
        message: 'Select database:',
        choices: ['sqlite', 'postgresql', 'mysql'],
        default: defaults.database,
      },
      {
        type: 'input',
        name: 'port',
        message: 'Server port:',
        default: String(defaults.port),
        validate: (val: string): string | boolean => {
          const p = Number.parseInt(val, 10);
          return (p > 0 && p < 65536) || 'Must be between 1 and 65535';
        },
      },
      {
        type: 'input',
        name: 'author',
        message: 'Author name:',
        default: defaults.author === '' ? 'Your Name' : defaults.author,
      },
      {
        type: 'input',
        name: 'description',
        message: 'Project description:',
        default:
          defaults.description === ''
            ? `${projectName} - Zintrust Application`
            : defaults.description,
      },
    ];
  }

  /**
   * Run project scaffolding
   */
  private async runScaffolding(
    projectName: string,
    config: ProjectConfig,
    overwrite: boolean
  ): Promise<void> {
    this.info('Scaffolding project structure...');
    const scaffolder = new ProjectScaffolder(process.cwd());
    const result = await scaffolder.scaffold({
      name: projectName,
      ...config,
      overwrite,
    });

    if (result.success === false) {
      throw new Error(result.message);
    }

    this.success(
      `Project scaffolded: ${result.filesCreated} files, ${result.directoriesCreated} directories`
    );
  }

  /**
   * Initialize git repository
   */
  private async initializeGit(projectName: string): Promise<void> {
    this.info('Initializing git repository...');
    try {
      const { execSync } = await import('node:child_process');
      execSync(`cd ${projectName} && git init && git add . && git commit -m "Initial commit"`, {
        stdio: 'pipe',
      });
      this.success('Git initialized');
    } catch (error: unknown) {
      Logger.error('Git initialization failed', error);
      // Log error and continue - git is optional
      if (error instanceof Error && error.message !== '') {
        this.warn(`Git initialization failed: ${error.message}`);
      } else {
        this.warn('Git initialization failed (git may not be installed)');
      }
    }
  }
}
