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

  it('registers aliases when aliases is an array', (): void => {
    const command = BaseCommand.create({
      name: 'test-aliases',
      description: 'Test command with aliases array',
      aliases: ['make:mail', 'make:notification'],
      execute: async () => {
        // Empty implementation
      },
    });

    const cmd = command.getCommand();
    // Commander stores aliases on the command instance
    expect(cmd.aliases()).toContain('make:mail');
    expect(cmd.aliases()).toContain('make:notification');
  });
});
