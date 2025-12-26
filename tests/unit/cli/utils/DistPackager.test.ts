import { DistPackager } from '@cli/utils/DistPackager';
import { Logger } from '@config/logger';
import fs from '@node-singletons/fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DistPackager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepares dist package metadata successfully', () => {
    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p === '/dist') return true;
      if (p === '/root/package.json') return true;
      if (p.includes('/dist/src/index.js')) return true;
      if (p.includes('/dist/bin/zintrust.js')) return true;
      if (p.includes('/dist/bin/zin.js')) return true;
      if (p.includes('/dist/public')) return true;
      return false;
    });

    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        name: 'my-app',
        version: '1.2.3',
        dependencies: { dep1: '1.0.0' },
      })
    );

    DistPackager.prepare('/dist', '/root');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('dist/package.json'),
      expect.stringContaining('"name": "my-app"')
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('dist/index.js'),
      expect.stringContaining("export * from './src/index.js';")
    );
    expect(Logger.info).toHaveBeenCalled();
  });

  it('throws error if distPath does not exist', () => {
    (fs.existsSync as any).mockReturnValue(false);

    expect(() => DistPackager.prepare('/dist')).toThrow('Missing dist output at: /dist');
  });

  it('throws error if root package.json is missing', () => {
    (fs.existsSync as any).mockImplementation((p: string) => p === '/dist');

    expect(() => DistPackager.prepare('/dist', '/root')).toThrow(
      'Missing package.json at: /root/package.json'
    );
  });

  it('handles invalid package.json JSON', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('invalid json');

    expect(() => DistPackager.prepare('/dist', '/root')).toThrow(
      'Failed to read root package.json'
    );
  });

  it('uses default name and version if missing in package.json', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({}));

    DistPackager.prepare('/dist', '/root');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('dist/package.json'),
      expect.stringContaining('"name": "@zintrust/core"')
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('dist/package.json'),
      expect.stringContaining('"version": "0.0.0"')
    );
  });

  it('handles missing dependencies in package.json', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({ name: 'test' }));

    DistPackager.prepare('/dist', '/root');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('dist/package.json'),
      expect.stringContaining('"dependencies": {}')
    );
  });

  it('warns if dist artifacts are missing', () => {
    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p === '/dist') return true;
      if (p === '/root/package.json') return true;
      return false; // Missing artifacts
    });
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({ name: 'test' }));

    DistPackager.prepare('/dist', '/root');

    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Dist artifact missing'));
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Docs public root missing'));
  });
});
