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
  const filePath =
    parts.length > 1 ? join(dir, parts[parts.length - 1] + '.md') : join(dir, parts[0] + '.md');
  const raw = readFileSync(filePath, 'utf-8');

  const meta: { subject?: string; variables?: string[] } = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(new RegExp('^<!--\\s*([^:]+):\\s*(.*?)\\s*-->$'));
    if (!m) break;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key === 'subject') meta.subject = val;
    if (key === 'variables') meta.variables = val.split(',').map((s) => s.trim());
  }

  const content = lines.slice(i).join('\n').trim();
  return { content, ...meta };
};

export { listTemplates, renderTemplate } from '@notification/templates/markdown/registry';

export default { loadTemplate };
