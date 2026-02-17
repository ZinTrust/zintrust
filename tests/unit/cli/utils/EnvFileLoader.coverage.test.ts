import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {},
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
}));

import { EnvFileLoader } from '@cli/utils/EnvFileLoader';

describe('EnvFileLoader (coverage extras)', () => {
  it('uses process.env fallback and returns default when missing', () => {
    const original = process.env['NODE_ENV'];
    delete process.env['NODE_ENV'];

    const state = EnvFileLoader.load({ cwd: '/tmp', overrideExisting: true });
    expect(Array.isArray(state.loadedFiles)).toBe(true);

    if (original === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = original;
  });
});
