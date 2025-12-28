import { readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export const loadTemplate = (
  name: string
): { subject?: string; preheader?: string; variables?: string[]; content: string } => {
  // name e.g. 'auth/welcome'
  const parts = name.split('/');
  const metaRx = /^<!--\s*([^:]+):\s*(.*?)\s*-->$/;
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

  // Parse top comment metadata <!-- Key: Value --> lines
  const lines = raw.split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i++) {
    const m = metaRx.exec(lines[i]);
    if (!m) break;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
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
