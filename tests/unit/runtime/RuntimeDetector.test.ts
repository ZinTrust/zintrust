/* eslint-disable max-nested-callbacks */
import { ApplicationBootstrap, RuntimeDetector } from '@/runtime/RuntimeDetector';
import { Env } from '@config/env';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import { DenoAdapter } from '@runtime/adapters/DenoAdapter';
import { FargateAdapter } from '@runtime/adapters/FargateAdapter';
import { LambdaAdapter } from '@runtime/adapters/LambdaAdapter';
import { NodeServerAdapter } from '@runtime/adapters/NodeServerAdapter';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const adapterState = vi.hoisted(() => {
  let lastConfig: unknown;
  let omitStartServer = false;

  class BaseAdapterMock {
    public readonly config: unknown;

    public constructor(config: unknown) {
      this.config = config;
      lastConfig = config;
    }

    public getLogger(): unknown {
      return (this.config as { logger?: unknown }).logger;
    }
  }

  class ServerAdapterMock extends BaseAdapterMock {
    public constructor(config: unknown) {
      super(config);
      if (omitStartServer === true) {
        (this as unknown as { startServer?: unknown }).startServer = undefined;
      }
    }

    public async startServer(_port: number, _host: string): Promise<void> {
      return;
    }
  }

  return {
    BaseAdapterMock,
    ServerAdapterMock,
    getLastConfig: (): unknown => lastConfig,
    setOmitStartServer: (value: boolean): void => {
      omitStartServer = value;
    },
    getOmitStartServer: (): boolean => omitStartServer,
    reset: (): void => {
      lastConfig = undefined;
      omitStartServer = false;
    },
  };
});

// Mock Env used by RuntimeDetector.ts
vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_: string, defaultValue: string = '') => defaultValue),
    NODE_ENV: 'test',
    REQUEST_TIMEOUT: 30_000,
    MAX_BODY_SIZE: 1_000_000,
    PORT: 3333,
    HOST: '127.0.0.1',
  },
}));

// Mock framework Logger used by createDefaultLogger()
vi.mock('@config/logger', () => ({
  default: mockLogger,
}));

vi.mock('@runtime/adapters/LambdaAdapter', () => ({
  LambdaAdapter: {
    create: (config: unknown) => new adapterState.BaseAdapterMock(config),
  },
}));

vi.mock('@runtime/adapters/CloudflareAdapter', () => ({
  CloudflareAdapter: {
    create: (config: unknown) => new adapterState.BaseAdapterMock(config),
  },
}));

vi.mock('@runtime/adapters/FargateAdapter', () => ({
  FargateAdapter: {
    create: (config: unknown) => new adapterState.ServerAdapterMock(config),
  },
}));

vi.mock('@runtime/adapters/DenoAdapter', () => ({
  DenoAdapter: {
    create: (config: unknown) => new adapterState.ServerAdapterMock(config),
    startServer: async () => undefined,
    getKV: async () => undefined,
    getEnvVar: () => '',
    isDeployEnvironment: () => false,
  },
}));

vi.mock('@runtime/adapters/NodeServerAdapter', () => ({
  NodeServerAdapter: {
    create: (config: unknown) => new adapterState.ServerAdapterMock(config),
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
    adapterState.reset();

    const globals = globalThis as unknown as Record<string, unknown>;
    delete globals['Deno'];
    delete globals['CF'];
    delete globals['ENVIRONMENT'];
  });

  describe('detectRuntime', () => {
    it('should respect explicit RUNTIME env var', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'fargate';
        return '';
      });
      expect(RuntimeDetector.detectRuntime()).toBe('fargate');
    });

    it('should auto-detect when RUNTIME=auto', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'auto';
        if (key === 'AWS_LAMBDA_FUNCTION_NAME') return 'my-func';
        return '';
      });

      expect(RuntimeDetector.detectRuntime()).toBe('lambda');
    });

    it('should detect Lambda', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'AWS_LAMBDA_FUNCTION_NAME') return 'my-func';
        return '';
      });
      expect(RuntimeDetector.detectRuntime()).toBe('lambda');
    });

    it('should detect Deno', () => {
      vi.mocked(Env.get).mockReturnValue('');
      (globalThis as unknown as Record<string, unknown>)['Deno'] = {};
      expect(RuntimeDetector.detectRuntime()).toBe('deno');
    });

    it('should detect Cloudflare', () => {
      vi.mocked(Env.get).mockReturnValue('');
      (globalThis as unknown as Record<string, unknown>)['CF'] = {};
      (globalThis as unknown as Record<string, unknown>)['ENVIRONMENT'] = 'production';
      expect(RuntimeDetector.detectRuntime()).toBe('cloudflare');
    });

    it('should default to nodejs', () => {
      vi.mocked(Env.get).mockReturnValue('');
      // Ensure globals are undefined
      const globals = globalThis as unknown as Record<string, unknown>;
      delete globals['Deno'];
      delete globals['CF'];
      expect(RuntimeDetector.detectRuntime()).toBe('nodejs');
    });
  });

  describe('createAdapter', () => {
    it('should create LambdaAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'lambda';
        return '';
      });
      const adapter = RuntimeDetector.createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(LambdaAdapter);
    });

    it('should create FargateAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'fargate';
        return '';
      });
      const adapter = RuntimeDetector.createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(FargateAdapter);
    });

    it('should create CloudflareAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'cloudflare';
        return '';
      });
      const adapter = RuntimeDetector.createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(CloudflareAdapter);
    });

    it('should create DenoAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'deno';
        return '';
      });
      const adapter = RuntimeDetector.createAdapter(mockConfig);
      // DenoAdapter might be tricky to instantiate if it checks global Deno in constructor?
      // Checked DenoAdapter code, it doesn't check global Deno in constructor.
      expect(adapter).toBeInstanceOf(DenoAdapter);
    });

    it('should create NodeServerAdapter', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'nodejs';
        return '';
      });
      const adapter = RuntimeDetector.createAdapter(mockConfig);
      expect(adapter).toBeInstanceOf(NodeServerAdapter);
    });
  });

  describe('createAdapterForRuntime', () => {
    it('should create adapter for runtime (case-insensitive) and log', () => {
      const adapter = RuntimeDetector.createAdapterForRuntime('LaMbDa', mockConfig);
      expect(adapter).toBeInstanceOf(LambdaAdapter);
      expect(mockConfig.logger.info).toHaveBeenCalledWith('Using Lambda adapter');
    });

    it('should default to NodeServerAdapter for unknown runtime', () => {
      const adapter = RuntimeDetector.createAdapterForRuntime('weird-runtime', mockConfig);
      expect(adapter).toBeInstanceOf(NodeServerAdapter);
      expect(mockConfig.logger.info).toHaveBeenCalledWith('Using Node.js HTTP server adapter');
    });

    it('should use default logger when config.logger is missing', () => {
      const adapter = RuntimeDetector.createAdapterForRuntime('nodejs', {
        handler: vi.fn(),
      });

      expect(adapter).toBeInstanceOf(NodeServerAdapter);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Using Node.js HTTP server adapter',
        undefined
      );
    });
  });

  describe('getRuntimeInfo', () => {
    it('should include lambda metadata when runtime=lambda', () => {
      vi.mocked(Env.get).mockImplementation((key, defaultValue = '') => {
        if (key === 'RUNTIME') return 'lambda';
        if (key === 'AWS_LAMBDA_FUNCTION_NAME') return 'fn';
        if (key === 'AWS_LAMBDA_FUNCTION_VERSION') return '1';
        if (key === 'AWS_REGION') return 'us-east-1';
        return defaultValue;
      });

      const info = RuntimeDetector.getRuntimeInfo();
      expect(info['detected_runtime']).toBe('lambda');
      expect(info['lambda_function_name']).toBe('fn');
      expect(info['lambda_function_version']).toBe('1');
      expect(info['aws_region']).toBe('us-east-1');
    });

    it('should include deno version when runtime=deno', () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'deno';
        return '';
      });

      (globalThis as unknown as Record<string, unknown>)['Deno'] = {
        version: { deno: '2.0.0' },
      };

      const info = RuntimeDetector.getRuntimeInfo();
      expect(info['detected_runtime']).toBe('deno');
      expect(info['deno_version']).toBe('2.0.0');
    });
  });

  describe('bootstrap lifecycle', () => {
    it('initialize should start server for nodejs runtime', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'nodejs';
        return '';
      });

      const startSpy = vi.spyOn(adapterState.ServerAdapterMock.prototype, 'startServer');

      await ApplicationBootstrap.initialize(vi.fn());

      const config = adapterState.getLastConfig() as {
        logger: {
          debug: (...args: unknown[]) => void;
          info: (...args: unknown[]) => void;
          warn: (...args: unknown[]) => void;
          error: (...args: unknown[]) => void;
        };
      };

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Application initializing',
        expect.objectContaining({ detected_runtime: 'nodejs' })
      );

      expect(startSpy).toHaveBeenCalledWith(Env.PORT, Env.HOST);

      // exercise createDefaultLogger methods for coverage
      config.logger.debug('d', { a: 1 });
      config.logger.debug('d2');
      config.logger.warn('w', { b: 2 });
      config.logger.warn('w2');
      config.logger.error('e', new Error('boom'));
      config.logger.error('e2', 'nope');
      expect(mockLogger.debug).toHaveBeenCalledWith('[Runtime] d', { a: 1 });
      expect(mockLogger.debug).toHaveBeenCalledWith('[Runtime] d2', undefined);
      expect(mockLogger.warn).toHaveBeenCalledWith('[Runtime] w', { b: 2 });
      expect(mockLogger.warn).toHaveBeenCalledWith('[Runtime] w2', undefined);
      expect(mockLogger.error).toHaveBeenCalledWith('[Runtime] e', { error: 'boom' });
      expect(mockLogger.error).toHaveBeenCalledWith('[Runtime] e2', { error: 'nope' });
    });

    it('initialize should skip server start when node adapter has no startServer', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'nodejs';
        return '';
      });
      adapterState.setOmitStartServer(true);

      const startSpy = vi.spyOn(adapterState.ServerAdapterMock.prototype, 'startServer');
      await ApplicationBootstrap.initialize(vi.fn());
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('initialize should start server for deno runtime with 0.0.0.0 host', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'deno';
        return '';
      });

      const startSpy = vi.spyOn(adapterState.ServerAdapterMock.prototype, 'startServer');

      await ApplicationBootstrap.initialize(vi.fn());

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Application initializing',
        expect.objectContaining({ detected_runtime: 'deno' })
      );

      expect(startSpy).toHaveBeenCalledWith(Env.PORT, '0.0.0.0');
    });

    it('initialize should skip server start when deno adapter has no startServer', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'deno';
        return '';
      });
      adapterState.setOmitStartServer(true);

      const startSpy = vi.spyOn(adapterState.ServerAdapterMock.prototype, 'startServer');
      await ApplicationBootstrap.initialize(vi.fn());
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('initialize should not start server for lambda runtime', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'lambda';
        return '';
      });

      await ApplicationBootstrap.initialize(vi.fn());
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Adapter initialized, ready for events',
        undefined
      );
    });

    it('initialize should not start server for cloudflare runtime', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'cloudflare';
        return '';
      });

      await ApplicationBootstrap.initialize(vi.fn());
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Adapter initialized, ready for events',
        undefined
      );
    });

    it('initialize should start server for fargate runtime', async () => {
      vi.mocked(Env.get).mockImplementation((key) => {
        if (key === 'RUNTIME') return 'fargate';
        return '';
      });

      const startSpy = vi.spyOn(adapterState.ServerAdapterMock.prototype, 'startServer');
      await ApplicationBootstrap.initialize(vi.fn());
      expect(startSpy).toHaveBeenCalledWith(Env.PORT, Env.HOST);
    });

    it('shutdown should call process.exit(0) and log signal', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      await ApplicationBootstrap.shutdown('SIGINT');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Received SIGINT, gracefully shutting down...',
        undefined
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('shutdown should default to SIGTERM', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      await ApplicationBootstrap.shutdown();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Runtime] Received SIGTERM, gracefully shutting down...',
        undefined
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('setupGracefulShutdown should register SIGTERM and SIGINT handlers', async () => {
      const handlers: Record<string, () => void> = {};
      const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, cb: () => void) => {
        handlers[event] = cb;
        return process;
      }) as never);

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

      ApplicationBootstrap.setupGracefulShutdown();
      expect(onSpy).toHaveBeenCalled();
      expect(typeof handlers['SIGTERM']).toBe('function');
      expect(typeof handlers['SIGINT']).toBe('function');

      await (handlers['SIGTERM'] as unknown as () => Promise<void>)();
      await (handlers['SIGINT'] as unknown as () => Promise<void>)();
      expect(exitSpy).toHaveBeenCalledWith(0);

      exitSpy.mockRestore();
      onSpy.mockRestore();
    });
  });
});
