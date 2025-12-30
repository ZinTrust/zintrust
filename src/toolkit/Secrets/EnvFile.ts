import { ErrorFactory } from '@exceptions/ZintrustError';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export type EnvFileWriteMode = 'overwrite';

const isValidKey = (key: string): boolean => /^[A-Z0-9_]+$/.test(key);

const parseEnvLine = (line: string): { key: string; value: string } | null => {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  const raw = trimmed.slice(eq + 1);

  if (!isValidKey(key)) return null;

  // Preserve value verbatim (except strip surrounding quotes if present)
  let value = raw;
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    value = v.slice(1, -1);
  }

  return { key, value };
};

const serializeEnv = (values: Record<string, string>): string => {
  const keys = Object.keys(values).sort((a, b) => a.localeCompare(b));
  const lines = keys.map((key) => {
    const value = values[key] ?? '';
    // Write as JSON string to safely quote newlines, #, etc.
    return `${key}=${JSON.stringify(value)}`;
  });
  return `${lines.join('\n')}\n`;
};

export const EnvFile = Object.freeze({
  async read(params: { cwd: string; path: string }): Promise<Record<string, string>> {
    const filePath = path.resolve(params.cwd, params.path);

    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const result: Record<string, string> = {};
      for (const line of raw.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (parsed) result[parsed.key] = parsed.value;
      }
      return result;
    } catch {
      return {};
    }
  },

  async write(params: {
    cwd: string;
    path: string;
    values: Record<string, string>;
    mode: EnvFileWriteMode;
  }): Promise<void> {
    const filePath = path.resolve(params.cwd, params.path);

    for (const key of Object.keys(params.values)) {
      if (!isValidKey(key)) {
        throw ErrorFactory.createCliError(`Invalid env key: ${key}`);
      }
    }

    const content = serializeEnv(params.values);

    // Ensure parent dir exists for cases like ./.zintrust/.env.pull
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, content, 'utf-8');
  },
});

export default EnvFile;
