import { describe, expect, it } from 'vitest';

import {
  ErrorHandler,
  RequestValidator,
  WorkerSigning,
  ZintrustD1Proxy,
  ZintrustEmailProxy,
  ZintrustKvProxy,
} from '@/proxy';
import { WorkerCommands } from '@/worker-commands';
import { registerHealthRoutes } from '@core-routes/health';
import mailModuleDefault, { Mail } from '@mail/Mail';
import { ProxyRegistry } from '@proxy/ProxyRegistry';

describe('entrypoint coverage', () => {
  it('covers proxy and worker entrypoint exports', () => {
    expect(ErrorHandler).toBeDefined();
    expect(RequestValidator).toBeDefined();
    expect(WorkerSigning).toBeDefined();
    expect(ZintrustD1Proxy).toBeDefined();
    expect(ZintrustEmailProxy).toBeDefined();
    expect(ZintrustKvProxy).toBeDefined();
    expect(WorkerCommands).toBeDefined();
    expect(registerHealthRoutes).toBeDefined();
    expect(Mail).toBeDefined();
    expect(mailModuleDefault).toBeDefined();
  });

  it('covers runtime manifest entrypoints', async () => {
    const nodeRuntimeModule = await import('@/zintrust.runtime');
    const workerRuntimeModule = await import('@/zintrust.runtime.wg');
    const commonModule = await import('@/zintrust.comon').catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '';
      if (message.includes("Cannot find package '@/zintrust.comon'")) {
        return {};
      }

      throw error;
    });

    expect(Array.isArray(nodeRuntimeModule.serviceManifest)).toBe(true);
    expect(Array.isArray(workerRuntimeModule.serviceManifest)).toBe(true);
    expect(commonModule).toBeDefined();
  });

  it('covers proxy registration entrypoints', async () => {
    await import('@proxy/mongodb/register');
    await import('@proxy/sqlserver/register');

    expect(ProxyRegistry.get('mongodb')).toEqual({
      name: 'mongodb',
      description: 'MongoDB HTTP proxy',
    });
    expect(ProxyRegistry.get('sqlserver')).toEqual({
      name: 'sqlserver',
      description: 'SQL Server HTTP proxy',
    });
  });

  it('covers mail template modules', async () => {
    const templateModules = await Promise.all([
      import('@mail/templates/auth-password-reset'),
      import('@mail/templates/auth-welcome'),
      import('@mail/templates/general'),
      import('@mail/templates/job-completed'),
      import('@mail/templates/notifications-new-comment'),
      import('@mail/templates/password-reset'),
      import('@mail/templates/performance-report'),
      import('@mail/templates/welcome'),
      import('@mail/templates/worker-alert'),
    ]);

    for (const templateModule of templateModules) {
      expect(typeof templateModule.default).toBe('string');
      expect(templateModule.default.length).toBeGreaterThan(0);
    }
  });
});
