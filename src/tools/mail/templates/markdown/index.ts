import { readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export const loadTemplate = (
  name: string
): { subject?: string; preheader?: string; variables?: string[]; content: string } => {
  // name e.g. 'auth/welcome'
  const parts = name.split('/');
  // Safe parser for top comment metadata <!-- Key: Value --> lines to avoid regex backtracking
  const dir = join(
    process.cwd(),
    'src',
    'tools',
    'mail',
    'templates',
    'markdown',
    ...parts.slice(0, -1)
  );
  const leaf = parts.at(-1) ?? '';
  const filePath = join(dir, `${leaf}.md`);
  const raw = readFileSync(filePath, 'utf-8');

  const meta: { subject?: string; preheader?: string; variables?: string[] } = {};

  const parseMetaLine = (line: string): [string, string] | null => {
    // Must start with <!-- and end with --> exactly; trim the inner part and split at first colon
    if (!line.startsWith('<!--') || !line.endsWith('-->')) return null;
    const inner = line.slice('<!--'.length, -'-->'.length).trim();
    const idx = inner.indexOf(':');
    if (idx === -1) return null;
    const key = inner.slice(0, idx).trim().toLowerCase();
    const val = inner.slice(idx + 1).trim();
    if (!key) return null;
    return [key, val];
  };

  // Parse top comment metadata <!-- Key: Value --> lines
  const lines = raw.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const kv = parseMetaLine(lines[i]);
    if (!kv) break;
    const [key, val] = kv;
    if (key === 'subject') meta.subject = val;
    if (key === 'preheader') meta.preheader = val;
    if (key === 'variables') {
      meta.variables = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const content = lines.slice(i).join('\n').trim();
  return { content, ...meta };
};

export { listTemplates, renderTemplate } from '@mail/templates/markdown/registry';

export default { loadTemplate };
