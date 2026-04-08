import { describe, expect, it } from 'vitest';

import { TraceConfig } from '../../src/config';

describe('TraceConfig', () => {
  it('merges custom redaction keys without dropping the defaults', () => {
    const config = TraceConfig.merge({
      redaction: {
        keys: ['pin', 'authorization'],
        headers: ['x-custom-auth'],
        body: ['cardPin'],
        query: ['auth_code'],
      },
    });

    expect(config.redaction.keys).toEqual(
      expect.arrayContaining(['password', 'authorization', 'pin'])
    );
    expect(config.redaction.headers).toEqual(
      expect.arrayContaining(['authorization', 'x-custom-auth'])
    );
    expect(config.redaction.body).toEqual(expect.arrayContaining(['password', 'cardPin']));
    expect(config.redaction.query).toEqual(expect.arrayContaining(['auth_code']));
  });

  it('returns union redaction fields for a specific channel', () => {
    const config = TraceConfig.merge({
      redaction: {
        keys: ['pin'],
        headers: ['x-secret-header'],
        body: ['cardPin'],
        query: [],
      },
    });

    expect(TraceConfig.getRedactionFields(config, 'headers')).toEqual(
      expect.arrayContaining(['pin', 'authorization', 'x-secret-header'])
    );
    expect(TraceConfig.getRedactionFields(config, 'body')).toEqual(
      expect.arrayContaining(['pin', 'password', 'cardPin'])
    );
  });
});
