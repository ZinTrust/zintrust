/* eslint-disable max-nested-callbacks */
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: JwtAuthMiddleware.hydrateJwtRequestContext', () => {
  it('hydrates user, sub, and tenantId from verified payload', async () => {
    vi.resetModules();

    vi.doMock('@http/RequestContext', () => ({
      RequestContext: {
        setUserId: vi.fn(),
        setTenantId: vi.fn(),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          algorithm: 'HS256',
          secret: 'secret',
        },
      },
    }));

    vi.doMock('@security/JwtSessions', () => ({
      JwtSessions: {
        isActive: vi.fn(async () => true),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({ sub: 'user_123', tenantId: 'tenant_abc' })),
        })),
      },
    }));

    const next = vi.fn(async () => undefined);

    // We need to re-import RequestContext to get the mocked version
    const { RequestContext: MockedRequestContext } = await import('@http/RequestContext');
    const { JwtAuthMiddleware: MockedJwtAuthMiddleware } =
      await import('@middleware/JwtAuthMiddleware');

    const auth = MockedJwtAuthMiddleware.create();

    const mockReq = {
      getHeader: () => 'Bearer valid_token',
      user: undefined,
    } as unknown as IRequest;

    const mockRes = {} as IResponse;

    await auth(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
    expect(mockReq.user).toEqual({ sub: 'user_123', tenantId: 'tenant_abc' });
    expect(MockedRequestContext.setUserId).toHaveBeenCalledWith(mockReq, 'user_123');
    expect(MockedRequestContext.setTenantId).toHaveBeenCalledWith(mockReq, 'tenant_abc');
  });

  it('hydrates tenant_id if tenantId is missing', async () => {
    vi.resetModules();

    vi.doMock('@http/RequestContext', () => ({
      RequestContext: {
        setUserId: vi.fn(),
        setTenantId: vi.fn(),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: vi.fn(),
      },
    }));

    vi.doMock('@config/security', () => ({
      securityConfig: {
        jwt: {
          algorithm: 'HS256',
          secret: 'secret',
        },
      },
    }));

    vi.doMock('@security/JwtSessions', () => ({
      JwtSessions: {
        isActive: vi.fn(async () => true),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({ sub: 'user_456', tenant_id: 888 })), // test numeric tenant_id too
        })),
      },
    }));

    const next = vi.fn(async () => undefined);

    const { RequestContext: MockedRequestContext } = await import('@http/RequestContext');
    const { JwtAuthMiddleware: MockedJwtAuthMiddleware } =
      await import('@middleware/JwtAuthMiddleware');

    const auth = MockedJwtAuthMiddleware.create();

    const mockReq = {
      getHeader: () => 'Bearer valid_token_2',
      user: undefined,
    } as unknown as IRequest;

    const mockRes = {} as IResponse;

    await auth(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
    expect(MockedRequestContext.setUserId).toHaveBeenCalledWith(mockReq, 'user_456');
    expect(MockedRequestContext.setTenantId).toHaveBeenCalledWith(mockReq, '888');
  });
});
