import { afterEach, describe, expect, it, vi } from 'vitest';

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createStorage = () => ({
  writeEntry: vi.fn().mockResolvedValue(undefined),
});

describe('extended trace watchers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records outbound HTTP request and response payloads', async () => {
    vi.resetModules();

    const { HttpClientWatcher } = await import('../../src/watchers/HttpClientWatcher');
    const storage = createStorage();

    HttpClientWatcher.register({
      storage,
      config: {
        watchers: { clientRequest: true },
        ignoreRoutes: [],
        redaction: { keys: ['authorization'], headers: [], body: ['token'], query: [] },
      },
    } as never);

    HttpClientWatcher.emit({
      method: 'post',
      url: 'https://example.test/users',
      requestHeaders: { Authorization: 'Bearer secret' },
      responseStatus: 201,
      duration: 18,
      requestBody: { email: 'user@example.com', token: 'abc' },
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: { ok: true, token: 'hidden' },
    });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'client_request',
        content: expect.objectContaining({
          requestHeaders: { Authorization: '****' },
          requestBody: { email: 'user@example.com', token: '****' },
          responseHeaders: { 'content-type': 'application/json' },
          responseBody: { ok: true, token: '****' },
        }),
      })
    );
  });

  it('only records cache payloads when the config enables them', async () => {
    vi.resetModules();

    const { CacheWatcher } = await import('../../src/watchers/CacheWatcher');
    const disabledStorage = createStorage();
    CacheWatcher.register({
      storage: disabledStorage,
      config: {
        watchers: { cache: true },
        captureCachePayloads: false,
        ignoreRoutes: [],
        redaction: { keys: [], headers: [], body: [], query: ['secret'] },
      },
    } as never);

    CacheWatcher.emit('set', 'user=1', 4, undefined, { secret: 'value' }, 'redis', 60);
    await flushAsync();

    expect(disabledStorage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          payloadLogged: false,
        }),
      })
    );

    const enabledStorage = createStorage();
    CacheWatcher.register({
      storage: enabledStorage,
      config: {
        watchers: { cache: true },
        captureCachePayloads: true,
        ignoreRoutes: [],
        redaction: { keys: [], headers: [], body: [], query: ['secret'] },
      },
    } as never);

    CacheWatcher.emit('set', 'user=1', 4, undefined, { secret: 'value' }, 'redis', 60);
    await flushAsync();

    expect(enabledStorage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          payloadLogged: true,
          payload: { secret: '****' },
          store: 'redis',
          ttl: 60,
        }),
      })
    );
  });

  it('records rendered mail and notification payloads', async () => {
    vi.resetModules();

    const { MailWatcher } = await import('../../src/watchers/MailWatcher');
    const { NotificationWatcher } = await import('../../src/watchers/NotificationWatcher');
    const mailStorage = createStorage();
    const notificationStorage = createStorage();

    MailWatcher.register({
      storage: mailStorage,
      config: {
        watchers: { mail: true },
        ignoreRoutes: [],
        redaction: { keys: ['token'], headers: [], body: ['token'], query: [] },
      },
    } as never);
    NotificationWatcher.register({
      storage: notificationStorage,
      config: {
        watchers: { notification: true },
        ignoreRoutes: [],
        redaction: { keys: ['token'], headers: [], body: ['token'], query: [] },
      },
    } as never);

    MailWatcher.emit('user@example.com', 'Welcome', undefined, 'Plain token', '<div>token</div>');
    NotificationWatcher.emit('sms', ['twilio'], '+123', 'otp token', { token: '1234' });
    await flushAsync();

    expect(mailStorage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mail',
        content: expect.objectContaining({
          text: 'Plain token',
          html: '<div>token</div>',
        }),
      })
    );
    expect(notificationStorage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'notification',
        content: expect.objectContaining({
          message: 'otp token',
          payload: { token: '****' },
        }),
      })
    );
  });
});
