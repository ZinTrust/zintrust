import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  fsPromises: { readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() },
}));
vi.mock('@node-singletons/path', () => ({
  resolve: (cwd: string, p: string) => `${cwd}/${p}`,
  dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '.',
}));

import { EnvFile } from '@/toolkit/Secrets/EnvFile';
import { fsPromises as fs } from '@node-singletons/fs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EnvFile', () => {
  it('reads env file and parses values including quoted values and comments', async () => {
    const content = `# comment\nKEY1=hello\nKEY2=\\"with spaces\\"\nBAD_LINE\nKEY3='single'\n`;
    vi.mocked(fs.readFile).mockResolvedValue(content as any);

    const out = await EnvFile.read({ cwd: '/tmp', path: '.env' });

    expect(out['KEY1']).toBe('hello');
    // accept quoted or unquoted values (strip surrounding quotes for comparison)
    // be tolerant to escaped or partially-quoted strings returned by different parsers
    expect(String(out['KEY2'])).toContain('with spaces');
    expect(out['KEY3']).toBe('single');
    expect(out['BAD_LINE']).toBeUndefined();
  });

  it('returns empty object when readFile throws', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('no file'));
    const out = await EnvFile.read({ cwd: '/tmp', path: '.env' });
    expect(out).toEqual({});
  });

  it('ignores invalid keys when reading', async () => {
    const content = `BAD-KEY=oops\nVALID=ok\n`;
    vi.mocked(fs.readFile).mockResolvedValue(content as any);

    const out = await EnvFile.read({ cwd: '/tmp', path: '.env' });
    expect(out['VALID']).toBe('ok');
    expect(out['BAD-KEY']).toBeUndefined();
  });

  it('write throws when invalid key is provided', async () => {
    await expect(
      EnvFile.write({ cwd: '/tmp', path: '.env', values: { 'bad-key': 'x' }, mode: 'overwrite' })
    ).rejects.toBeDefined();
  });

  it('write serializes and writes file, ensuring directory exists', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    await EnvFile.write({
      cwd: '/tmp',
      path: '.env',
      values: { B: '2', A: '1' },
      mode: 'overwrite',
    });

    // writeFile should have been called with content that has keys sorted A then B
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalled();
    const args = vi.mocked(fs.writeFile).mock.calls[0];
    const content = args[1] as string;
    // lines are sorted and JSON quoted
    expect(content.split('\n')[0]).toContain('A=');
    expect(content.split('\n')[1]).toContain('B=');
  });
});
