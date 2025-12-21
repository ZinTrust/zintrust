/**
 * Debug Dashboard
 * Terminal-based real-time monitoring UI
 */

import chalk from 'chalk';
import * as os from 'node:os';
import * as readline from 'node:readline';

export interface DashboardStats {
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
  };
  requests: {
    total: number;
    active: number;
    avgDuration: number;
  };
  queries: {
    total: number;
    n1Warnings: number;
  };
}

export class Dashboard {
  private readonly rl: readline.Interface;
  private stats: DashboardStats;
  private timer?: NodeJS.Timeout;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.stats = {
      uptime: 0,
      memory: { total: 0, free: 0, used: 0 },
      requests: { total: 0, active: 0, avgDuration: 0 },
      queries: { total: 0, n1Warnings: 0 },
    };
  }

  /**
   * Start the dashboard
   */
  public start(): void {
    process.stdout.write('\x1Bc'); // Clear screen
    this.hideCursor();
    this.render();

    this.timer = setInterval(() => {
      this.updateStats();
      this.render();
    }, 1000);
  }

  /**
   * Stop the dashboard
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.showCursor();
    this.rl.close();
  }

  /**
   * Update dashboard stats
   */
  public update(newStats: Partial<DashboardStats>): void {
    this.stats = { ...this.stats, ...newStats };
  }

  private updateStats(): void {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    this.stats.uptime = process.uptime();
    this.stats.memory = {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
    };

    // Mock some activity for demonstration
    if (Math.random() > 0.7) {
      // NOSONAR
      this.stats.requests.total += Math.floor(Math.random() * 3); // NOSONAR
      this.stats.requests.active = Math.floor(Math.random() * 5); // NOSONAR
      this.stats.requests.avgDuration = Math.floor(Math.random() * 100 + 20); // NOSONAR
    }

    if (Math.random() > 0.8) {
      // NOSONAR
      this.stats.queries.total += Math.floor(Math.random() * 10); // NOSONAR
      if (Math.random() > 0.9) {
        // NOSONAR
        this.stats.queries.n1Warnings++;
      }
    }
  }

  private render(): void {
    readline.cursorTo(process.stdout, 0, 0);

    const header = chalk.bgBlue.white.bold(' ZINTRUST DEBUG DASHBOARD ');
    const uptime = chalk.gray(`Uptime: ${this.formatDuration(this.stats.uptime)}`);

    process.stdout.write(`${header} ${uptime}\n\n`);

    this.renderSection('SYSTEM RESOURCES', [
      `Memory: ${this.formatBytes(this.stats.memory.used)} / ${this.formatBytes(this.stats.memory.total)} (${this.getPercent(this.stats.memory.used, this.stats.memory.total)}%)`,
      `CPU Load: ${os.loadavg()[0].toFixed(2)}`,
    ]);

    this.renderSection('HTTP REQUESTS', [
      `Total Requests: ${this.stats.requests.total}`,
      `Active Requests: ${chalk.green(this.stats.requests.active)}`,
      `Avg Duration: ${this.stats.requests.avgDuration}ms`,
    ]);

    this.renderSection('DATABASE QUERIES', [
      `Total Queries: ${this.stats.queries.total}`,
      `N+1 Warnings: ${this.stats.queries.n1Warnings > 0 ? chalk.red.bold(this.stats.queries.n1Warnings) : chalk.green('0')}`,
    ]);

    process.stdout.write('\n' + chalk.gray('Press Ctrl+C to exit') + '\n');
  }

  private renderSection(title: string, lines: string[]): void {
    process.stdout.write(chalk.cyan.bold(`\n[ ${title} ]`) + '\n');
    lines.forEach((line) => process.stdout.write(`  ${line}\n`));
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let i = 0;
    while (size > 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(2)} ${units[i]}`;
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  }

  private getPercent(value: number, total: number): string {
    return ((value / total) * 100).toFixed(1);
  }

  private hideCursor(): void {
    process.stdout.write('\x1B[?25l');
  }

  private showCursor(): void {
    process.stdout.write('\x1B[?25h');
  }
}
