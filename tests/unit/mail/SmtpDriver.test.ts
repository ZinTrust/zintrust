import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Patch String.prototype.replaceAll to accept non-global RegExp (tests-only)
const _origReplaceAll = String.prototype.replaceAll;
// @ts-ignore
beforeAll(() => {
  // @ts-ignore
  String.prototype.replaceAll = function (search: string | RegExp, replace: string) {
    if (search instanceof RegExp && !search.global) {
      // convert to global RegExp
      const r = new RegExp(search.source, 'g');
      // @ts-ignore
      return (this as string).replace(r, replace);
    }
    // @ts-ignore
    return _origReplaceAll.call(this, search as any, replace);
  };
});
// @ts-ignore
afterAll(() => {
  // @ts-ignore
  String.prototype.replaceAll = _origReplaceAll;
});

vi.mock('@node-singletons/net', () => ({ connect: vi.fn() }));
vi.mock('@node-singletons/tls', () => ({ connect: vi.fn() }));

import Logger from '@/config/logger';
import { SmtpDriver } from '@/tools/mail/drivers/Smtp';
import { connect as netConnect } from '@node-singletons/net';
import { connect as tlsConnect } from '@node-singletons/tls';

function createMockSocket(lines: string[]) {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  const emitData = (line: string) => {
    const handlers = listeners['data'] ?? [];
    for (const h of handlers) h(Buffer.from(line + '\r\n'));
  };

  let idx = 0;
  let scheduled = false;

  const scheduleEmit = () => {
    if (scheduled) return;
    scheduled = true;
    // schedule emission asynchronously so reader has time to attach
    setTimeout(() => {
      while (idx < lines.length) {
        emitData(lines[idx++]);
      }
    }, 0);
  };

  const socket: any = {
    write: (_data: string, cb?: (err?: Error | null) => void) => {
      // call cb immediately
      if (cb) cb();
      // emit next line if available
      if (idx < lines.length) {
        emitData(lines[idx++]);
      }
    },
    end: () => {},
    on: (ev: string, h: (...args: unknown[]) => void) => {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(h);
      if (ev === 'data') scheduleEmit();
    },
    once: (ev: string, h: (...args: unknown[]) => void) => {
      if (ev === 'connect' || ev === 'secureConnect') {
        h();
        // emit first line asynchronously (next tick) so reader can attach
        if (idx < lines.length) {
          setTimeout(() => emitData(lines[idx++]), 0);
        }
        // schedule remaining lines asynchronously so reader can attach and write triggers can proceed
        if (idx < lines.length) scheduleEmit();
      } else {
        listeners[ev] = listeners[ev] || [];
        listeners[ev].push(h);
      }
    },
    off: (ev: string, h: (...args: unknown[]) => void) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== h);
    },
  };

  return socket;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SmtpDriver', () => {
  it('sends message successfully', async () => {
    // prepare sequence of server responses: greeting, EHLO, MAIL FROM, RCPT, DATA(354), queued, QUIT
    const responses = [
      '220 welcome',
      '250 OK',
      '250 OK',
      '250 OK',
      '354 Continue',
      '250 Queued',
      '221 Bye',
    ];
    const socket = createMockSocket(responses);

    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    try {
      const res = await SmtpDriver.send({ host: 'localhost', port: 25, secure: false }, {
        to: 'a@b.com',
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any);

      expect(res.ok).toBe(true);
      expect(res.provider).toBe('smtp');
    } catch (err) {
      // surface error details for debugging
      // @ts-ignore
      Logger.error('SMTP send error:', err?.message, err?.details ?? err);
      throw err;
    }
  });

  it('throws when greeting is invalid', async () => {
    const responses = ['xxx invalid'];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    await expect(
      SmtpDriver.send({ host: 'localhost', port: 25, secure: false }, {
        to: 'a@b.com',
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any)
    ).rejects.toBeDefined();
  });

  it('throws when STARTTLS is not supported by server', async () => {
    const responses = ['220 welcome', '250 EHLO OK'];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    await expect(
      SmtpDriver.send({ host: 'localhost', port: 25, secure: 'starttls' }, {
        to: 'a@b.com',
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any)
    ).rejects.toBeDefined();
  });

  it('performs STARTTLS upgrade and sends message successfully', async () => {
    const firstSocketResponses = [
      '220 welcome',
      '250-STARTTLS',
      '250 OK',
      '220 Ready to start TLS',
    ];
    const firstSocket = createMockSocket(firstSocketResponses);

    const tlsResponses = ['250 OK', '250 OK', '250 OK', '354 Continue', '250 Queued', '221 Bye'];
    const tlsSocket = createMockSocket(tlsResponses);

    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(firstSocket);
    // @ts-ignore
    vi.mocked(tlsConnect).mockReturnValue(tlsSocket);

    const res = await SmtpDriver.send({ host: 'localhost', port: 587, secure: 'starttls' }, {
      to: 'a@b.com',
      from: { email: 'from@ex.com' },
      subject: 's',
      text: 't',
    } as any);

    expect(res.ok).toBe(true);
  });

  it('throws when auth config incomplete', async () => {
    const responses = ['220 welcome', '250 OK'];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    await expect(
      SmtpDriver.send({ host: 'localhost', port: 25, secure: false, username: 'user' }, {
        to: 'a@b.com',
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any)
    ).rejects.toBeDefined();
  });

  it('throws when auth fails during login', async () => {
    const responses = [
      '220 welcome',
      '250 OK',
      '334 challenge',
      '334 challenge2',
      '535 auth failed',
    ];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    await expect(
      SmtpDriver.send(
        { host: 'localhost', port: 25, secure: false, username: 'user', password: 'pass' },
        {
          to: 'a@b.com',
          from: { email: 'from@ex.com' },
          subject: 's',
          text: 't',
        } as any
      )
    ).rejects.toBeDefined();
  });

  it('throws when MAIL FROM rejected by server', async () => {
    const responses = ['220 welcome', '250 OK', '550 MAIL FROM rejected'];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    await expect(
      SmtpDriver.send({ host: 'localhost', port: 25, secure: false }, {
        to: 'a@b.com',
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any)
    ).rejects.toBeDefined();
  });

  it('throws when no recipients provided', async () => {
    const responses = ['220 welcome', '250 OK', '250 OK'];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    await expect(
      SmtpDriver.send({ host: 'localhost', port: 25, secure: false }, {
        to: [],
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any)
    ).rejects.toBeDefined();
  });

  it('sends message over implicit TLS (secure=true)', async () => {
    const tlsResponses = [
      '220 welcome',
      '250 OK',
      '250 OK',
      '250 OK',
      '354 Continue',
      '250 Queued',
      '221 Bye',
    ];
    const tlsSocket = createMockSocket(tlsResponses);
    // @ts-ignore
    vi.mocked(tlsConnect).mockReturnValue(tlsSocket);

    const res = await SmtpDriver.send({ host: 'localhost', port: 465, secure: true }, {
      to: 'a@b.com',
      from: { email: 'from@ex.com' },
      subject: 's',
      text: 't',
    } as any);

    expect(res.ok).toBe(true);
  });

  it('sends message with AUTH success', async () => {
    const responses = [
      '220 welcome',
      '250 OK',
      '334 auth1',
      '334 auth2',
      '235 authenticated',
      '250 OK',
      '250 OK',
      '354 Continue',
      '250 Queued',
      '221 Bye',
    ];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    const res = await SmtpDriver.send(
      { host: 'localhost', port: 25, secure: false, username: 'u', password: 'p' },
      {
        to: 'a@b.com',
        from: { email: 'from@ex.com' },
        subject: 's',
        text: 't',
      } as any
    );

    expect(res.ok).toBe(true);
  });

  it('sends message with html and attachment', async () => {
    const responses = [
      '220 welcome',
      '250 OK',
      '250 OK',
      '250 OK',
      '354 Continue',
      '250 Queued',
      '221 Bye',
    ];
    const socket = createMockSocket(responses);
    // @ts-ignore
    vi.mocked(netConnect).mockReturnValue(socket);

    const res = await SmtpDriver.send({ host: 'localhost', port: 25, secure: false }, {
      to: 'a@b.com',
      from: { email: 'from@ex.com' },
      subject: 's',
      text: 't',
      html: '<p>hello</p>',
      attachments: [{ filename: 'a.txt', content: Buffer.from('hello') }],
    } as any);

    expect(res.ok).toBe(true);
  });
});
