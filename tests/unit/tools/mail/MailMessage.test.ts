import * as utility from '@/common/utility';
import { buildRfc2822Message } from '@tools/mail/MailMessage';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('buildRfc2822Message', () => {
  it('includes Date and Message-ID headers using the sender domain', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T16:30:00.000Z'));

    const uuidSpy = vi.spyOn(utility, 'generateUuid');
    uuidSpy.mockReturnValue('8856a43e-dc8b-4dd5-b616-2312fe3621c1');

    const raw = buildRfc2822Message({
      from: { email: 'from@example.com', name: 'From' },
      to: 'first@example.com',
      subject: 'Hello',
      text: 'Plain text body',
    });

    expect(raw).toContain('Date: Fri, 15 May 2026 16:30:00 GMT');
    expect(raw).toContain('Message-ID: <8856a43edc8b4dd5b6162312fe3621c1@example.com>');
  });

  it('falls back to localhost when the sender domain is unusable', () => {
    const uuidSpy = vi.spyOn(utility, 'generateUuid');
    uuidSpy.mockReturnValue('8856a43e-dc8b-4dd5-b616-2312fe3621c1');

    const raw = buildRfc2822Message({
      from: { email: 'from' },
      to: 'first@example.com',
      subject: 'Hello',
      text: 'Plain text body',
    });

    expect(raw).toContain('Message-ID: <8856a43edc8b4dd5b6162312fe3621c1@localhost>');
  });
});
