import { DEFAULTS, ENV_KEYS, HTTP_HEADERS, MIME_TYPES } from '@/config/constants';
import { describe, expect, it } from 'vitest';

describe('Constants', () => {
  it('should export HTTP_HEADERS', () => {
    expect(HTTP_HEADERS.CONTENT_TYPE).toBe('Content-Type');
    expect(HTTP_HEADERS.AUTHORIZATION).toBe('Authorization');
  });

  it('should export MIME_TYPES', () => {
    expect(MIME_TYPES.JSON).toBe('application/json');
    expect(MIME_TYPES.HTML).toBe('text/html');
  });

  it('should export ENV_KEYS', () => {
    expect(ENV_KEYS.NODE_ENV).toBe('NODE_ENV');
    expect(ENV_KEYS.PORT).toBe('PORT');
  });

  it('should export DEFAULTS', () => {
    expect(DEFAULTS.CONNECTION).toBe('default');
  });
});
