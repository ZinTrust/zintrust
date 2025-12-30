import { Cloudflare } from '@config/cloudflare';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Cloudflare helpers (extra)', () => {
  beforeEach(() => {
    // Ensure clean global env
    delete (globalThis as any).env;
  });

  afterEach(() => {
    delete (globalThis as any).env;
    delete (globalThis as any).DB;
    vi.restoreAllMocks();
  });

  it('getWorkersEnv returns null when globalThis.env is missing or not an object', () => {
    expect(Cloudflare.getWorkersEnv()).toBeNull();

    (globalThis as any).env = 'not-an-object';
    expect(Cloudflare.getWorkersEnv()).toBeNull();
  });

  it('getWorkersEnv returns env when properly set', () => {
    (globalThis as any).env = { FOO: 'bar' };
    const ev = Cloudflare.getWorkersEnv();
    expect(ev).not.toBeNull();
    expect(ev?.['FOO']).toBe('bar');
  });

  it('getD1Binding falls back to globalThis.DB when workers env missing', () => {
    (globalThis as any).DB = { name: 'global-db' } as any;
    const binding = Cloudflare.getD1Binding({} as any);
    expect(binding).toBeDefined();
    expect((binding as any).name).toBe('global-db');
  });
});
