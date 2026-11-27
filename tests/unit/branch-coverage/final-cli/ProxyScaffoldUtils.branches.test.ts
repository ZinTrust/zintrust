import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((_path: string) => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((_path: string) => ''),
  writeFileSync: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as (...a: any[]) => any)(...args),
  mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
  readFileSync: (...args: unknown[]) => (mocks.readFileSync as (...a: any[]) => any)(...args),
  writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
}));

import {
  ensureProxyEntrypoint,
  ensureWranglerConfig,
  findQuotedValue,
  injectEnvBlock,
  renderProxyWranglerDevConfig,
  resolveConfigPath,
  trimNonEmptyOption,
} from '@cli/commands/ProxyScaffoldUtils';

describe('ProxyScaffoldUtils uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    mocks.readFileSync.mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('trims options and falls back for blank values', () => {
    expect(trimNonEmptyOption(undefined)).toBeUndefined();
    expect(trimNonEmptyOption('   ')).toBeUndefined();
    expect(trimNonEmptyOption('  value  ')).toBe('value');
    expect(resolveConfigPath('  ', 'custom.json')).toBe('custom.json');
    expect(resolveConfigPath(' wrangler.toml ')).toBe('wrangler.toml');
    expect(resolveConfigPath(undefined)).toBe('wrangler.jsonc');
  });

  it('handles malformed quoted values and missing colons', () => {
    expect(findQuotedValue('{"key"  "value"}', 'key')).toBeUndefined();
    expect(findQuotedValue('{"key": "unterminated}', 'key')).toBeUndefined();
    expect(findQuotedValue('{"key": "   "}', 'key')).toBeUndefined();
    expect(findQuotedValue('{"key": "value"}', 'key')).toBe('value');
    expect(findQuotedValue('{"other": "value"}', 'key')).toBeUndefined();
  });

  it('treats a non-object env value as absent and appends a new env block', () => {
    const result = injectEnvBlock('{"env": "not-an-object"}', 'prod', '    "prod": {}');
    expect(result).toContain('"prod": {}');
    expect(result).toContain('"env": {');
  });

  it('skips line and block comments while scanning for a quoted key', () => {
    const result = injectEnvBlock(
      '/* a*b note */\n// "env": { "fake": true }\n{ "other": {} }',
      'prod',
      '    "prod": {}'
    );
    expect(result).toContain('"prod": {}');
  });

  it('rejects a quoted key that is not followed by a colon', () => {
    const result = injectEnvBlock('{"env" x: {}}', 'prod', '    "prod": {}');
    expect(result).toContain('"prod": {}');
  });

  it('scans past block and line comments while locating an env object', () => {
    const rendered = renderProxyWranglerDevConfig(
      '{"env": {/* a*b note */\n// "prod" fake\n"prod": {"main": "./src/index.ts"}}}',
      'prod'
    );
    expect(rendered).toContain('"main": "../../src/index.ts"');
  });

  it('rejects a scanned env key that is not followed by a colon', () => {
    expect(
      renderProxyWranglerDevConfig('{"env": {"prod" x: {"main": "x"}}}', 'prod')
    ).toBeUndefined();
  });

  it('returns undefined for env objects that are missing, unclosed, or empty', () => {
    expect(renderProxyWranglerDevConfig('{"name": "app"}', 'prod')).toBeUndefined();
    expect(renderProxyWranglerDevConfig('{"env": {"prod": {"main": "x"', 'prod')).toBeUndefined();
    expect(renderProxyWranglerDevConfig('{"env": {"dev": {}}}', 'prod')).toBeUndefined();
    expect(renderProxyWranglerDevConfig('{"env": {"prod": {}}}', 'prod')).toBeUndefined();
  });

  it('renders an env block with alias, blank lines, and rewritten relative paths', () => {
    const rendered = renderProxyWranglerDevConfig(
      '{\n  "alias": {"x": "./src/x.ts"},\n  "env": {"prod": {\n    "a": "b",\n\n    "c": "d"\n  }}\n}',
      'prod'
    );
    expect(rendered).toContain('"alias"');
    expect(rendered).toContain('"x": "../../src/x.ts"');
    expect(rendered).toContain('"a": "b"');
  });

  it('leaves an existing env block untouched', () => {
    const content = '{"env": {"prod": {"name": "existing"}}}';
    expect(injectEnvBlock(content, 'prod', '    "prod": {}')).toBe(content);
  });

  it('inserts into a non-empty env object and into an object without env', () => {
    const withEnv = injectEnvBlock('{"env": {"dev": {}}}', 'prod', '    "prod": {}');
    expect(withEnv).toContain('"dev"');
    expect(withEnv).toContain('"prod"');

    const bareObject = injectEnvBlock('{\n}', 'prod', '    "prod": {}');
    expect(bareObject).toContain('"env": {');
    expect(bareObject).toMatch(/"env": \{\n\s{4}"prod": \{\}/);

    const withProperties = injectEnvBlock('{"name": "app"}', 'prod', '    "prod": {}');
    expect(withProperties).toContain(',\n  "env": {');
  });

  it('creates proxy entrypoints only when missing', () => {
    expect(ensureProxyEntrypoint({
      cwd: '/workspace',
      entryFile: 'src/functions/proxy.ts',
      exportName: 'proxy',
      moduleSpecifier: '@zintrust/core/proxy',
    })).toEqual({ created: true, entryFilePath: '/workspace/src/functions/proxy.ts' });
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/workspace/src/functions', { recursive: true });
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      '/workspace/src/functions/proxy.ts',
      expect.stringContaining("export { proxy } from '@zintrust/core/proxy';"),
      'utf-8'
    );

    mocks.existsSync.mockReturnValue(true);
    expect(ensureProxyEntrypoint({
      cwd: '/workspace',
      entryFile: 'src/functions/proxy.ts',
      exportName: 'proxy',
      moduleSpecifier: '@zintrust/core/proxy',
    })).toEqual({ created: false, entryFilePath: '/workspace/src/functions/proxy.ts' });
    expect(mocks.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('creates configs from scratch and reports whether an env block was inserted', () => {
    const options = {
      configPath: '/workspace/wrangler.jsonc',
      options: { name: 'api' },
      envName: 'prod',
      resolveValues: (_content: string | undefined, opts: { name: string }) => opts.name,
      renderEnvBlock: (name: string) => `    "name": "${name}", "env": "prod"`,
      compatibilityDate: '2025-01-01',
    };

    const created = ensureWranglerConfig(options);
    expect(created.createdFile).toBe(true);
    expect(created.insertedEnv).toBe(true);
    expect(created.values).toBe('api');

    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue('{"env": {"prod": {"name": "api"}}}');
    const unchanged = ensureWranglerConfig(options);
    expect(unchanged.createdFile).toBe(false);
    expect(unchanged.insertedEnv).toBe(false);

    mocks.readFileSync.mockReturnValue('{"name": "api"}');
    const inserted = ensureWranglerConfig(options);
    expect(inserted.insertedEnv).toBe(true);
    expect(inserted.content).toContain('"prod"');
  });
});
