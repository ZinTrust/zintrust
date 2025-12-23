/**
 * Debug Dashboard
 * Terminal-based real-time monitoring UI
 */

import chalk from 'chalk';
import { randomInt } from 'node:crypto';
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

interface DashboardState {
  stats: DashboardStats;
  timer: NodeJS.Timeout | undefined;
  rl: readline.Interface;
}

const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let i = 0;
  while (size > 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
};

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
};

const getPercent = (value: number, total: number): string => {
  return ((value / total) * 100).toFixed(1);
};

const hideCursor = (): void => {
  process.stdout.write('\x1B[?25l');
};

const showCursor = (): void => {
  process.stdout.write('\x1B[?25h');
};

const renderSection = (title: string, lines: string[]): void => {
  process.stdout.write(chalk.cyan.bold(`\n[ ${title} ]`) + '\n');
  lines.forEach((line) => process.stdout.write(`  ${line}\n`));
};

const render = (stats: DashboardStats): void => {
  readline.cursorTo(process.stdout, 0, 0);

  const header = chalk.bgBlue.white.bold(' ZINTRUST DEBUG DASHBOARD ');
  const uptime = chalk.gray(`Uptime: ${formatDuration(stats.uptime)}`);

  process.stdout.write(`${header} ${uptime}\n\n`);

  renderSection('SYSTEM RESOURCES', [
    `Memory: ${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)} (${getPercent(
      stats.memory.used,
      stats.memory.total
    )}%)`,
    `CPU Load: ${os.loadavg()[0].toFixed(2)}`,
  ]);

  renderSection('HTTP REQUESTS', [
    `Total Requests: ${stats.requests.total}`,
    `Active Requests: ${chalk.green(stats.requests.active)}`,
    `Avg Duration: ${stats.requests.avgDuration}ms`,
  ]);

  renderSection('DATABASE QUERIES', [
    `Total Queries: ${stats.queries.total}`,
    `N+1 Warnings: ${
      stats.queries.n1Warnings > 0 ? chalk.red.bold(stats.queries.n1Warnings) : chalk.green('0')
    }`,
  ]);

  process.stdout.write('\n' + chalk.gray('Press Ctrl+C to exit') + '\n');
};

const updateStatsInternal = (stats: DashboardStats): void => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  stats.uptime = process.uptime();
  stats.memory = {
    total: totalMem,
    free: freeMem,
    used: totalMem - freeMem,
  };

  // Mock some activity for demonstration
  if (randomInt(0, 1000) > 700) {
    stats.requests.total += randomInt(0, 3);
    stats.requests.active = randomInt(0, 5);
    stats.requests.avgDuration = randomInt(20, 120);
  }

  if (randomInt(0, 1000) > 800) {
    stats.queries.total += randomInt(0, 10);
    if (randomInt(0, 1000) > 900) {
      stats.queries.n1Warnings++;
    }
  }
};

export interface IDashboard {
  start(): void;
  stop(): void;
  update(newStats: Partial<DashboardStats>): void;
}

/**
 * Debug Dashboard
 * Terminal-based real-time monitoring UI
 * Sealed namespace for immutability
 */
const DashboardFactory = Object.freeze({
  create(): IDashboard {
    const state: DashboardState = {
      rl: readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      }),
      stats: {
        uptime: 0,
        memory: { total: 0, free: 0, used: 0 },
        requests: { total: 0, active: 0, avgDuration: 0 },
        queries: { total: 0, n1Warnings: 0 },
      },
      timer: undefined,
    };

    const dashboard: IDashboard & { render(): void; updateStats(): void } = {
      render(): void {
        render(state.stats);
      },

      updateStats(): void {
        updateStatsInternal(state.stats);
      },

      /**
       * Start the dashboard
       */
      start(): void {
        process.stdout.write('\x1Bc'); // Clear screen
        hideCursor();
        dashboard.render();

        if (state.timer) {
          clearInterval(state.timer);
        }

        state.timer = setInterval(() => {
          dashboard.updateStats();
          dashboard.render();
        }, 1000);

        // Ensure cleanup on exit
        const cleanup = (): void => {
          dashboard.stop();
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      },

      /**
       * Stop the dashboard
       */
      stop(): void {
        if (state.timer) {
          clearInterval(state.timer);
        }
        showCursor();
        state.rl.close();
      },

      /**
       * Update dashboard stats
       */
      update(newStats: Partial<DashboardStats>): void {
        state.stats = { ...state.stats, ...newStats };
      },
    };

    return dashboard;
  },
});

type DashboardCtor = {
  new (): IDashboard;
  (): IDashboard;
  create(): IDashboard;
};

export const Dashboard = Object.assign(function DashboardCtorImpl(): IDashboard {
  return DashboardFactory.create();
}, DashboardFactory) as unknown as DashboardCtor;
