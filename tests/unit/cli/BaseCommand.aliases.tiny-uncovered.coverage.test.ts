import { describe, expect, it } from 'vitest';

import { BaseCommand } from '@/cli/BaseCommand';

describe('BaseCommand aliases (tiny uncovered)', () => {
  it('applies a string alias', () => {
    const cmd = BaseCommand.create({
      name: 't',
      description: 'd',
      aliases: 'tt',
      execute: async () => undefined,
    });

    const commander = cmd.getCommand();
    expect(commander.aliases()).toContain('tt');
  });

  it('applies multiple aliases', () => {
    const cmd = BaseCommand.create({
      name: 't',
      description: 'd',
      aliases: ['a', 'b'],
      execute: async () => undefined,
    });

    const commander = cmd.getCommand();
    expect(commander.aliases()).toEqual(expect.arrayContaining(['a', 'b']));
  });
});
