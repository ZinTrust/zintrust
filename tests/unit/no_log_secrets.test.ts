import { lstatSync, readdirSync, readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function walk(dir: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git' || e === 'dist' || e === 'coverage') continue;
    const abs = join(dir, e);

    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }

    // Avoid following broken symlinks during repository scans
    if (st.isSymbolicLink()) continue;

    if (st.isDirectory()) {
      out.push(...walk(abs));
    } else if (st.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

describe('No logging of secret values', () => {
  it('does not log env values directly via Logger', () => {
    const files = walk(ROOT);
    const forbiddenMatches: string[] = [];
    const re =
      /Logger\.(info|warn|error|debug)\([^)]*(Env\.[A-Z0-9_]+|process\.env\.[A-Z0-9_]+)[^)]*\)/g;

    for (const f of files) {
      if (f.endsWith('.test.ts')) continue; // tests may intentionally reference env
      try {
        const text = readFileSync(f, 'utf8');
        re.lastIndex = 0;
        if (re.test(text)) forbiddenMatches.push(f);
      } catch {
        // ignore unreadable files
      }
    }

    expect(
      forbiddenMatches,
      `Found suspicious logger usage in: ${forbiddenMatches.join(', ')}`
    ).toHaveLength(0);
  });
});
