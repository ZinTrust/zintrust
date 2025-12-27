import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { cleanLogsOnce } from '@config/logger';

export const LogsCleanupCommand = Object.freeze({
  create(): IBaseCommand {
    // Create the command first, then assign the execute implementation so we can
    // safely reference the instance (`cmd`) from inside the handler.
    const cmd = BaseCommand.create({
      name: 'logs:cleanup',
      description: 'Run a one-off log cleanup based on configured retention',
      execute: async () => {},
    });

    cmd.execute = async (_options) => {
      cmd.info('Running log cleanup...');
      const deleted = await cleanLogsOnce();
      cmd.info(`Deleted ${deleted.length} log files`);
    };

    return cmd;
  },
});

export default LogsCleanupCommand;
