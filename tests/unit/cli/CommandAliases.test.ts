import { CLI } from '@cli/CLI';
import { describe, expect, it } from 'vitest';

describe('CLI command aliases', () => {
  it('should register make:mail alias as make:mail', () => {
    const program = CLI.create().getProgram();
    const cmd = program.commands.find((c) => c.name() === 'make:mail-template');
    expect(cmd).toBeDefined();
    expect(cmd?.aliases()).toContain('make:mail');
  });

  it('should register make:notification alias as make:notification', () => {
    const program = CLI.create().getProgram();
    const cmd = program.commands.find((c) => c.name() === 'make:notification-template');
    expect(cmd).toBeDefined();
    expect(cmd?.aliases()).toContain('make:notification');
  });
});
