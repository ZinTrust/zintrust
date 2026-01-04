import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Manifest } from '../../../../src/toolkit/Secrets/Manifest';

const TMP_DIR = path.join(process.cwd(), 'tests', 'tmp');

describe('Manifest', () => {
  beforeEach(async () => {
    try {
      await fs.mkdir(TMP_DIR, { recursive: true });
    } catch {}
  });

  afterEach(async () => {
    // cleanup tmp files
    try {
      const files = await fs.readdir(TMP_DIR);
      await Promise.all(files.map((f) => fs.unlink(path.join(TMP_DIR, f))));
    } catch {}
  });

  it('loads provider from file and parses keys', async () => {
    const content = {
      provider: 'aws',
      keys: {
        FOO: { aws: { secretId: 's1', jsonKey: 'k' } },
        BAR: { cloudflare: { key: 'k1', namespaceId: 'ns' } },
      },
    };
    const file = path.join(TMP_DIR, 'm1.json');
    await fs.writeFile(file, JSON.stringify(content), 'utf-8');

    const m = await Manifest.load({ cwd: TMP_DIR, path: 'm1.json', provider: 'cloudflare' });
    expect(m.provider).toBe('aws');
    expect(Object.keys(m.keys)).toContain('FOO');
    expect(Object.keys(m.keys)).toContain('BAR');
    expect(m.keys.FOO.aws?.secretId).toBe('s1');
    expect(m.keys.FOO.aws?.jsonKey).toBe('k');
    expect(m.keys.BAR.cloudflare?.key).toBe('k1');
    expect(m.keys.BAR.cloudflare?.namespaceId).toBe('ns');
  });

  it('uses fallback provider when provider missing', async () => {
    const content = { keys: { FOO: { aws: { secretId: 's' } } } };
    const file = path.join(TMP_DIR, 'm2.json');
    await fs.writeFile(file, JSON.stringify(content), 'utf-8');

    const m = await Manifest.load({ cwd: TMP_DIR, path: 'm2.json', provider: 'cloudflare' });
    expect(m.provider).toBe('cloudflare');
  });

  it('throws when provider invalid', async () => {
    const content = { provider: 'gcp', keys: {} } as any;
    const file = path.join(TMP_DIR, 'm3.json');
    await fs.writeFile(file, JSON.stringify(content), 'utf-8');

    await expect(Manifest.load({ cwd: TMP_DIR, path: 'm3.json', provider: 'aws' })).rejects.toThrow(
      /Manifest: provider must be aws\|cloudflare/
    );
  });

  it('throws when keys is not object', async () => {
    const content = { provider: 'aws', keys: 'nope' } as any;
    const file = path.join(TMP_DIR, 'm4.json');
    await fs.writeFile(file, JSON.stringify(content), 'utf-8');

    await expect(Manifest.load({ cwd: TMP_DIR, path: 'm4.json', provider: 'aws' })).rejects.toThrow(
      /Manifest: keys must be an object/
    );
  });

  it('throws on invalid env key name', async () => {
    const content = { provider: 'aws', keys: { 'bad-key': { aws: { secretId: 's' } } } };
    const file = path.join(TMP_DIR, 'm5.json');
    await fs.writeFile(file, JSON.stringify(content), 'utf-8');

    await expect(Manifest.load({ cwd: TMP_DIR, path: 'm5.json', provider: 'aws' })).rejects.toThrow(
      /Manifest: invalid env key: bad-key/
    );
  });

  it('throws when key spec missing required fields', async () => {
    const content = { provider: 'aws', keys: { FOO: { aws: {} } } } as any;
    const file = path.join(TMP_DIR, 'm6.json');
    await fs.writeFile(file, JSON.stringify(content), 'utf-8');

    await expect(Manifest.load({ cwd: TMP_DIR, path: 'm6.json', provider: 'aws' })).rejects.toThrow(
      /Manifest: missing\/invalid keys\.FOO\.aws\.secretId/
    );
  });

  it('throws when manifest JSON is not an object', async () => {
    const file = path.join(TMP_DIR, 'm7.json');
    await fs.writeFile(file, JSON.stringify([1, 2, 3]), 'utf-8');

    await expect(Manifest.load({ cwd: TMP_DIR, path: 'm7.json', provider: 'aws' })).rejects.toThrow(
      /Manifest: expected JSON object/
    );
  });
});
