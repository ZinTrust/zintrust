import { describe, expect, it } from 'vitest';

import { FakeStorage } from '@/tools/storage/testing';

const b = (s: string) => Buffer.from(s);

describe('FakeStorage coverage', () => {
  it('throws from assertExists when missing', () => {
    FakeStorage.reset();

    expect(() => FakeStorage.assertExists('disk', 'missing.txt')).toThrow(
      'Expected disk:missing.txt to exist in FakeStorage'
    );
  });

  it('throws from assertMissing when present', async () => {
    FakeStorage.reset();
    await FakeStorage.put('disk', 'present.txt', b('x'));

    expect(() => FakeStorage.assertMissing('disk', 'present.txt')).toThrow(
      'Expected disk:present.txt to be missing in FakeStorage'
    );
  });

  it('reset clears stored puts', async () => {
    FakeStorage.reset();
    await FakeStorage.put('disk', 'a.txt', b('a'));
    await FakeStorage.put('disk', 'b.txt', b('b'));

    expect(FakeStorage.getPuts()).toHaveLength(2);

    FakeStorage.reset();
    expect(FakeStorage.getPuts()).toHaveLength(0);
  });

  it('tempUrl uses defaults when options omitted', async () => {
    FakeStorage.reset();

    await expect(FakeStorage.tempUrl('disk', 'x.txt')).resolves.toBe(
      'fake://disk/x.txt?expiresIn=900&method=GET'
    );
  });

  it('url builds a fake:// URL', () => {
    FakeStorage.reset();

    expect(FakeStorage.url('disk', 'path/to.txt')).toBe('fake://disk/path/to.txt');
  });

  it('get throws NOT_FOUND when missing', () => {
    FakeStorage.reset();

    expect(() => FakeStorage.get('disk', 'missing.txt')).toThrow(
      'FakeStorage: disk:missing.txt not found'
    );
  });

  it('assertMissing does not throw when missing', () => {
    FakeStorage.reset();

    expect(() => FakeStorage.assertMissing('disk', 'missing.txt')).not.toThrow();
  });
});
