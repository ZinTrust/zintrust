import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ScheduleCliSupport } from '@cli/commands/schedule/ScheduleCliSupport';
import { Logger } from '@config/logger';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';

type Options = CommandOptions & {
  json?: boolean;
};

const execute = async (options: Options): Promise<void> => {
  try {
    await ScheduleCliSupport.registerAll();

    const toIso = (ms: number | undefined): string | undefined =>
      typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;

    const rows = (await SchedulerRuntime.listWithState())
      .map(({ schedule: s, state }) => ({
        name: s.name,
        enabled: s.enabled !== false,
        intervalMs: s.intervalMs,
        cron: s.cron,
        timezone: s.timezone,
        runOnStart: s.runOnStart === true,
        consecutiveFailures: state?.consecutiveFailures,
        lastRunAt: toIso(state?.lastRunAt),
        lastSuccessAt: toIso(state?.lastSuccessAt),
        lastErrorAt: toIso(state?.lastErrorAt),
        lastErrorMessage: state?.lastErrorMessage,
        nextRunAt: toIso(state?.nextRunAt),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (options.json === true) {
      Logger.info(JSON.stringify(rows, null, 2));
      return;
    }

    if (rows.length === 0) {
      Logger.info('No schedules registered');
      return;
    }

    rows.forEach((row) => {
      const hasText = (value: unknown): value is string =>
        typeof value === 'string' && value.trim().length > 0;

      const tzSuffix = hasText(row.timezone) ? ` tz=${row.timezone}` : '';

      const cadence =
        typeof row.cron === 'string' && row.cron.trim().length > 0
          ? `cron=${row.cron}${tzSuffix}`
          : `intervalMs=${row.intervalMs ?? 'manual'}`;

      const hasStateInfo = [row.nextRunAt, row.lastSuccessAt, row.lastErrorAt].some(hasText);

      const extra = hasStateInfo
        ? ` next=${row.nextRunAt ?? '-'} lastOk=${row.lastSuccessAt ?? '-'} lastErr=${row.lastErrorAt ?? '-'}`
        : '';

      Logger.info(
        `${row.name} (enabled=${row.enabled}, ${cadence}, runOnStart=${row.runOnStart}, failures=${row.consecutiveFailures ?? 0})${extra}`
      );
    });
  } finally {
    await ScheduleCliSupport.shutdownCliResources();
  }
};

export const ScheduleListCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'schedule:list',
      description: 'List all registered schedules',
      addOptions: (command) => {
        command.option('--json', 'Output JSON');
      },
      execute,
    });
  },
});

export default ScheduleListCommand;
