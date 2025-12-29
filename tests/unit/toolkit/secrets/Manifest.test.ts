import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({ fsPromises: { readFile: vi.fn() } }));
vi.mock('@node-singletons/path', () => ({ resolve: (cwd: string, p: string) => `${cwd}/${p}` }));

import { Manifest } from '@/toolkit/Secrets/Manifest';
import { fsPromises as fs } from '@node-singletons/fs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Manifest', () => {
  it('throws when JSON is not an object', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('"string"' as any);
    await expect(
      Manifest.load({ cwd: '/tmp', path: 'm.json', provider: 'aws' })
    ).rejects.toBeDefined();
  });

  it('throws when keys is not object', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ provider: 'aws', keys: 'nope' }) as any
    );
    await expect(
      Manifest.load({ cwd: '/tmp', path: 'm.json', provider: 'aws' })
    ).rejects.toBeDefined();
  });

  it('throws when invalid provider', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ provider: 'bad', keys: {} }) as any);
    await expect(
      Manifest.load({ cwd: '/tmp', path: 'm.json', provider: 'aws' })
    ).rejects.toBeDefined();
  });

  it('throws when invalid key name', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ keys: { 'bad-key': {} } }) as any);
    await expect(
      Manifest.load({ cwd: '/tmp', path: 'm.json', provider: 'aws' })
    ).rejects.toBeDefined();
  });

  it('parses aws and cloudflare key specs correctly and provider fallback', async () => {
    const manifest = {
      keys: {
        A: { aws: { secretId: 's1', jsonKey: 'j1' } },
        B: { cloudflare: { key: 'k1', namespaceId: 'n1' } },
      },
    } as const;

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(manifest) as any);

    const res = await Manifest.load({ cwd: '/tmp', path: 'm.json', provider: 'cloudflare' });
    expect(res.provider).toBe('cloudflare');
    expect(res.keys['A'].aws?.secretId).toBe('s1');
    expect(res.keys['A'].aws?.jsonKey).toBe('j1');
    expect(res.keys['B'].cloudflare?.key).toBe('k1');
    expect(res.keys['B'].cloudflare?.namespaceId).toBe('n1');
  });
});
