import { BaseCommand } from '@cli/BaseCommand';
import { describe, expect, it } from 'vitest';

describe('BaseCommand', () => {
  it('should create command with name and description', (): void => {
    const command = BaseCommand.create({
      name: 'test',
      description: 'Test command',
      execute: async () => {
        // Empty implementation
      },
    });

    const cmd = command.getCommand();

    expect(cmd.name()).toBe('test');
    expect(cmd.description()).toBe('Test command');
  });

  it('should have verbose option', (): void => {
    const command = BaseCommand.create({
      name: 'test-verbose',
      description: 'Test command with verbose option',
      execute: async () => {
        // Empty implementation
      },
    });

    const cmd = command.getCommand();

    const options = cmd.options;
    const hasVerbose = options.some((opt: any) => opt.long === '--verbose');
    expect(hasVerbose).toBe(true);
  });
});
