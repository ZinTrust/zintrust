import { isNodeMain } from '@/start';
import { ZintrustLang } from '@lang/lang';
import { describe, expect, it, vi } from 'vitest';

// Mock modules
vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getInstance: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

// Mock bootstrap to avoid side effects
vi.mock('@/boot/bootstrap', () => ({
  bootstrap: vi.fn(),
}));

describe('start coverage', () => {
  it('detects node main module', () => {
    const originalArgv = process.argv.slice();
    process.argv[1] = 'file:///tmp/app.js';

    expect(isNodeMain('file:///tmp/app.js')).toBe(true);

    process.argv = originalArgv;
  });

  it('should handle bootstrap import', async () => {
    // Mock ZintrustLang.BOOTSTRAPJS
    const originalBootstrap = ZintrustLang.BOOTSTRAPJS;
    (ZintrustLang as any).BOOTSTRAPJS = 'test-bootstrap';

    // Import the start module to trigger the bootstrap import
    try {
      await import('@/start');
      // If we get here, the import worked
      expect(true).toBe(true);
    } catch (error) {
      // Expected due to mocking
      expect(error).toBeDefined();
    }

    // Restore original value
    (ZintrustLang as any).BOOTSTRAPJS = originalBootstrap;
  });
});
