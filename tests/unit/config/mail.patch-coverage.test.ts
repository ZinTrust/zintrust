import { describe, expect, it } from 'vitest';

import { mailConfig } from '@config/mail';

describe('src/config/mail patch coverage', () => {
  it("treats blank selection as 'disabled' (when configured)", () => {
    const cfg = mailConfig.getDriver('' as any);
    expect(cfg).toMatchObject({ driver: 'disabled' });
  });

  it("throws when blank selection but 'disabled' driver is missing", async () => {
    const fakeConfig = {
      default: '',
      drivers: {},
    };

    expect(() => (mailConfig.getDriver as any).call(fakeConfig, '')).toThrow(/disabled/i);
  });

  it("throws when default is blank and 'disabled' driver is missing", () => {
    const fakeConfig = {
      default: '',
      drivers: {},
    };

    expect(() => (mailConfig.getDriver as any).call(fakeConfig, undefined)).toThrow(/disabled/i);
  });

  it("falls back to 'disabled' when default is misconfigured (legacy behavior)", () => {
    const fakeConfig = {
      default: 'missing',
      drivers: {
        disabled: { driver: 'disabled' },
      },
    };

    const cfg = (mailConfig.getDriver as any).call(fakeConfig, undefined);
    expect(cfg).toMatchObject({ driver: 'disabled' });
  });

  it("throws when default is misconfigured and 'disabled' driver is missing", () => {
    const fakeConfig = {
      default: 'missing',
      drivers: {},
    };

    expect(() => (mailConfig.getDriver as any).call(fakeConfig, undefined)).toThrow(/disabled/i);
  });
});
