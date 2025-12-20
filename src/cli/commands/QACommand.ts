/**
 * QA Command - Unified Quality Assurance
 * Runs linting, type-checking, tests, and SonarQube
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

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

export class QACommand extends BaseCommand {
  protected name = 'qa';
  protected description = 'Run full Quality Assurance suite (Lint, Type-check, Test, Sonar)';

  protected addOptions(command: Command): void {
    command.option('--no-sonar', 'Skip SonarQube analysis');
    command.option('--report', 'Generate and open HTML report', true);
  }

  public async execute(options: CommandOptions): Promise<void> {
    this.info('Starting Zintrust QA Suite...');

    const results: QAResults = {
      lint: { status: 'pending', output: '' },
      typeCheck: { status: 'pending', output: '' },
      tests: { status: 'pending', output: '' },
      sonar: { status: 'pending', output: '' },
    };

    try {
      await this.runLint(results.lint);
      await this.runTypeCheck(results.typeCheck);
      await this.runTests(results.tests);
      await this.runSonar(results.sonar, options);

      if (options['report'] === true) {
        this.generateReport(results);
      }

      const allPassed = Object.values(results).every(
        (r) => r.status === 'passed' || r.status === 'skipped'
      );
      if (allPassed) {
        this.success('QA Suite passed successfully!');
      } else {
        this.warn('QA Suite completed with some failures. Check the report.');
      }
    } catch (error) {
      Logger.error('QA Command critical failure', error);
      this.debug(`QA Command Error: ${(error as Error).message}`);
      throw error;
    }
  }

  private async runLint(result: QAResult): Promise<void> {
    this.info('Step 1/4: Running ESLint...');
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as { stdout?: Buffer; message: string };
      result.status = 'failed';
      result.output = error.stdout === undefined ? error.message : error.stdout.toString();
      Logger.error('QA Suite: Linting failed', error);
    }
  }

  private async runTypeCheck(result: QAResult): Promise<void> {
    this.info('Step 2/4: Running Type-check...');
    try {
      execSync('npm run type-check', { stdio: 'pipe' });
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as { stdout?: Buffer; message: string };
      result.status = 'failed';
      result.output = error.stdout === undefined ? error.message : error.stdout.toString();
      Logger.error('QA Suite: Type-check failed', error);
    }
  }

  private async runTests(result: QAResult): Promise<void> {
    this.info('Step 3/4: Running Tests & Coverage...');
    try {
      execSync('npm run test:coverage', { stdio: 'pipe' });
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as { stdout?: Buffer; message: string };
      result.status = 'failed';
      result.output = error.stdout === undefined ? error.message : error.stdout.toString();
      Logger.error('QA Suite: Tests failed', error);
    }
  }

  private async runSonar(result: QAResult, options: CommandOptions): Promise<void> {
    if (options['sonar'] === false) {
      result.status = 'skipped';
      return;
    }

    this.info('Step 4/4: Running SonarQube Analysis...');
    const isSonarRunning = await this.checkSonarQube();

    if (isSonarRunning) {
      try {
        execSync('npm run sonarqube', { stdio: 'pipe' });
        result.status = 'passed';
      } catch (e: unknown) {
        const error = e as { stdout?: Buffer; message: string };
        result.status = 'failed';
        result.output = error.stdout === undefined ? error.message : error.stdout.toString();
        Logger.error('QA Suite: SonarQube failed', error);
      }
    } else {
      result.status = 'failed';
      result.output =
        'SonarQube is not running locally on port 9000. Please start it using "npm run docker:up" or follow the setup guide.';
      this.warn('SonarQube is not running. Skipping analysis.');
    }
  }

  /**
   * Check if SonarQube is running on port 9000
   */
  private async checkSonarQube(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 2000;

      socket.setTimeout(timeout);
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(9000, '127.0.0.1', () => {
        socket.end();
        resolve(true);
      });
    });
  }

  private generateReport(results: QAResults): void {
    const reportDir = path.join(process.cwd(), 'coverage');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, 'qa-report.html');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zintrust QA Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0f172a; color: #e2e8f0; }
        .card { background-color: #1e293b; border: 1px solid #334155; }
        .status-passed { color: #10b981; }
        .status-failed { color: #ef4444; }
        .status-skipped { color: #94a3b8; }
    </style>
</head>
<body class="p-8">
    <div class="max-w-4xl mx-auto">
        <header class="mb-8 flex justify-between items-center">
            <h1 class="text-3xl font-bold text-white">Zintrust QA Dashboard</h1>
            <span class="text-sm text-slate-400">Generated: ${new Date().toLocaleString()}</span>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            ${Object.entries(results)
              .map(
                ([key, data]: [string, QAResult]) => `
                <div class="card p-6 rounded-lg shadow-xl">
                    <h2 class="text-xl font-semibold capitalize mb-2">${key}</h2>
                    <div class="flex items-center">
                        <span class="text-lg font-bold status-${data.status}">${data.status.toUpperCase()}</span>
                    </div>
                    ${data.output ? `<pre class="mt-4 p-3 bg-black rounded text-xs overflow-x-auto text-red-400">${data.output}</pre>` : ''}
                </div>
            `
              )
              .join('')}
        </div>

        <footer class="text-center text-slate-500 text-sm">
            &copy; ${new Date().getFullYear()} Zintrust Framework. All rights reserved.
        </footer>
    </div>
</body>
</html>
    `;

    try {
      fs.writeFileSync(reportPath, html);
      this.info(`QA Report generated at: ${reportPath}`);

      // Try to open the report
      let command = 'xdg-open';
      if (process.platform === 'win32') {
        command = 'start';
      } else if (process.platform === 'darwin') {
        command = 'open';
      }

      execSync(`${command} ${reportPath}`);
    } catch (error) {
      Logger.error('Failed to generate or open QA report', error);
      this.warn('Could not automatically open the report.');
    }
  }
}
