import { StartCommand } from '@cli/commands/StartCommand';
import { describe, expect, it } from 'vitest';

describe('StartCommand helper coverage', () => {
  const helpers = (StartCommand as any)._helpers as {
    isWranglerVarName: (value: string) => boolean;
    toUpperSnakeCaseIdentifier: (value: string) => string;
    isWindowsDriveAbsolutePath: (value: string) => boolean;
    containsCommandToken: (value: string, command: string) => boolean;
    containsZinCommand: (value: string) => boolean;
  };

  it('covers wrangler var and uppercase snake helpers', () => {
    expect(helpers.isWranglerVarName('APP_PORT')).toBe(true);
    expect(helpers.isWranglerVarName('9APP_PORT')).toBe(false);

    expect(helpers.toUpperSnakeCaseIdentifier('__app--port__name__')).toBe('APP_PORT_NAME');
    expect(helpers.isWindowsDriveAbsolutePath('C:/project/file')).toBe(true);
    expect(helpers.isWindowsDriveAbsolutePath('project/file')).toBe(false);
  });

  it('covers command token boundary scanning', () => {
    expect(helpers.containsCommandToken('npm run zin dev', 'zin')).toBe(true);
    expect(helpers.containsCommandToken('amazing', 'zin')).toBe(false);
    expect(helpers.containsCommandToken('use-zintrust-start', 'zintrust')).toBe(true);

    expect(helpers.containsZinCommand('tsx ./bin/zin.ts s')).toBe(true);
    expect(helpers.containsZinCommand('node scripts/amazing-runner.js')).toBe(false);
  });
});
