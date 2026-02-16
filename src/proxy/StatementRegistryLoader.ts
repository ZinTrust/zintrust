import { Env } from '@config/env';
import fs from '@node-singletons/fs';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const parseStatements = (input: unknown): Record<string, string> | undefined => {
  if (!isRecord(input)) return undefined;

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

export const loadStatementRegistry = (
  prefix: 'MYSQL' | 'POSTGRES' | 'SQLSERVER'
): Record<string, string> | undefined => {
  const file = Env.get(`ZT_${prefix}_STATEMENTS_FILE`, '').trim();
  if (file !== '') {
    try {
      const text = fs.readFileSync(file, 'utf8');
      return parseStatements(JSON.parse(text) as unknown);
    } catch {
      return undefined;
    }
  }

  const json = Env.get(`ZT_${prefix}_STATEMENTS_JSON`, '').trim();
  if (json !== '') {
    try {
      return parseStatements(JSON.parse(json) as unknown);
    } catch {
      return undefined;
    }
  }

  return undefined;
};
