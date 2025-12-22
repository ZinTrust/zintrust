/**
 * Project Scaffolder
 * Orchestrates project scaffolding workflow
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import {
  BUILT_IN_TEMPLATES,
  Template,
  TemplateEngine,
  TemplateVariables,
} from '@cli/scaffolding/TemplateEngine';
import { Logger } from '@config/logger';
import path from 'node:path';

export interface ProjectOptions {
  name: string;
  template?: string;
  author?: string;
  description?: string;
  port?: number;
  database?: string;
  overwrite?: boolean;
}

export interface ScaffoldingResult {
  success: boolean;
  projectPath: string;
  filesCreated: number;
  directoriesCreated: number;
  message: string;
  error?: Error;
}

/**
 * Project scaffolder for creating new Zintrust projects
 */
export class ProjectScaffolder {
  private template?: Template;
  private variables: TemplateVariables = {};
  private projectPath: string = '';

  /**
   * Get available templates
   */
  static getAvailableTemplates(): string[] {
    return Object.keys(BUILT_IN_TEMPLATES);
  }

  /**
   * Get template by name
   */
  static getTemplate(name: string): Template | undefined {
    return BUILT_IN_TEMPLATES[name];
  }

  /**
   * Create new project scaffolder
   */
  constructor(private readonly baseDir: string = process.cwd()) {}

  /**
   * Validate project options
   */
  validateOptions(options: ProjectOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.name === undefined || options.name.trim() === '') {
      errors.push('Project name is required');
    }

    if (options.name !== undefined && /^[a-z\d\-_]+$/.test(options.name) === false) {
      errors.push(
        'Project name must contain only lowercase letters, numbers, hyphens, and underscores'
      );
    }

    if (
      options.template !== undefined &&
      options.template !== '' &&
      ProjectScaffolder.getTemplate(options.template) === undefined
    ) {
      errors.push(`Template "${options.template}" not found`);
    }

    if (options.port !== undefined) {
      if (typeof options.port !== 'number' || options.port < 1 || options.port > 65535) {
        errors.push('Port must be a number between 1 and 65535');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Prepare scaffolding context
   */
  prepareContext(options: ProjectOptions): void {
    // Set project path
    this.projectPath = path.join(this.baseDir, options.name);

    // Load template
    const templateName = options.template ?? 'basic';
    this.template = ProjectScaffolder.getTemplate(templateName);

    if (this.template === undefined) {
      throw new Error(`Template "${templateName}" not found`);
    }

    // Set up template variables
    this.variables = {
      projectName: options.name,
      projectSlug: options.name.toLowerCase().replaceAll(/\s+/g, '-'),
      description: options.description ?? `${options.name} - Zintrust Application`,
      author: options.author ?? 'Your Name',
      port: options.port ?? 3000,
      database: options.database ?? 'sqlite',
      year: new Date().getFullYear(),
      timestamp: new Date().toISOString(),
    };

    Logger.info(`Prepared scaffolding context for project: ${options.name}`);
  }

  /**
   * Check if project directory already exists
   */
  projectDirectoryExists(): boolean {
    return FileGenerator.directoryExists(this.projectPath);
  }

  /**
   * Create project directories
   */
  createDirectories(): number {
    if (this.template === undefined) {
      throw new Error('Template not initialized');
    }

    const dirsToCreate = this.template.directories.map((dir) =>
      TemplateEngine.renderPath(dir, this.variables)
    );

    FileGenerator.createDirectories(dirsToCreate, this.projectPath);
    Logger.info(`Created ${dirsToCreate.length} directories`);

    return dirsToCreate.length;
  }

  /**
   * Create project files
   */
  createFiles(overwrite = false): number {
    if (this.template === undefined) {
      throw new Error('Template not initialized');
    }

    const filesToCreate = this.template.files.map((file) => ({
      path: TemplateEngine.renderPath(file.path, this.variables),
      content:
        file.isTemplate === true
          ? TemplateEngine.renderContent(file.content, this.variables)
          : file.content,
    }));

    const count = FileGenerator.writeFiles(filesToCreate, this.projectPath, { overwrite });
    Logger.info(`Created ${count} files`);

    return count;
  }

  /**
   * Create configuration file
   */
  createConfigFile(): boolean {
    const configPath = path.join(this.projectPath, '.zintrust.json');

    const config = {
      name: this.variables['projectName'],
      version: '1.0.0',
      description: this.variables['projectDescription'],
      author: this.variables['author'],
      database: {
        connection: this.variables['database'],
        host: 'localhost',
        port: this.variables['database'] === 'postgres' ? 5432 : undefined,
        database: `${this.variables['projectSlug']}_db`,
        user: 'postgres',
      },
      server: {
        port: this.variables['port'],
        host: '0.0.0.0',
      },
      microservices: {
        enabled: false,
      },
      features: {
        authentication: true,
        authorization: true,
        profiling: true,
      },
    };

    try {
      FileGenerator.writeFile(configPath, JSON.stringify(config, null, 2));
      Logger.info('Created .zintrust.json configuration');
      return true;
    } catch (error) {
      Logger.error('Failed to create .zintrust.json:', error);
      return false;
    }
  }

  /**
   * Create environment file
   */
  createEnvFile(): boolean {
    const envPath = path.join(this.projectPath, '.env');

    let envContent = `NODE_ENV=development\n`;
    envContent += `APP_NAME=${this.variables['projectName']}\n`;
    envContent += `APP_PORT=${this.variables['port']}\n`;
    envContent += `APP_DEBUG=true\n`;
    envContent += `DB_CONNECTION=${this.variables['database']}\n`;

    if (this.variables['database'] === 'postgresql' || this.variables['database'] === 'postgres') {
      envContent += `DB_HOST=localhost\n`;
      envContent += `DB_PORT=5432\n`;
      envContent += `DB_DATABASE=${this.variables['projectSlug']}_db\n`;
      envContent += `DB_USERNAME=postgres\n`;
      envContent += `DB_PASSWORD=password\n`;
    } else {
      envContent += `DB_DATABASE=./database.sqlite\n`;
    }

    try {
      FileGenerator.writeFile(envPath, envContent);
      Logger.info('Created .env file');
      return true;
    } catch (error) {
      Logger.error('Failed to create .env:', error);
      return false;
    }
  }

  /**
   * Run complete scaffolding workflow
   */
  async scaffold(options: ProjectOptions): Promise<ScaffoldingResult> {
    try {
      // Validate options
      const validation = this.validateOptions(options);
      if (!validation.valid) {
        return {
          success: false,
          projectPath: '',
          filesCreated: 0,
          directoriesCreated: 0,
          message: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }

      // Prepare context
      this.prepareContext(options);

      // Check if project directory exists
      if (this.projectDirectoryExists() && options.overwrite !== true) {
        return {
          success: false,
          projectPath: this.projectPath,
          filesCreated: 0,
          directoriesCreated: 0,
          message: `Project directory already exists: ${this.projectPath}. Use --overwrite to replace.`,
        };
      }

      // Create root directory
      FileGenerator.createDirectory(this.projectPath);

      // Create directories
      const directoriesCreated = this.createDirectories();

      // Create files
      const filesCreated = this.createFiles(options.overwrite);

      // Create configuration
      this.createConfigFile();

      // Create environment file
      this.createEnvFile();

      Logger.info(`✅ Project scaffolding complete: ${this.projectPath}`);

      return {
        success: true,
        projectPath: this.projectPath,
        filesCreated,
        directoriesCreated,
        message: `Project "${options.name}" created successfully at ${this.projectPath}`,
      };
    } catch (error) {
      Logger.error('Project scaffolding failed:', error);

      return {
        success: false,
        projectPath: this.projectPath,
        filesCreated: 0,
        directoriesCreated: 0,
        message: `Scaffolding failed: ${(error as Error).message}`,
        error: error as Error,
      };
    }
  }

  /**
   * Get scaffolded project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get prepared variables
   */
  getVariables(): TemplateVariables {
    return { ...this.variables };
  }

  /**
   * Get template information
   */
  getTemplateInfo(): Template | undefined {
    return this.template;
  }
}
