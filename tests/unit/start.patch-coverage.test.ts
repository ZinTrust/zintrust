import { describe, expect, it, vi } from 'vitest';

vi.mock('@lang/lang', () => ({
  ZintrustLang: {
    UNDEFINED: 'undefined',
    OBJECT: 'object',
    FILE_PROTOCOL: 'file://',
    BOOTSTRAPJS: 'bootstrap.js',
  },
}));

vi.mock('@functions/cloudflare', () => ({
  default: {},
}));

vi.mock('@functions/deno', () => ({
  default: async () => undefined,
}));

vi.mock('@functions/lambda', () => ({
  handler: vi.fn(),
}));

vi.mock('/opt/homebrew/var/www/Sites/zintrust/src/boot/bootstrap.js', () => ({}), {
  virtual: true,
});

describe('start', () => {
  it('imports bootstrap in Node runtime', async () => {
    const { start } = await import('@/start');

    await expect(start()).resolves.toBeUndefined();
  });
});
