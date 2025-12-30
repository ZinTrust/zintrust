import { readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export const loadTemplate = (
  name: string
): { subject?: string; content: string; variables?: string[] } => {
  const parts = name.split('/');
  const dir = join(
    process.cwd(),
    'src',
    'tools',
    'notification',
    'templates',
    'markdown',
    ...parts.slice(0, -1)
  );
  const leaf = parts.at(-1) ?? '';
  const filePath = join(dir, `${leaf}.md`);
  const raw = readFileSync(filePath, 'utf-8');

  const meta: { subject?: string; variables?: string[] } = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    // Fast path: must look like an HTML comment and contain a colon separator.
    if (!line.startsWith('<!--') || !line.endsWith('-->')) break;
    const inner = line.slice(4, -3).trim();
    const colonIndex = inner.indexOf(':');
    if (colonIndex === -1) break;
    const key = inner.slice(0, colonIndex).trim().toLowerCase();
    const val = inner.slice(colonIndex + 1).trim();
    if (!key) break;
    if (key === 'subject') meta.subject = val;
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

export { listTemplates, renderTemplate } from '@notification/templates/markdown/registry';

export default { loadTemplate };
