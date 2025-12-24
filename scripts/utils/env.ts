import { fs } from '@node-singletons';
import * as path from '@node-singletons/path';

/**
 * Strip quotes from value if present
 */
export function stripQuotes(value: string): string {
  if (value.length < 2) return value;

  const firstChar = value[0];
  const lastChar = value[value.length - 1];
  const isDoubleQuoted = firstChar === '"' && lastChar === '"';
  const isSingleQuoted = firstChar === "'" && lastChar === "'";

  if (isDoubleQuoted || isSingleQuoted) {
    return value.slice(1, -1);
  }

  return value;
}

/**
 * Parse a single line from .env file
 */
export function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmedLine = line.trim();
  if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) return null;

  const eqIndex = trimmedLine.indexOf('=');
  if (eqIndex === -1) return null;

  const key = trimmedLine.slice(0, eqIndex).trim();
  if (key.length === 0) return null;

  const valueRaw = trimmedLine.slice(eqIndex + 1).trim();
  return { key, value: stripQuotes(valueRaw) };
}

/**
 * Load environment variables from .env file
 * @param override Whether to override existing environment variables (default: false)
 */
export function loadEnv(override: boolean = false): void {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const result = parseEnvLine(line);
      if (result) {
        if (!override && process.env[result.key] !== undefined) {
          continue;
        }
        process.env[result.key] = result.value;
      }
    }
  } catch {
    // Ignore errors loading .env
  }
}
