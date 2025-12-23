/**
 * QA Command - Unified Quality Assurance
 * Runs linting, type-checking, tests, and SonarQube
 */

import { resolveNpmPath } from '@/common';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';

/**
 * QA Result interface
 */
interface QAResult {
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  output: string;
}

interface QAResults {
  lint: QAResult;
  typeCheck: QAResult;
  tests: QAResult;
  sonar: QAResult;
}

const createEmptyResult = (): QAResult => ({ status: 'pending', output: '' });

const createResults = (): QAResults => ({
  lint: createEmptyResult(),
  typeCheck: createEmptyResult(),
  tests: createEmptyResult(),
  sonar: createEmptyResult(),
});

const errorToMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
};

const runNpmScript = (name: string, script: string, result: QAResult): boolean => {
  try {
    Logger.info(`Running npm run ${script}...`);

    const npmPath = resolveNpmPath();
    const output = execFileSync(npmPath, ['run', script], { stdio: 'inherit' });
    result.status = 'passed';
    result.output = output?.toString() ?? '';
    return true;
  } catch (error) {
    result.status = 'failed';
    result.output = errorToMessage(error);
    Logger.error(`${name} failed`, error);
    Logger.warn(`${name} failed`);
    return false;
  }
};

const runSonarIfEnabled = (result: QAResult, options: CommandOptions): boolean => {
  if (options['sonar'] === false) {
    result.status = 'skipped';
    result.output = '';
    return true;
  }
  return runNpmScript('Sonar', 'sonarqube', result);
};

const allStepsPassed = (results: QAResults): boolean => {
  return (
    results.lint.status !== 'failed' &&
    results.typeCheck.status !== 'failed' &&
    results.tests.status !== 'failed' &&
    results.sonar.status !== 'failed'
  );
};

interface IQACommand extends IBaseCommand {
  addOptions(command: Command): void;
  runLint(result: QAResult): Promise<void>;
  runTypeCheck(result: QAResult): Promise<void>;
  runTests(result: QAResult): Promise<void>;
  runSonar(result: QAResult, options: CommandOptions): Promise<void>;
  generateReport(results: QAResults): Promise<void>;
}

/**
 * QA Command Factory
 */
export const QACommand = Object.freeze({
  /**
   * Create a new QA command instance
   */
  create(): IQACommand {
    const addOptions = (command: Command): void => {
      command.option('--no-sonar', 'Skip SonarQube analysis');
      command.option('--report', 'Generate QA report');
    };

    const cmd = BaseCommand.create({
      name: 'qa',
      description: 'Run full Quality Assurance suite',
      addOptions,
      execute: async (_options: CommandOptions) => {
        // replaced below with QA-aware execute implementation
      },
    });

    const qa: IQACommand = {
      ...cmd,
      addOptions,
      runLint: async (result: QAResult): Promise<void> => {
        runNpmScript('Lint', 'lint', result);
      },
      runTypeCheck: async (result: QAResult): Promise<void> => {
        runNpmScript('Type Check', 'type-check', result);
      },
      runTests: async (result: QAResult): Promise<void> => {
        runNpmScript('Tests', 'test', result);
      },
      runSonar: async (result: QAResult, options: CommandOptions): Promise<void> => {
        runSonarIfEnabled(result, options);
      },
      generateReport: async (_results: QAResults): Promise<void> => {
        Logger.info('Generating QA report...');
      },
      execute: async (options: CommandOptions): Promise<void> => {
        try {
          qa.info('Starting Zintrust QA Suite...');
          const results = createResults();

          await qa.runLint(results.lint);
          await qa.runTypeCheck(results.typeCheck);
          await qa.runTests(results.tests);
          await qa.runSonar(results.sonar, options);

          if (options['report'] === true) {
            await qa.generateReport(results);
          }

          if (allStepsPassed(results)) {
            qa.success('QA Suite passed successfully!');
          } else {
            qa.warn('QA Suite completed with some failures.');
          }
        } catch (error) {
          Logger.error('QA Suite execution failed', error);
          qa.debug(error);
          throw error;
        }
      },
    };

    return qa;
  },
});
