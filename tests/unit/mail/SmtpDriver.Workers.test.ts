import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const createWorkersSocket = (responses: string[][]) => {
  class MockSocket extends EventEmitter {
    private index = 0;

    write(_data: string, cb?: (err?: Error | null) => void): void {
      cb?.();
      this.emitNext();
    }

    end(): void {
      // noop
    }

    async startTls(): Promise<void> {
      // noop
    }

    emitNext(): void {
      const batch = responses[this.index];
      if (!batch) return;
      this.index += 1;
      for (const line of batch) {
        this.emit('data', Buffer.from(`${line}\r\n`));
      }
    }
  }

  const socket = new MockSocket();
  setTimeout(() => {
    socket.emit('connect');
    socket.emitNext();
  }, 0);

  return socket;
};

vi.mock('@sockets/CloudflareSocket', () => {
  return {
    CloudflareSocket: {
      create: () =>
        createWorkersSocket([
          ['220 welcome'],
          ['250-STARTTLS', '250 OK'],
          ['220 Ready to start TLS'],
          ['250 OK'],
          ['250 OK'],
          ['250 OK'],
          ['354 Continue'],
          ['250 Queued'],
          ['221 Bye'],
        ]),
    },
  };
});

import { SmtpDriver } from '@/tools/mail/drivers/Smtp';

describe('SmtpDriver (Workers)', () => {
  it('sends message with STARTTLS using Cloudflare sockets', async () => {
    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = {};

    const res = await SmtpDriver.send({ host: 'smtp.example.com', port: 587, secure: 'starttls' }, {
      to: 'a@b.com',
      from: { email: 'from@ex.com' },
      subject: 's',
      text: 't',
    } as any);

    expect(res.ok).toBe(true);
    expect(res.provider).toBe('smtp');

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }
  });
});
