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

    const rows = SchedulerRuntime.list()
      .map((s) => ({
        name: s.name,
        enabled: s.enabled !== false,
        intervalMs: s.intervalMs,
        runOnStart: s.runOnStart === true,
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
      Logger.info(
        `${row.name} (enabled=${row.enabled}, intervalMs=${row.intervalMs ?? 'manual'}, runOnStart=${row.runOnStart})`
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
