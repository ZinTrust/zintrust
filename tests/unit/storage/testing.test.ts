import FakeStorage from '@storage/testing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('FakeStorage', () => {
  beforeEach(() => {
    FakeStorage.reset();
  });

  it('records puts and returns contents via get', async () => {
    await FakeStorage.put('local', 'path/to/file.txt', Buffer.from('hello'));
    const exists = await FakeStorage.exists('local', 'path/to/file.txt');
    expect(exists).toBe(true);
    const contents = await FakeStorage.get('local', 'path/to/file.txt');
    expect(contents.toString()).toBe('hello');
  });

  it('delete removes a put', async () => {
    await FakeStorage.put('local', 'file.bin', Buffer.from([1, 2, 3]));
    await FakeStorage.delete('local', 'file.bin');
    const exists = await FakeStorage.exists('local', 'file.bin');
    expect(exists).toBe(false);
  });

  it('assertExists and assertMissing throw appropriately', async () => {
    await FakeStorage.put('s3', 'foo', Buffer.from('x'));
    expect(() => FakeStorage.assertExists('s3', 'foo')).not.toThrow();
    expect(() => FakeStorage.assertMissing('s3', 'foo')).toThrow();
  });

  it('getPuts returns recorded puts', async () => {
    await FakeStorage.put('d', 'p1', Buffer.from('a'));
    await FakeStorage.put('d', 'p2', Buffer.from('b'));
    const puts = FakeStorage.getPuts();
    expect(puts.length).toBe(2);
    expect(puts[0].path).toBe('p1');
  });
});
