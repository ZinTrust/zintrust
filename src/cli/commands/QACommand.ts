/**
 * QA Command - Unified Quality Assurance
 * Runs linting, type-checking, tests, and SonarQube
 */

import { resolveNpmPath } from '@/common';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import { existsSync } from '@node-singletons/fs';
import { resolve } from '@node-singletons/path';
import { Command } from 'commander';

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

const QA_REPORT_CSS = `
:root {
  --qa-bg: #f8fafc;
  --qa-panel: #ffffff;
  --qa-text: #0f172a;
  --qa-muted: #64748b;
  --qa-border: #e2e8f0;
  --qa-accent: #667eea;
  --qa-success: #16a34a;
  --qa-danger: #dc2626;
  --qa-warn: #f59e0b;
}

body.qa-body {
  margin: 0;
  color: var(--qa-text);
  background: var(--qa-bg);
}

.qa-shell {
  max-width: 980px;
  margin: 48px auto;
  padding: 0 20px;
}

.qa-panel {
  border: 1px solid var(--qa-border);
  border-radius: 14px;
  background: var(--qa-panel);
  overflow: hidden;
}

.qa-hero {
  padding: 28px 28px 18px;
  border-bottom: 1px solid var(--qa-border);
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.10), rgba(255, 255, 255, 0));
}

.qa-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.qa-subtitle {
  margin: 8px 0 0;
  color: var(--qa-muted);
  font-size: 14px;
}

.qa-meta {
  margin-top: 12px;
  color: var(--qa-muted);
  font-size: 12px;
}

.qa-content {
  padding: 22px 28px 28px;
}

.qa-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--qa-border);
  border-radius: 12px;
  background: #fff;
}

@media (max-width: 800px) {
  .qa-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.qa-summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px;
  border-radius: 10px;
  background: #f1f5f9;
}

.qa-summary-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--qa-accent);
  line-height: 1;
  margin-bottom: 6px;
}

.qa-summary-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--qa-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.qa-scan-list {
  margin-top: 18px;
  display: grid;
  gap: 12px;
}

.qa-scan-item {
  border: 1px solid var(--qa-border);
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
}

.qa-scan-item.passed { border-left: 4px solid var(--qa-success); }
.qa-scan-item.failed { border-left: 4px solid var(--qa-danger); }
.qa-scan-item.skipped { border-left: 4px solid var(--qa-warn); }
.qa-scan-item.pending { border-left: 4px solid var(--qa-border); }

.qa-scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
}

.qa-scan-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 14px;
}

.qa-status-icon {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 800;
  font-size: 12px;
}

.qa-status-icon.passed { background: var(--qa-success); }
.qa-status-icon.failed { background: var(--qa-danger); }
.qa-status-icon.skipped { background: var(--qa-warn); }
.qa-status-icon.pending { background: #94a3b8; }

.qa-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.qa-status-badge.passed { background: #dcfce7; color: #14532d; }
.qa-status-badge.failed { background: #fee2e2; color: #7f1d1d; }
.qa-status-badge.skipped { background: #fef3c7; color: #78350f; }
.qa-status-badge.pending { background: #e2e8f0; color: #334155; }

.qa-scan-details {
  padding: 0 14px 14px;
  color: var(--qa-muted);
  font-size: 13px;
  line-height: 1.55;
}

.qa-actions {
  margin-top: 10px;
}

.qa-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--qa-accent);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  text-decoration: none;
}

.qa-link:hover {
  text-decoration: none;
  filter: brightness(0.98);
}

.qa-footer {
  border-top: 1px solid var(--qa-border);
  padding: 14px 28px;
  color: var(--qa-muted);
  font-size: 12px;
  background: #fff;
}
`;

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
    ErrorFactory.createTryCatchError(`${name} failed`, error);
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
        <div class="qa-scan-item ${result.status}">
          <div class="qa-scan-header">
            <div class="qa-scan-title">
              <div class="qa-status-icon ${result.status}">${getStatusIcon(result.status)}</div>
              <span>${name}</span>
            </div>
            <span class="qa-status-badge ${result.status}">${result.status}</span>
          </div>
          <div class="qa-scan-details">
            ${description}
            ${extra}
          </div>
        </div>`;
};

const getSummaryItemHTML = (label: string, status: string): string => {
  const icon = getStatusIcon(status);
  return `
        <div class="qa-summary-item">
          <div class="qa-summary-value">${icon}</div>
          <div class="qa-summary-label">${label}</div>
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
    <link rel="stylesheet" href="qa-report.css">
</head>
<body class="qa-body">
    <main class="qa-shell">
      <section class="qa-panel">
        <header class="qa-hero">
          <h1 class="qa-title">Zintrust QA Report</h1>
          <p class="qa-subtitle">Quality Assurance Suite Results</p>
          <div class="qa-meta">Generated on ${timestamp}</div>
        </header>

        <div class="qa-content">
          <div class="qa-summary">
            ${getSummaryItemHTML('Lint', results.lint.status)}
            ${getSummaryItemHTML('Type Check', results.typeCheck.status)}
            ${getSummaryItemHTML('Tests', results.tests.status)}
            ${getSummaryItemHTML('Sonar', results.sonar.status)}
          </div>

          <div class="qa-scan-list">
            ${getScanItemHTML('ESLint (Linting)', results.lint, lintDesc)}
            ${getScanItemHTML('TypeScript Compiler (Type Check)', results.typeCheck, typeDesc)}
            ${getScanItemHTML(
              'Vitest (Unit Tests)',
              results.tests,
              testDesc,
              '<div class="qa-actions"><a href="index.html" class="qa-link">View Coverage Report</a></div>'
            )}
            ${getScanItemHTML('SonarQube (Code Quality)', results.sonar, sonarDesc)}
          </div>
        </div>

        <footer class="qa-footer">Zintrust Framework QA Suite | Generated automatically</footer>
      </section>
    </main>
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
      execFileSync('open', [fileUrl]); //NOSONAR
    }
    // Linux
    else if (process.platform === 'linux') {
      execFileSync('xdg-open', [fileUrl]); //NOSONAR
    }
    // Windows
    else if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'start', '""', fileUrl]); //NOSONAR
    }

    Logger.info(`Opened: ${filePath}`);
  } catch (error) {
    ErrorFactory.createTryCatchError('Could not open browser', error);
  }
};

interface IQACommand extends IBaseCommand {
  addOptions(command: Command): void;
  runLint(result: QAResult): Promise<void>;
  runTypeCheck(result: QAResult): Promise<void>;
  runTests(result: QAResult): Promise<void>;
  runSonar(result: QAResult, options: CommandOptions): void;
  generateReport(results: QAResults): Promise<void>;
}

const runLint = async (result: QAResult): Promise<void> => {
  await runNpmScript('Lint', 'lint', result); // NOSONAR await needed for proper async handling when plugin used
};

const runTypeCheck = async (result: QAResult): Promise<void> => {
  await runNpmScript('Type Check', 'type-check', result); // NOSONAR
};

const runTests = async (result: QAResult): Promise<void> => {
  await runNpmScript('Tests', 'test:coverage', result); // NOSONAR
};

const runSonar = (result: QAResult, options: CommandOptions): void => {
  runSonarIfEnabled(result, options);
};

const generateReport = async (results: QAResults): Promise<void> => {
  Logger.info('Generating QA report...');

  // Generate HTML report with QA results and coverage
  const htmlContent = generateQAReport(results);
  const reportPath = 'coverage/qa-report.html';
  const reportCssPath = 'coverage/qa-report.css';

  try {
    const fs = await import('node:fs/promises');
    await fs.writeFile(reportPath, htmlContent);
    await fs.writeFile(reportCssPath, QA_REPORT_CSS);
    Logger.info(`QA report generated: ${reportPath}`);
  } catch (error) {
    ErrorFactory.createTryCatchError('Failed to generate QA report', error);
  }
};

const addOptions = (command: Command): void => {
  command.option('--no-sonar', 'Skip SonarQube analysis');
  command.option('--report', 'Generate QA report (with coverage)');
  command.option('--no-open', 'Do not open coverage report in browser');
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

    qa.runSonar(results.sonar, options);

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
    ErrorFactory.createTryCatchError('QA Suite execution failed', error);
    qa.debug(error);
    throw error;
  }
};

/**
 * QA Command Factory - Create a new QA command instance
 */
export const QACommand = (): IQACommand => {
  const cmd = BaseCommand.create({
    name: 'qa',
    description: 'Run full Quality Assurance suite',
    addOptions,
    execute: async (options) => executeQA(qa, options),
  });

  const qa = {
    ...cmd,
    addOptions,
    runLint,
    runTypeCheck,
    runTests,
    runSonar,
    generateReport,
  };

  return qa;
};
