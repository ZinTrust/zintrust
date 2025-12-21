import { Env } from '@/config/env';
import { createAdapter, detectRuntime } from '@/runtime/RuntimeDetector';
import { CloudflareAdapter } from '@/runtime/adapters/CloudflareAdapter';
import { DenoAdapter } from '@/runtime/adapters/DenoAdapter';
import { FargateAdapter } from '@/runtime/adapters/FargateAdapter';
import { LambdaAdapter } from '@/runtime/adapters/LambdaAdapter';
import { NodeServerAdapter } from '@/runtime/adapters/NodeServerAdapter';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock Env
vi.mock('@/config/env', () => ({
  Env: {
    get: vi.fn(),
  },
}));

describe('RuntimeDetector', () => {
  const mockConfig = {
    handler: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };

  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).Deno;
    delete (globalThis as any).CF;
    delete (globalThis as any).ENVIRONMENT;
  });

  describe('detectRuntime', () => {
    it('should respect explicit RUNTIME env var', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'fargate';
        return '';
      });
      expect(detectRuntime()).toBe('fargate');
    });

    it('should detect Lambda', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'AWS_LAMBDA_FUNCTION_NAME') return 'my-func';
        return '';
      });
      expect(detectRuntime()).toBe('lambda');
    });

    it('should detect Deno', () => {
      vi.mocked(Env.get).mockReturnValue('');
      (globalThis as any).Deno = {};
      expect(detectRuntime()).toBe('deno');
    });

    it('should detect Cloudflare', () => {
      vi.mocked(Env.get).mockReturnValue('');
      (globalThis as any).CF = {};
      (globalThis as any).ENVIRONMENT = 'production'; // Assuming this is needed
      expect(detectRuntime()).toBe('cloudflare');
    });

    it('should default to nodejs', () => {
      vi.mocked(Env.get).mockReturnValue('');
      // Ensure globals are undefined
      delete (globalThis as any).Deno;
      delete (globalThis as any).CF;
      expect(detectRuntime()).toBe('nodejs');
    });
  });

  describe('createAdapter', () => {
    it('should create LambdaAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'lambda';
        return '';
      });
      const adapter = createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(LambdaAdapter);
    });

    it('should create FargateAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'fargate';
        return '';
      });
      const adapter = createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(FargateAdapter);
    });

    it('should create CloudflareAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'cloudflare';
        return '';
      });
      const adapter = createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(CloudflareAdapter);
    });

    it('should create DenoAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'deno';
        return '';
      });
      const adapter = createAdapter(mockConfig);
      // DenoAdapter might be tricky to instantiate if it checks global Deno in constructor?
      // Checked DenoAdapter code, it doesn't check global Deno in constructor.
      expect(adapter).toBeInstanceOf(DenoAdapter);
    });

    it('should create NodeServerAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'nodejs';
        return '';
      });
      const adapter = createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(NodeServerAdapter);
    });
  });
});
