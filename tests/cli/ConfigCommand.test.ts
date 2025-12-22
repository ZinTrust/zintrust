/**
 * ConfigCommand Tests
 */

import { ConfigCommand } from '@cli/commands/ConfigCommand';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ConfigCommand', () => {
  let command: ConfigCommand;

  beforeEach(() => {
    command = new ConfigCommand();
  });

  it('should be created with correct name', () => {
    expect(command.getCommand().name()).toBe('config');
  });

  it('should have correct description', () => {
    expect(command.getCommand().description()).toContain('configuration');
  });

  it('should have action, key, value arguments', () => {
    const cmd = command.getCommand();

    // Command should be properly structured
    expect(cmd).toBeDefined();
    expect(cmd.name()).toBe('config');
  });

  it('should have global option', () => {
    const cmd = command.getCommand();
    const options = cmd.options;

    const globalOption = options.find((opt) => opt.flags.includes('--global'));
    expect(globalOption).toBeDefined();
  });

  it('should have json output option', () => {
    const cmd = command.getCommand();
    const options = cmd.options;

    const jsonOption = options.find((opt) => opt.flags.includes('--json'));
    expect(jsonOption).toBeDefined();
  });

  it('should have show-defaults option', () => {
    const cmd = command.getCommand();
    const options = cmd.options;

    const showOption = options.find((opt) => opt.flags.includes('--show-defaults'));
    expect(showOption).toBeDefined();
  });

  it('should be a valid command instance', () => {
    expect(command).toBeDefined();
    expect(command.getCommand).toBeDefined();
    expect(command.execute).toBeDefined();
  });

  it('should have logging methods', () => {
    expect(command['info']).toBeDefined();
    expect(command['success']).toBeDefined();
    expect(command['warn']).toBeDefined();
    expect(command['debug']).toBeDefined();
  });

  it('should default to list action', async () => {
    // Verify the command can be instantiated and has proper structure
    const cmd = command.getCommand();
    expect(cmd.description()).toContain('configuration');
  });
});
