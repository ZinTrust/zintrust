import type { ICLI } from '@cli/CLI';
import { beforeAll, describe, expect, it } from 'vitest';

let CLI: typeof import('@cli/CLI').CLI;
let OptionalCliExtensions: typeof import('@cli/OptionalCliExtensions').OptionalCliExtensions;

beforeAll(async () => {
  process.env['JWT_SECRET'] ??= 'test-jwt-secret';

  ({ CLI } = await import('@cli/CLI'));
  ({ OptionalCliExtensions } = await import('@cli/OptionalCliExtensions'));
});

describe('OptionalCliExtensions', () => {
  it('registers migrate-to-d1 when the package is installed', async () => {
    const statuses = await OptionalCliExtensions.tryImportInstalledExtensions();
    expect(statuses.some((status) => status.packageName === '@zintrust/d1-migrator')).toBe(true);

    const cli: ICLI = CLI.create();
    const commands = cli
      .getProgram()
      .commands.map((command: { name: () => string }) => command.name());

    expect(commands).toContain('migrate-to-d1');
  });

  it('registers worker commands when the package is installed', async () => {
    const statuses = await OptionalCliExtensions.tryImportInstalledExtensions();
    expect(statuses.some((status) => status.packageName === '@zintrust/workers')).toBe(true);

    const cli: ICLI = CLI.create();
    const commands = cli
      .getProgram()
      .commands.map((command: { name: () => string }) => command.name());

    expect(commands).toContain('worker:list');
    expect(commands).toContain('worker:status');
    expect(commands).toContain('worker:start');
    expect(commands).toContain('worker:start-all');
    expect(commands).toContain('worker:stop');
    expect(commands).toContain('worker:restart');
    expect(commands).toContain('worker:summary');
  });

  it('returns install guidance for missing optional command requests', () => {
    const missing = OptionalCliExtensions.findMissingExtensionForArgs(
      ['migrate-to-d1'],
      [
        {
          packageName: '@zintrust/d1-migrator',
          commands: ['migrate-to-d1', 'd1:transfer'],
          installCommand: 'npm install @zintrust/d1-migrator',
          loaded: false,
          source: 'missing',
        },
      ]
    );

    expect(missing).toBeDefined();
    expect(OptionalCliExtensions.getMissingExtensionMessage(missing!)).toContain(
      'npm install @zintrust/d1-migrator'
    );
  });

  it('returns install guidance for missing worker command requests', () => {
    const missing = OptionalCliExtensions.findMissingExtensionForArgs(
      ['worker:list'],
      [
        {
          packageName: '@zintrust/workers',
          commands: [
            'worker:list',
            'worker:status',
            'worker:start',
            'worker:start-all',
            'worker:stop',
            'worker:restart',
            'worker:summary',
          ],
          installCommand: 'npm install @zintrust/workers',
          loaded: false,
          source: 'missing',
        },
      ]
    );

    expect(missing).toBeDefined();
    expect(OptionalCliExtensions.getMissingExtensionMessage(missing!)).toContain(
      'npm install @zintrust/workers'
    );
  });
});
