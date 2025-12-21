/**
 * QA Command - Unified Quality Assurance
 * Runs linting, type-checking, tests, and SonarQube
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

type ExecOutput = Buffer | string | null | undefined;

interface SonarMeasure {
  metric: string;
  value: string;
}

interface SonarComponent {
  path: string;
  measures: SonarMeasure[];
}

interface SonarReport {
  components: SonarComponent[];
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
      this.runNpmScript('lint');
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as {
        stdout?: ExecOutput;
        stderr?: ExecOutput;
        message: string;
      };
      result.status = 'failed';
      result.output = this.formatExecErrorOutput(error);
      Logger.error('QA Suite: Linting failed', error);
    }
  }

  private async runTypeCheck(result: QAResult): Promise<void> {
    this.info('Step 2/4: Running Type-check...');
    try {
      this.runNpmScript('type-check');
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as {
        stdout?: ExecOutput;
        stderr?: ExecOutput;
        message: string;
      };
      result.status = 'failed';
      result.output = this.formatExecErrorOutput(error);
      Logger.error('QA Suite: Type-check failed', error);
    }
  }

  private async runTests(result: QAResult): Promise<void> {
    this.info('Step 3/4: Running Tests & Coverage...');
    try {
      this.runNpmScript('test:coverage');
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as {
        stdout?: ExecOutput;
        stderr?: ExecOutput;
        message: string;
      };
      result.status = 'failed';
      result.output = this.formatExecErrorOutput(error);
      Logger.error('QA Suite: Tests failed', error);
    }
  }

  private async runSonar(result: QAResult, options: CommandOptions): Promise<void> {
    if (options['sonar'] === false) {
      result.status = 'skipped';
      return;
    }

    this.info('Step 4/4: Running SonarQube Analysis...');

    try {
      this.runNpmScript('sonarqube');
      result.status = 'passed';
    } catch (e: unknown) {
      const error = e as {
        stdout?: ExecOutput;
        stderr?: ExecOutput;
        message: string;
      };
      result.status = 'failed';
      result.output = this.formatExecErrorOutput(error);
      Logger.error('QA Suite: SonarQube failed', error);
    } finally {
      try {
        this.runUncoveredScript();
      } catch (error) {
        Logger.error('Failed to fetch uncovered files report', error);
      }
    }
  }

  private generateReport(results: QAResults): void {
    const reportDir = path.join(process.cwd(), 'coverage');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, 'qa-report.html');
    const html = this.getReportHtml(results);

    try {
      fs.writeFileSync(reportPath, html);
      this.info(`QA Report generated at: ${reportPath}`);

      this.openReport(reportPath);
    } catch (error) {
      Logger.error('Failed to generate or open QA report', error);
      this.warn('Could not automatically open the report.');
    }
  }

  private getReportHtml(results: QAResults): string {
    return `
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

        ${this.getUncoveredHtml()}

        <footer class="text-center text-slate-500 text-sm">
            &copy; ${new Date().getFullYear()} Zintrust Framework. All rights reserved.
        </footer>
    </div>
</body>
</html>
    `;
  }

  private getUncoveredHtml(): string {
    const reportPath = path.join(process.cwd(), 'reports', 'sonarcloud-uncovered.json');
    if (!fs.existsSync(reportPath)) return '';

    try {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as SonarReport | null;
      if (!data || !Array.isArray(data.components)) return '';

      const components = data.components
        .filter((c: SonarComponent) => {
          const coverage = c.measures.find((m: SonarMeasure) => m.metric === 'coverage');
          return coverage !== undefined && Number.parseFloat(coverage.value) < 80;
        })
        .map((c: SonarComponent) => {
          const coverage =
            c.measures.find((m: SonarMeasure) => m.metric === 'coverage')?.value ?? '0';
          const uncoveredLines =
            c.measures.find((m: SonarMeasure) => m.metric === 'uncovered_lines')?.value ?? '0';
          return { path: c.path, coverage, uncoveredLines };
        })
        .sort(
          (a: { coverage: string }, b: { coverage: string }) =>
            Number.parseFloat(a.coverage) - Number.parseFloat(b.coverage)
        );

      if (components.length === 0) return '';

      return this.renderUncoveredTable(components);
    } catch (error) {
      Logger.error('Failed to read uncovered report', error);
      return '';
    }
  }

  private renderUncoveredTable(
    components: Array<{ path: string; coverage: string; uncoveredLines: string }>
  ): string {
    return `
        <div class="card p-6 rounded-lg shadow-xl mb-8">
            <h2 class="text-xl font-semibold mb-4">Uncovered Files (< 80%)</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-300">
                    <thead class="bg-slate-800 text-xs uppercase font-medium text-slate-400">
                        <tr>
                            <th class="px-4 py-3 rounded-l-lg">File</th>
                            <th class="px-4 py-3">Coverage</th>
                            <th class="px-4 py-3 rounded-r-lg">Uncovered Lines</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700">
                        ${components
                          .map(
                            (c) => `
                            <tr class="hover:bg-slate-800/50 transition-colors">
                                <td class="px-4 py-3 font-mono text-blue-400">${c.path}</td>
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-2">
                                        <span class="${
                                          Number(c.coverage) < 50
                                            ? 'text-red-400'
                                            : 'text-yellow-400'
                                        }">${c.coverage}%</span>
                                        <div class="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div class="h-full ${
                                              Number(c.coverage) < 50
                                                ? 'bg-red-500'
                                                : 'bg-yellow-500'
                                            }" style="width: ${c.coverage}%"></div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-slate-400">${c.uncoveredLines}</td>
                            </tr>
                        `
                          )
                          .join('')}
                    </tbody>
                </table>
            </div>
        </div>
      `;
  }

  private openReport(reportPath: string): void {
    // Try to open the report with a fixed, non-user-controlled binary path.
    if (process.platform === 'win32') {
      execFileSync(String.raw`C:\Windows\System32\cmd.exe`, ['/c', 'start', '', reportPath], {
        stdio: 'ignore',
        env: this.getSafeEnv(),
      });
      return;
    }

    const commandPath = process.platform === 'darwin' ? '/usr/bin/open' : '/usr/bin/xdg-open';
    execFileSync(commandPath, [reportPath], { stdio: 'ignore', env: this.getSafeEnv() });
  }

  private runUncoveredScript(): void {
    const npxPath = this.resolveBinPath('npx');
    execFileSync(npxPath, ['tsx', 'scripts/sonarcloud-issues.ts', '--uncovered'], {
      stdio: 'inherit',
      env: this.getSafeEnv(),
    });
  }

  private runNpmScript(scriptName: string): void {
    const npmPath = this.resolveBinPath('npm');

    // Run npm directly (absolute path, no PATH lookup).
    // Provide a fixed PATH comprised of system directories + Node bin (Sonar S4036).
    // Use stdio=inherit to avoid maxBuffer failures and to show progress output.
    execFileSync(npmPath, ['run', scriptName], {
      stdio: 'inherit',
      env: this.getSafeEnv(),
    });
  }

  private resolveBinPath(binName: string): string {
    const nodeBinDir = path.dirname(process.execPath);

    const candidates =
      process.platform === 'win32'
        ? [path.join(nodeBinDir, `${binName}.cmd`), path.join(nodeBinDir, `${binName}.exe`)]
        : [path.join(nodeBinDir, binName)];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(
      `Unable to locate ${binName} executable. Ensure Node.js is installed in the standard location.`
    );
  }

  private getSafeEnv(): NodeJS.ProcessEnv {
    // Build a fixed, unwriteable PATH that includes Node's directory (Sonar S4036).
    // Node is typically installed in a read-only system location (e.g., /opt/homebrew/bin on macOS).
    const nodeBinDir = path.dirname(process.execPath);
    const safePath =
      process.platform === 'win32'
        ? [String.raw`C:\Windows\System32`, String.raw`C:\Windows`, nodeBinDir].join(';')
        : ['/usr/bin', '/bin', '/usr/sbin', '/sbin', nodeBinDir].join(':');

    return {
      ...process.env,
      PATH: safePath,
      // Ensure npm can run JS bin scripts with `#!/usr/bin/env node` even when PATH is hardened.
      npm_config_scripts_prepend_node_path: 'true',
    };
  }

  private formatExecErrorOutput(error: {
    stdout?: ExecOutput;
    stderr?: ExecOutput;
    message: string;
  }): string {
    if (typeof error.stdout === 'string' && error.stdout !== '') return error.stdout;
    if (Buffer.isBuffer(error.stdout) && error.stdout.length > 0) return error.stdout.toString();

    if (typeof error.stderr === 'string' && error.stderr !== '') return error.stderr;
    if (Buffer.isBuffer(error.stderr) && error.stderr.length > 0) return error.stderr.toString();

    return error.message;
  }
}
