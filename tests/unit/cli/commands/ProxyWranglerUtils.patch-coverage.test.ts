import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  spawnAndWait: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  dirname: vi.fn((value: string) => value.split('/').slice(0, -1).join('/')),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: (...args: unknown[]) => mocked.spawnAndWait(...args),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => mocked.existsSync(...args),
  mkdirSync: (...args: unknown[]) => mocked.mkdirSync(...args),
  readFileSync: (...args: unknown[]) => mocked.readFileSync(...args),
  writeFileSync: (...args: unknown[]) => mocked.writeFileSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...args: string[]) => mocked.join(...args),
  dirname: (...args: [string]) => mocked.dirname(...args),
}));

vi.mock('@config/logger', () => ({
  Logger: mocked.logger,
}));

describe('proxy wrangler utils patch coverage', () => {
  it('covers ProxyScaffoldUtils helpers and wrangler non-zero exit path', async () => {
    const { injectEnvBlock, findQuotedValue, resolveConfigPath, trimNonEmptyOption } =
      await import('@cli/commands/ProxyScaffoldUtils');
    expect(trimNonEmptyOption('   ')).toBeUndefined();
    expect(resolveConfigPath('   ', 'fallback.jsonc')).toBe('fallback.jsonc');
    expect(findQuotedValue('{"binding":"  ZIN_DB  "}', 'binding')).toBe('ZIN_DB');
    expect(injectEnvBlock('{\n  "env": {}\n}\n', 'd1-proxy', '    "d1-proxy": {}')).toContain(
      '"d1-proxy": {}'
    );
    expect(() => injectEnvBlock('{', 'd1-proxy', '    "d1-proxy": {}')).toThrow(
      'Invalid wrangler.jsonc: missing closing brace.'
    );

    mocked.existsSync.mockImplementation((value: string) => value === '/repo/wrangler.jsonc');
    mocked.readFileSync.mockReturnValue('{\n  "name": "zintrust-api",\n  "env": {}\n}\n');
    mocked.spawnAndWait.mockResolvedValue(5);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as typeof process.exit);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { createWranglerProxyCommand } = await import('@cli/commands/WranglerProxyCommandUtils');
    const command = createWranglerProxyCommand({
      name: 'proxy:test',
      aliases: [],
      description: 'test',
      envName: 'test-proxy',
      defaultConfig: 'wrangler.jsonc',
      compatibilityDate: '2026-03-12',
      entryFile: 'src/proxy/test/TestProxy.ts',
      exportName: 'TestProxy',
      moduleSpecifier: '@zintrust/core/proxy',
      addOptions: () => {},
      resolveValues: () => ({ binding: 'X' }),
      renderEnvBlock: () => '    "test-proxy": {}',
    });

    await expect(command.execute({})).rejects.toThrow('exit:5');

    cwdSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
