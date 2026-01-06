/**
 * Notification Work Command
 * Alias to work a notification queue.
 */

import { type IBaseCommand } from '@cli/BaseCommand';
import { createKindWorkCommand } from '@cli/commands/createKindWorkCommand';

export const NotificationWorkCommand = Object.freeze({
  create(): IBaseCommand {
    return createKindWorkCommand({
      name: 'notification:work',
      description: 'Work queued notifications',
      kind: 'notification',
      helpHint: 'zin notification:work --help',
    });
  },
});

export default NotificationWorkCommand;
