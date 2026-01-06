/**
 * Broadcast Work Command
 * Alias to work a broadcast queue.
 */

import { type IBaseCommand } from '@cli/BaseCommand';
import { createKindWorkCommand } from '@cli/commands/createKindWorkCommand';

export const BroadcastWorkCommand = Object.freeze({
  create(): IBaseCommand {
    return createKindWorkCommand({
      name: 'broadcast:work',
      description: 'Work queued broadcasts',
      kind: 'broadcast',
      helpHint: 'zin broadcast:work --help',
    });
  },
});

export default BroadcastWorkCommand;
