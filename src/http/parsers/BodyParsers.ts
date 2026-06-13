/**
 * Body Parsers - Content-Type specific parsing
 * Handles form-data, plain text, CSV, and other non-JSON formats
 */

interface BodyParserResult {
  ok: boolean;
  data?: Record<string, unknown> | string | unknown[];
  error?: string;
}

interface IBodyParser {
  canParse(contentType: string): boolean;
  parse(body: string | Buffer): BodyParserResult;
}

/**
 * Attempt to recover a JSON string that was parsed as a single form-urlencoded key.
 * This handles cases where clients send JSON with the wrong Content-Type header.
 */
const tryRecoverJsonBody = (
  result: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const keys = Object.keys(result);
  if (keys.length !== 1) return undefined;

  const singleValue = result[keys[0]];
  if (singleValue !== '') return undefined;

  const maybeJson = keys[0].trim();
  if (!maybeJson.startsWith('{') || !maybeJson.endsWith('}')) return undefined;

  try {
    const parsed: unknown = JSON.parse(maybeJson);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON — leave original result unchanged
  }

  return undefined;
};

/**
 * Try to parse raw text as JSON before URLSearchParams touches it.
 * This handles cases where JSON is sent with application/x-www-form-urlencoded Content-Type,
 * which would be corrupted by URLSearchParams (splits on '=', converts '+' to spaces).
 */
const tryParseJsonRaw = (text: string): Record<string, unknown> | undefined => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON
  }

  return undefined;
};

/**
 * Parse URL-encoded string into key-value pairs, handling duplicate keys as arrays.
 */
const parseUrlEncodedParams = (text: string): Record<string, unknown> => {
  const params = new URLSearchParams(text);
  const result: Record<string, unknown> = {};

  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
};

/**
 * URL-encoded form data parser
 * Content-Type: application/x-www-form-urlencoded
 */
const FormDataParser: IBodyParser = {
  canParse: (contentType: string): boolean =>
    contentType.includes('application/x-www-form-urlencoded'),

  parse: (body: string | Buffer): BodyParserResult => {
    try {
      const text = typeof body === 'string' ? body : body.toString('utf-8');
      if (!text.trim()) return { ok: true, data: {} };

      // JSON-first recovery: parse raw text before URLSearchParams touches it.
      const rawJsonResult = tryParseJsonRaw(text);
      if (rawJsonResult !== undefined) {
        return { ok: true, data: rawJsonResult };
      }

      const result = parseUrlEncodedParams(text);

      // Recovery: if a JSON payload was sent with wrong Content-Type,
      // URLSearchParams treats the whole JSON string as a single key with
      // an empty value. Detect this degenerate case and fall back to JSON.parse.
      const recovered = tryRecoverJsonBody(result);
      if (recovered !== undefined) {
        return { ok: true, data: recovered };
      }

      return { ok: true, data: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: `Failed to parse form data: ${errorMsg}` };
    }
  },
};

/**
 * Plain text parser
 * Content-Type: text/plain
 */
const TextParser: IBodyParser = {
  canParse: (contentType: string): boolean => contentType.includes('text/plain'),

  parse: (body: string | Buffer): BodyParserResult => {
    try {
      const text = typeof body === 'string' ? body : body.toString('utf-8');
      return { ok: true, data: text };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: `Failed to parse text: ${errorMsg}` };
    }
  },
};

/**
 * CSV parser implementation helper
 */
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  result.push(current.trim());
  return result;
};

/**
 * CSV parser
 * Content-Type: text/csv
 */
const CSVParser: IBodyParser = {
  canParse: (contentType: string): boolean => contentType.includes('text/csv'),

  parse: (body: string | Buffer): BodyParserResult => {
    try {
      const text = typeof body === 'string' ? body : body.toString('utf-8');
      if (text.length === 0) return { ok: true, data: [] };

      // Stream-like processing: iterate lines without creating an array of all lines
      const rows: Record<string, unknown>[] = [];
      let headers: string[] | undefined;
      let cursor = 0;

      while (cursor < text.length) {
        let lineEnd = text.indexOf('\n', cursor);
        if (lineEnd === -1) lineEnd = text.length;

        const line = text.slice(cursor, lineEnd).trim();
        cursor = lineEnd + 1;

        if (line.length === 0) continue;

        const values = parseCSVLine(line);

        if (!headers) {
          headers = values;
          continue;
        }

        const row: Record<string, unknown> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j] ?? '';
        }

        rows.push(row);
      }

      return { ok: true, data: rows };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: `Failed to parse CSV: ${errorMsg}` };
    }
  },
};

export const BodyParsers = Object.freeze({
  FormDataParser,
  TextParser,
  CSVParser,

  /**
   * Get all registered parsers
   */
  getAll(): IBodyParser[] {
    return [this.FormDataParser, this.TextParser, this.CSVParser];
  },

  /**
   * Find parser for content-type
   */
  findParser(contentType: string): IBodyParser | undefined {
    return this.getAll().find((parser) => parser.canParse(contentType));
  },

  /**
   * Parse body based on content-type
   */
  parse(contentType: string, body: string | Buffer): BodyParserResult {
    const parser = this.findParser(contentType);
    if (parser === undefined) {
      return { ok: false, error: `No parser found for content-type: ${contentType}` };
    }

    return parser.parse(body);
  },
});

export default BodyParsers;
