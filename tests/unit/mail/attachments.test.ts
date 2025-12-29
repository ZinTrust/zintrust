import { resolveAttachments } from '@mail/attachments';
import FakeStorage from '@storage/testing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('resolveAttachments', () => {
  beforeEach(() => {
    FakeStorage.reset();
  });

  it('resolves disk attachments using provided storage', async () => {
    await FakeStorage.put('local', 'reports/test.pdf', Buffer.from('pdf-bytes'));
    const resolved = await resolveAttachments(
      [{ disk: 'local', path: 'reports/test.pdf', filename: 'report.pdf' }],
      { storage: FakeStorage }
    );
    expect(resolved.length).toBe(1);
    expect(resolved[0].filename).toBe('report.pdf');
    expect(resolved[0].content.toString()).toBe('pdf-bytes');
  });

  it('resolves inline attachments (string)', async () => {
    const resolved = await resolveAttachments([{ content: 'hello', filename: 'g.txt' }], {
      storage: FakeStorage,
    });
    expect(resolved.length).toBe(1);
    expect(resolved[0].filename).toBe('g.txt');
    expect(resolved[0].content.toString()).toBe('hello');
  });

  it('throws when storage missing for disk attachment', async () => {
    await FakeStorage.put('d', 'p', Buffer.from('x'));
    await expect(resolveAttachments([{ disk: 'd', path: 'p' }])).rejects.toThrow();
  });

  it('throws not found when storage.exists returns false', async () => {
    const storage = {
      get: async () => Buffer.from('x'),
      exists: async () => false,
    };

    await expect(
      resolveAttachments([{ disk: 'd', path: 'p' }], { storage: storage as any })
    ).rejects.toThrow(/Attachment not found/);
  });
});
