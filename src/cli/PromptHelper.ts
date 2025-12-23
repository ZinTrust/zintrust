/**
 * Prompt Helper - Interactive CLI Prompts
 * Provides reusable prompt utilities using inquirer
 */

import inquirer from 'inquirer';

export interface PromptOptions {
  interactive?: boolean;
  defaults?: Record<string, unknown>;
}

/**
 * Prompt Helper Factory
 * Sealed namespace for immutability
 */
export const PromptHelper = Object.freeze({
  /**
   * Generic prompt method for custom questions
   */
  async prompt(questions: unknown): Promise<Record<string, unknown>> {
    return (inquirer as { prompt: (q: unknown) => Promise<Record<string, unknown>> }).prompt(
      questions
    );
  },

  /**
   * Ask for project name
   */
  async projectName(defaultName?: string, interactive: boolean = true): Promise<string> {
    if (!interactive && defaultName !== undefined && defaultName !== '') {
      return defaultName;
    }

    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: defaultName ?? 'my-zintrust-app',
        validate: (input: string): string | boolean => {
          if (!input.trim()) return 'Project name cannot be empty';
          if (!/^[a-z\d\-_]+$/i.test(input))
            return 'Project name can only contain letters, numbers, hyphens, and underscores';
          return true;
        },
      },
    ]);

    return answer.projectName;
  },

  /**
   * Ask for database type
   */
  async databaseType(
    defaultDb: string = 'postgresql',
    interactive: boolean = true
  ): Promise<string> {
    if (!interactive) {
      return defaultDb;
    }

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'database',
        message: 'Select database:',
        choices: [
          { name: 'PostgreSQL (recommended)', value: 'postgresql' },
          { name: 'MySQL', value: 'mysql' },
          { name: 'SQLite', value: 'sqlite' },
        ],
        default: defaultDb,
      },
    ]);

    return answer.database;
  },

  /**
   * Ask for port number
   */
  async port(defaultPort: number = 3000, interactive: boolean = true): Promise<number> {
    if (!interactive) {
      return defaultPort;
    }

    const answer = await inquirer.prompt([
      {
        type: 'number',
        name: 'port',
        message: 'Server port:',
        default: defaultPort,
        validate: (input: number): string | boolean => {
          if (input < 1 || input > 65535) return 'Port must be between 1 and 65535';
          return true;
        },
      },
    ]);

    return answer.port;
  },

  /**
   * Ask for feature selection
   */
  async selectFeatures(
    availableFeatures: string[] = ['auth', 'payments', 'notifications'],
    interactive: boolean = true
  ): Promise<string[]> {
    if (!interactive) {
      return availableFeatures.slice(0, 1);
    }

    const answer = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to include:',
        choices: availableFeatures,
        default: [],
      },
    ]);

    return answer.features;
  },

  /**
   * Confirm action
   */
  async confirm(
    message: string,
    defaultConfirm: boolean = true,
    interactive: boolean = true
  ): Promise<boolean> {
    if (!interactive) {
      return defaultConfirm;
    }

    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultConfirm,
      },
    ]);

    return answer.confirmed;
  },

  /**
   * Choose from list
   */
  async chooseFrom(
    message: string,
    choices: string[],
    defaultChoice: string = choices[0],
    interactive: boolean = true
  ): Promise<string> {
    if (!interactive) {
      return defaultChoice;
    }

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message,
        choices,
        default: defaultChoice,
      },
    ]);

    return answer.choice;
  },

  /**
   * Get text input
   */
  async textInput(
    message: string,
    defaultValue: string = '',
    interactive: boolean = true
  ): Promise<string> {
    if (!interactive) {
      return defaultValue;
    }

    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message,
        default: defaultValue,
      },
    ]);

    return answer.input;
  },
});
