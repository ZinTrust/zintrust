import { TemplatesCommand } from '@cli/commands/TemplatesCommand';
import { describe, expect, it } from 'vitest';

describe('Templates CLI Command', () => {
  it('lists templates for mail scope', async () => {
    // Call execute directly to avoid commander argv parsing complexity
    // Should run without throwing
    await (TemplatesCommand.execute as any)({ args: ['list', 'mail'] });
    expect(true).toBe(true);
  });
});
