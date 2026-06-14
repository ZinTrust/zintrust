import { describe, expect, it } from 'vitest';
import BodyParsers from '@/http/parsers/BodyParsers';
import {
  tryRecoverTextJsonBody as realTryRecoverTextJsonBody,
  tryParseJsonObject,
  setRequestBody,
} from '@/http/middleware/BodyParsingMiddleware';

/**
 * Tests for the body parsing recovery mechanism that detects JSON payloads
 * sent with the wrong Content-Type header (application/x-www-form-urlencoded,
 * text/plain, or unknown) and recovers by falling back to JSON.parse.
 *
 * The bugs:
 * 1. URLSearchParams treats a bare JSON string as a single key with an empty
 *    value when there are no '&' or '=' separators, silently losing all data.
 * 2. JSON sent as text/plain is stored as a raw string instead of being parsed.
 * 3. JSON sent with unknown/missing Content-Type is stored as raw bytes.
 */

// Replicates the logic from BodyParsingMiddleware.ts parseUrlEncodedBody
// and BodyParsers.ts FormDataParser.parse — both have the same recovery logic.
const parseUrlEncodedBody = (text: string): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(existing)) {
      existing.push(value);
      continue;
    }
    out[key] = [existing, value];
  }

  // Recovery: detect JSON body sent with wrong Content-Type header
  const keys = Object.keys(out);
  if (keys.length === 1 && out[keys[0]] === '') {
    const maybeJson = keys[0].trim();
    if (maybeJson.startsWith('{') && maybeJson.endsWith('}')) {
      try {
        const parsed: unknown = JSON.parse(maybeJson);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, string | string[]>;
        }
      } catch {
        // Not valid JSON — leave original result unchanged
      }
    }
  }

  return out;
};

// Replicates the logic from BodyParsingMiddleware.ts tryRecoverTextJsonBody
const tryRecoverTextJsonBody = (body: string): string | Record<string, unknown> => {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON — leave original unchanged
    }
  }
  return body;
};

// Replicates the unknown Content-Type recovery logic from setRequestBody
const recoverUnknownContentTypeBody = (text: string, rawResultBytes: string): unknown => {
  const decoded = text.trim();
  if (decoded.startsWith('{') && decoded.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(decoded);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON — fall through to bytes
    }
  }
  return rawResultBytes;
};

describe('Body Parsing Recovery — parseUrlEncodedBody', () => {
  // Normal behavior — recovery must never interfere with legitimate form data
  it('parses standard form-urlencoded data normally', () => {
    expect(parseUrlEncodedBody('token=abc&pin=123')).toEqual({
      token: 'abc',
      pin: '123',
    });
  });

  it('handles duplicate keys in real form data (no recovery interference)', () => {
    expect(parseUrlEncodedBody('key=a&key=b&key=c')).toEqual({
      key: ['a', 'b', 'c'],
    });
  });

  it('handles empty value keys in real form data (no recovery interference)', () => {
    expect(parseUrlEncodedBody('flag=&name=test')).toEqual({
      flag: '',
      name: 'test',
    });
  });

  it('does not interfere with single key + value form data', () => {
    expect(parseUrlEncodedBody('name=John')).toEqual({ name: 'John' });
  });

  it('does not interfere with a single key that has empty string value (legitimate)', () => {
    expect(parseUrlEncodedBody('optout=')).toEqual({ optout: '' });
  });

  it('does not crash on invalid JSON that looks like JSON', () => {
    expect(parseUrlEncodedBody('{invalid json}')).toEqual({
      '{invalid json}': '',
    });
  });

  it('handles empty string body', () => {
    expect(parseUrlEncodedBody('')).toEqual({});
  });

  it('does not attempt recovery on non-JSON single key starting with {', () => {
    // Legitimate form field whose value starts with {
    expect(parseUrlEncodedBody('template={name}')).toEqual({
      template: '{name}',
    });
  });

  // Recovery behavior — the main bug fix
  it('recovers JSON payload sent with wrong Content-Type', () => {
    const body = '{"token":"encrypted-gold-sale-order","pin":123456}';
    expect(parseUrlEncodedBody(body)).toEqual({
      token: 'encrypted-gold-sale-order',
      pin: 123456,
    });
  });

  it('recovers nested JSON payload', () => {
    const body = JSON.stringify({
      user: { name: 'Alice', roles: ['admin'] },
      active: true,
    });
    expect(parseUrlEncodedBody(body)).toEqual({
      user: { name: 'Alice', roles: ['admin'] },
      active: true,
    });
  });

  it('recovers JSON with numeric and boolean values', () => {
    expect(parseUrlEncodedBody('{"count":42,"active":false,"rate":3.14}')).toEqual({
      count: 42,
      active: false,
      rate: 3.14,
    });
  });

  it('recovers JSON array values', () => {
    const body = JSON.stringify({ ids: [1, 2, 3], tags: ['a', 'b'] });
    expect(parseUrlEncodedBody(body)).toEqual({
      ids: [1, 2, 3],
      tags: ['a', 'b'],
    });
  });

  it('recovers JSON with null values', () => {
    const body = JSON.stringify({ name: null, active: true });
    expect(parseUrlEncodedBody(body)).toEqual({
      name: null,
      active: true,
    });
  });

  it('recovers JSON with deeply nested structure', () => {
    const body = JSON.stringify({
      level1: { level2: { level3: { key: 'deep' } } },
    });
    expect(parseUrlEncodedBody(body)).toEqual({
      level1: { level2: { level3: { key: 'deep' } } },
    });
  });

  // Cases that must NOT recover
  it('does not recover arrays (they are not plain objects)', () => {
    expect(parseUrlEncodedBody('[1,2,3]')).toEqual({ '[1,2,3]': '' });
  });

  it('does not recover primitive JSON (strings, numbers)', () => {
    expect(parseUrlEncodedBody('"hello"')).toEqual({ '"hello"': '' });
  });

  it('does not recover JSON with & or = in values (URLSearchParams limitation)', () => {
    // When JSON values contain unencoded '&' or '=', URLSearchParams greedily
    // splits on those characters before the recovery check (which requires
    // exactly 1 key) has a chance to fire.
    const body = JSON.stringify({
      query: 'a=b&c=d',
      path: '/api/v2/gold-sales',
    });
    const result = parseUrlEncodedBody(body);
    // The result has multiple keys, so recovery is NOT triggered
    expect(Object.keys(result).length).toBeGreaterThan(1);
  });
});

describe('Body Parsing Recovery — text/plain and unknown Content-Type', () => {
  describe('tryRecoverTextJsonBody (text Content-Type recovery)', () => {
    it('recovers JSON object sent as text/plain', () => {
      const body = '{"key":"value","num":42}';
      expect(tryRecoverTextJsonBody(body)).toEqual({ key: 'value', num: 42 });
    });

    it('leaves plain text unchanged', () => {
      const body = 'Hello, this is plain text';
      expect(tryRecoverTextJsonBody(body)).toBe(body);
    });

    it('leaves invalid JSON starting with { unchanged', () => {
      const body = '{bad json content}';
      expect(tryRecoverTextJsonBody(body)).toBe(body);
    });

    it('leaves arrays unchanged (not plain objects)', () => {
      const body = '[1, 2, 3]';
      expect(tryRecoverTextJsonBody(body)).toBe(body);
    });

    it('leaves primitive JSON strings unchanged', () => {
      const body = '"a simple string"';
      expect(tryRecoverTextJsonBody(body)).toBe(body);
    });

    it('handles empty string', () => {
      expect(tryRecoverTextJsonBody('')).toBe('');
    });

    it('recovers JSON with leading/trailing whitespace', () => {
      const body = '  {"key":"value"}  ';
      expect(tryRecoverTextJsonBody(body)).toEqual({ key: 'value' });
    });

    it('recovers nested JSON object sent as text/plain', () => {
      const body = JSON.stringify({ user: { name: 'Alice' }, tags: ['a', 'b'] });
      expect(tryRecoverTextJsonBody(body)).toEqual({
        user: { name: 'Alice' },
        tags: ['a', 'b'],
      });
    });

    it('leaves XML content with braces unchanged', () => {
      // Some XML payloads may contain { and } — should not be falsely parsed
      const body = '<root>{value}</root>';
      expect(tryRecoverTextJsonBody(body)).toBe(body);
    });
  });

  describe('unknown Content-Type recovery', () => {
    it('recovers JSON object sent with unknown Content-Type', () => {
      const body = '{"key":"value","num":42}';
      expect(recoverUnknownContentTypeBody(body, body)).toEqual({
        key: 'value',
        num: 42,
      });
    });

    it('falls through to raw bytes for non-JSON content', () => {
      const body = 'some random bytes';
      const rawBytes = '<Buffer 73 6f 6d 65...>';
      expect(recoverUnknownContentTypeBody(body, rawBytes)).toBe(rawBytes);
    });

    it('falls through to raw bytes for arrays', () => {
      const body = '[1, 2, 3]';
      const rawBytes = '[1, 2, 3]';
      expect(recoverUnknownContentTypeBody(body, rawBytes)).toBe(rawBytes);
    });

    it('falls through to raw bytes for invalid JSON with braces', () => {
      const body = '{bad json}';
      const rawBytes = '{bad json}';
      expect(recoverUnknownContentTypeBody(body, rawBytes)).toBe(rawBytes);
    });
  });
});

// Real implementation coverage — these exercise the actual src functions (not the test-local duplicates)
// so that patch coverage counts hits on the changed lines in BodyParsers.ts and related.
describe('Body Parsing Recovery — real BodyParsers execution (for patch coverage)', () => {
  it('FormDataParser recovers JSON sent as bare object (degenerate urlencoded case)', () => {
    const json = '{"token":"encrypted-gold-sale-order","pin":123456}';
    const result = BodyParsers.FormDataParser.parse(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ token: 'encrypted-gold-sale-order', pin: 123456 });
    }
  });

  it('FormDataParser recovers nested JSON via raw text path', () => {
    const json = JSON.stringify({ user: { name: 'Alice' }, ids: [1, 2] });
    const result = BodyParsers.FormDataParser.parse(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ user: { name: 'Alice' }, ids: [1, 2] });
    }
  });

  it('FormDataParser leaves legitimate form data untouched', () => {
    const result = BodyParsers.FormDataParser.parse('a=1&b=2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ a: '1', b: '2' });
    }
  });

  it('FormDataParser recovers JSON after URLSearchParams decodes a single key', () => {
    const encodedJsonKey = encodeURIComponent('{"decoded":true,"count":2}');
    const result = BodyParsers.FormDataParser.parse(encodedJsonKey);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ decoded: true, count: 2 });
    }
  });

  it('FormDataParser falls back to raw form output for invalid decoded JSON keys', () => {
    const encodedInvalidJsonKey = encodeURIComponent('{invalid json}');
    const result = BodyParsers.FormDataParser.parse(encodedInvalidJsonKey);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ '{invalid json}': '' });
    }
  });

  it('FormDataParser falls back after invalid raw JSON parse fails', () => {
    const result = BodyParsers.FormDataParser.parse('{invalid json}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ '{invalid json}': '' });
    }
  });
});

// Drive the *exported* recovery helpers from the real middleware module.
// This ensures the changed lines inside BodyParsingMiddleware.ts are executed
// during test runs, satisfying patch coverage for the added recovery logic.
describe('Body Parsing Recovery — real middleware helpers (for patch coverage)', () => {
  it('tryRecoverTextJsonBody (exported) recovers object from text body', () => {
    expect(realTryRecoverTextJsonBody('  {"a":1}  ')).toEqual({ a: 1 });
  });

  it('tryRecoverTextJsonBody (exported) leaves non-object text', () => {
    const text = 'plain text here';
    expect(realTryRecoverTextJsonBody(text)).toBe(text);
  });

  it('tryParseJsonObject (exported) parses object or returns null', () => {
    expect(tryParseJsonObject('{"x": true}')).toEqual({ x: true });
    expect(tryParseJsonObject('[1,2]')).toBeNull();
    expect(tryParseJsonObject('not json')).toBeNull();
  });
});

// Direct calls to the (now exported for test) setRequestBody exercise the call sites for recovery
// inside the middleware (the statements like `req.setBody(tryRecoverTextJsonBody(text))`).
// This ensures those specific changed executable lines are counted as covered for patch coverage.
describe('Body Parsing Recovery — direct setRequestBody calls (covers call sites)', () => {
  const makeReq = () => {
    let body: unknown;
    return {
      setBody(b: unknown) { body = b; },
      get bodyForAssert() { return body; },
    } as any;
  };
  const makeRaw = (text: string) => ({ ok: true as const, text, bytes: Buffer.from(text) });

  it('hits text recovery call site', () => {
    const req = makeReq();
    setRequestBody(req, makeRaw('{"from":"text-ct"}'), 'text/plain');
    expect(req.bodyForAssert).toEqual({ from: 'text-ct' });
  });

  it('hits urlencoded raw JSON recovery call site', () => {
    const req = makeReq();
    setRequestBody(req, makeRaw('{"from":"urlencoded-raw"}'), 'application/x-www-form-urlencoded');
    expect(req.bodyForAssert).toEqual({ from: 'urlencoded-raw' });
  });

  it('hits urlencoded decoded-key JSON recovery call site', () => {
    const req = makeReq();
    const encodedJsonKey = encodeURIComponent('{"from":"urlencoded-decoded-key"}');
    setRequestBody(req, makeRaw(encodedJsonKey), 'application/x-www-form-urlencoded');
    expect(req.bodyForAssert).toEqual({ from: 'urlencoded-decoded-key' });
  });

  it('hits urlencoded decoded-key invalid JSON fallback', () => {
    const req = makeReq();
    const encodedInvalidJsonKey = encodeURIComponent('{bad json}');
    setRequestBody(req, makeRaw(encodedInvalidJsonKey), 'application/x-www-form-urlencoded');
    expect(req.bodyForAssert).toEqual({ '{bad json}': '' });
  });

  it('hits unknown ct recovery call site', () => {
    const req = makeReq();
    setRequestBody(req, makeRaw('{"from":"unknown-ct"}'), 'application/octet-stream');
    expect(req.bodyForAssert).toEqual({ from: 'unknown-ct' });
  });
});
