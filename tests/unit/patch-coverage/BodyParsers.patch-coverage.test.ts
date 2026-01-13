import { BodyParsers } from '@http/parsers/BodyParsers';
import { describe, expect, it } from 'vitest';

describe('patch coverage: BodyParsers', () => {
  it('aggregates repeated urlencoded keys into arrays (push branch)', () => {
    const parsed = BodyParsers.parse('application/x-www-form-urlencoded', 'a=1&a=2&a=3');
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ a: ['1', '2', '3'] });
  });

  it('returns a helpful error when form parsing throws non-Error', () => {
    const throwingBody = {
      toString: () => {
        throw 'boom';
      },
    };

    const parsed = BodyParsers.parse(
      'application/x-www-form-urlencoded',
      throwingBody as unknown as Buffer
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Failed to parse form data:');
    expect(parsed.error).toContain('Unknown error');
  });

  it('returns a helpful error when text parsing throws Error', () => {
    const throwingBody = {
      toString: () => {
        throw new Error('nope');
      },
    };

    const parsed = BodyParsers.parse('text/plain', throwingBody as unknown as Buffer);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Failed to parse text:');
    expect(parsed.error).toContain('nope');
  });

  it('returns a helpful error when CSV parsing throws Error', () => {
    const throwingBody = {
      toString: () => {
        throw new Error('csv failed');
      },
    };

    const parsed = BodyParsers.parse('text/csv', throwingBody as unknown as Buffer);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Failed to parse CSV:');
    expect(parsed.error).toContain('csv failed');
  });
});
