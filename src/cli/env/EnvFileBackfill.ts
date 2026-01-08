import { readFileSync, writeFileSync } from '@node-singletons/fs';

export type EnvBackfillResult = {
  changed: boolean;
  filledKeys: string[];
  appendedKeys: string[];
};

const stripEnvInlineComment = (value: string): string => {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble && ch === '#') {
      const prev = value[i - 1];
      if (prev === undefined || prev === ' ' || prev === '\t') {
        return value.slice(0, i).trimEnd();
      }
    }
  }

  return value;
};

const backfillEnvDefaults = (
  envPath: string,
  defaults: Record<string, string>
): EnvBackfillResult => {
  const raw = readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const seen = new Set<string>();
  const filledKeys: string[] = [];
  const appendedKeys: string[] = [];

  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return line;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) return line;

    const key = withoutExport.slice(0, eq).trim();
    if (key === '') return line;
    if (!Object.hasOwn(defaults, key)) return line;
    if (seen.has(key)) return line;
    seen.add(key);

    const rhs = withoutExport.slice(eq + 1);
    const withoutComment = stripEnvInlineComment(rhs);
    const value = withoutComment.trim();

    if (value !== '') return line;

    filledKeys.push(key);
    return `${key}=${defaults[key]}`;
  });

  const missingKeys = Object.keys(defaults).filter((k) => !seen.has(k));
  if (missingKeys.length > 0) {
    appendedKeys.push(...missingKeys);
    out.push(...missingKeys.map((k) => `${k}=${defaults[k]}`));
  }

  const changed = filledKeys.length > 0 || appendedKeys.length > 0;
  if (!changed) return { changed: false, filledKeys, appendedKeys };

  writeFileSync(envPath, out.join('\n') + (out.at(-1) === '' ? '' : '\n'));
  return { changed: true, filledKeys, appendedKeys };
};

export const EnvFileBackfill = Object.freeze({
  stripEnvInlineComment,
  backfillEnvDefaults,
});
