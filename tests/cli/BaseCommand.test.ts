import { BaseCommand } from '@cli/BaseCommand';
import { describe, expect, it } from 'vitest';

describe('BaseCommand', () => {
  it('should create command with name and description', (): void => {
    class TestCommand extends BaseCommand {
      constructor() {
        super();
        this.name = 'test';
        this.description = 'Test command';
      }

      async execute(): Promise<void> {
        // Empty implementation
      }
    }

    const command = new TestCommand();
    const cmd = command.getCommand();

    expect(cmd.name()).toBe('test');
    expect(cmd.description()).toBe('Test command');
  });

  it('should have verbose option', (): void => {
    class TestCommand extends BaseCommand {
      constructor() {
        super();
        this.name = 'test-verbose';
        this.description = 'Test command with verbose option';
      }

      async execute(): Promise<void> {
        // Empty implementation
      }
    }

    const command = new TestCommand();
    const cmd = command.getCommand();

    // Check that the command has options
    expect(cmd.options).toBeDefined();
    expect(cmd.options.length).toBeGreaterThan(0);

    // Verify verbose option exists
    const verboseOption = cmd.options.find((opt) => opt.long === '--verbose');
    expect(verboseOption).toBeDefined();
  });
});
