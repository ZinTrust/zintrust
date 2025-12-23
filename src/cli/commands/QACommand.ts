/**
 * QA Command - Unified Quality Assurance
 * Runs linting, type-checking, tests, and SonarQube
 */

import { resolveNpmPath } from '@/common';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'passed':
      return '✓';
    case 'failed':
      return '✗';
    case 'skipped':
      return '⊘';
    default:
      return '○';
  }
};

const getScanItemHTML = (
  name: string,
  result: QAResult,
  description: string,
  extra: string = ''
): string => {
  return `
                <div class="scan-item ${result.status}">
                    <div class="scan-header">
                        <div class="scan-title">
                            <div class="status-icon ${result.status}">${getStatusIcon(result.status)}</div>
                            <span>${name}</span>
                        </div>
                        <span class="status-badge ${result.status}">${result.status}</span>
                    </div>
                    <div class="scan-details">
                        ${description}
                        ${extra}
                    </div>
                </div>`;
};

const getSummaryItemHTML = (label: string, status: string): string => {
  const icon = getStatusIcon(status);
  return `
                <div class="summary-item">
                    <div class="summary-value">${icon}</div>
                    <div class="summary-label">${label}</div>
                </div>`;
};

const getScanDescription = (type: keyof QAResults, status: string): string => {
  const descriptions: Record<string, Record<string, string>> = {
    lint: {
      passed: 'No code style issues found.',
      failed: 'Code style issues detected. Check output for details.',
      skipped: 'Linting scan skipped.',
    },
    typeCheck: {
      passed: 'All type checks passed successfully.',
      failed: 'Type errors detected. Check output for details.',
      skipped: 'Type check scan skipped.',
    },
    tests: {
      passed: 'All unit tests passed with coverage report generated.',
      failed: 'Some unit tests failed. Check output for details.',
      skipped: 'Unit tests scan skipped.',
    },
    sonar: {
      passed: 'Code quality analysis completed.',
      failed: 'Code quality issues detected. Check SonarQube dashboard for details.',
      skipped: 'SonarQube analysis skipped (use --no-sonar to disable).',
    },
  };

  return descriptions[type]?.[status] || 'Scan pending or unknown status.';
};

/**
 * Generate QA report HTML
 */
const generateQAReport = (results: QAResults): string => {
  const timestamp = new Date().toLocaleString();

  const lintDesc = getScanDescription('lint', results.lint.status);
  const typeDesc = getScanDescription('typeCheck', results.typeCheck.status);
  const testDesc = getScanDescription('tests', results.tests.status);
  const sonarDesc = getScanDescription('sonar', results.sonar.status);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zintrust QA Report</title>
    <link rel="stylesheet" href="base.css">
</head>
<body class="qa-body">
    <div class="container">
        <div class="header">
            <h1>🎯 Zintrust QA Report</h1>
            <p>Quality Assurance Suite Results</p>
        </div>

        <div class="content">
            <div class="timestamp">
                Generated on ${timestamp}
            </div>

            <div class="summary">
                ${getSummaryItemHTML('Lint', results.lint.status)}
                ${getSummaryItemHTML('Type Check', results.typeCheck.status)}
                ${getSummaryItemHTML('Tests', results.tests.status)}
                ${getSummaryItemHTML('Sonar', results.sonar.status)}
            </div>

            <div style="margin-top: 30px;">
                ${getScanItemHTML('ESLint (Linting)', results.lint, lintDesc)}
                ${getScanItemHTML('TypeScript Compiler (Type Check)', results.typeCheck, typeDesc)}
                ${getScanItemHTML('Vitest (Unit Tests)', results.tests, testDesc, '<br><a href="index.html" class="coverage-link" style="display: inline-block; margin-top: 10px;">View Coverage Report</a>')}
                ${getScanItemHTML('SonarQube (Code Quality)', results.sonar, sonarDesc)}
            </div>
        </div>

        <div class="footer">
            <p>Zintrust Framework QA Suite | Generated automatically</p>
        </div>
    </div>
</body>
</html>`;
};

/**
 * Open HTML file in default browser
 */
const openInBrowser = (filePath: string): void => {
  try {
    const absolutePath = resolve(filePath);
    if (!existsSync(absolutePath)) {
      Logger.warn(`File not found: ${filePath}`);
      return;
    }

    const fileUrl = `file://${absolutePath}`;

    // macOS
    if (process.platform === 'darwin') {
      execSync(`open "${fileUrl}"`);
    }
    // Linux
    else if (process.platform === 'linux') {
      execSync(`xdg-open "${fileUrl}"`);
    }
    // Windows
    else if (process.platform === 'win32') {
      execSync(`start "${fileUrl}"`);
    }

    Logger.info(`Opened: ${filePath}`);
  } catch (error) {
    Logger.error('Could not open browser', error);
  }
};

interface IQACommand extends IBaseCommand {
  addOptions(command: Command): void;
  runLint(result: QAResult): Promise<void>;
  runTypeCheck(result: QAResult): Promise<void>;
  runTests(result: QAResult): Promise<void>;
  runSonar(result: QAResult, options: CommandOptions): Promise<void>;
  generateReport(results: QAResults): Promise<void>;
}

const runLint = async (result: QAResult): Promise<void> => {
  runNpmScript('Lint', 'lint', result);
};

const runTypeCheck = async (result: QAResult): Promise<void> => {
  runNpmScript('Type Check', 'type-check', result);
};

const runTests = async (result: QAResult): Promise<void> => {
  runNpmScript('Tests', 'test:coverage', result);
};

const runSonar = async (result: QAResult, options: CommandOptions): Promise<void> => {
  runSonarIfEnabled(result, options);
};

const generateReport = async (results: QAResults): Promise<void> => {
  Logger.info('Generating QA report...');

  // Generate HTML report with QA results and coverage
  const htmlContent = generateQAReport(results);
  const reportPath = 'coverage/qa-report.html';

  try {
    const fs = await import('node:fs/promises');
    await fs.writeFile(reportPath, htmlContent);
    Logger.info(`QA report generated: ${reportPath}`);
  } catch (error) {
    Logger.error('Failed to generate QA report', error);
  }
};

const executeQA = async (qa: IQACommand, options: CommandOptions): Promise<void> => {
  try {
    qa.info('Starting Zintrust QA Suite...');
    const results = createResults();

    await qa.runLint(results.lint);
    await qa.runTypeCheck(results.typeCheck);

    // Run tests with coverage report
    qa.info('Generating test coverage report...');
    await qa.runTests(results.tests);

    await qa.runSonar(results.sonar, options);

    // Always generate report to show QA suite results
    await qa.generateReport(results);

    if (allStepsPassed(results)) {
      qa.success('QA Suite passed successfully!');
    } else {
      qa.warn('QA Suite completed with some failures.');
    }

    // Open QA report in browser by default (unless --no-open is set)
    if (options['open'] !== false) {
      const reportPath = 'coverage/qa-report.html';
      if (existsSync(reportPath)) {
        qa.info('Opening QA report...');
        openInBrowser(reportPath);
      }
    }
  } catch (error) {
    Logger.error('QA Suite execution failed', error);
    qa.debug(error);
    throw error;
  }
};

/**
 * QA Command Factory - Create a new QA command instance
 */
export const QACommand = (): IQACommand => {
  const addOptions = (command: Command): void => {
    command.option('--no-sonar', 'Skip SonarQube analysis');
    command.option('--report', 'Generate QA report (with coverage)');
    command.option('--no-open', 'Do not open coverage report in browser');
  };

  const cmd = BaseCommand.create({
    name: 'qa',
    description: 'Run full Quality Assurance suite',
    addOptions,
    execute: (options) => executeQA(qa, options),
  });

  const qa: IQACommand = {
    ...cmd,
    addOptions,
    runLint,
    runTypeCheck,
    runTests,
    runSonar,
    generateReport,
    execute: (options) => executeQA(qa, options),
  };

  return qa;
};
