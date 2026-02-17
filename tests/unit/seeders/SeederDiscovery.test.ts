import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  resolve: vi.fn((...parts: string[]) => parts.join('/')),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}));

vi.mock('@node-singletons/fs', () => ({
  default: {
    existsSync: (...args: any[]) => mocked.existsSync(...args),
    readdirSync: (...args: any[]) => mocked.readdirSync(...args),
  },
}));

vi.mock('@node-singletons/path', () => ({
  resolve: (...args: any[]) => mocked.resolve(...args),
  join: (...args: any[]) => mocked.join(...args),
}));

describe('SeederDiscovery', () => {
  it('resolveDir uses path.resolve', async () => {
    const { SeederDiscovery } = await import('@/seeders/SeederDiscovery');
    expect(SeederDiscovery.resolveDir('/root', 'database/seeders')).toBe('/root/database/seeders');
  });

  it('listSeederFiles filters and sorts seeder files', async () => {
    mocked.existsSync.mockReturnValue(true);
    mocked.readdirSync.mockReturnValue(['b.ts', 'a.js', 'x.d.ts', 'c.txt']);

    const { SeederDiscovery } = await import('@/seeders/SeederDiscovery');
    const out = SeederDiscovery.listSeederFiles('/seeders');

    expect(out).toEqual(['/seeders/a.js', '/seeders/b.ts']);
  });

  it('listSeederFiles returns [] when directory is missing', async () => {
    mocked.existsSync.mockReturnValue(false);
    const { SeederDiscovery } = await import('@/seeders/SeederDiscovery');
    expect(SeederDiscovery.listSeederFiles('/missing')).toEqual([]);
  });
});
