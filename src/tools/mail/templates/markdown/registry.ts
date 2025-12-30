import { loadTemplate } from '@mail/templates/markdown';
import { validateTemplateMeta } from '@mail/templates/markdown/validator';
import { readdirSync, statSync } from '@node-singletons/fs';
import { join, relative } from '@node-singletons/path';
import { MarkdownRenderer } from '@tools/templates';

const BASE = join(process.cwd(), 'src', 'tools', 'mail', 'templates', 'markdown');

const walkDir = (dir: string, base = dir): string[] => {
  const entries = readdirSync(dir);
  let files: string[] = [];
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      files = files.concat(walkDir(p, base));
      continue;
    }
    if (e.endsWith('.md')) {
      const rel = relative(base, p).replaceAll('\\', '/');
      const withoutExt = rel.toLowerCase().endsWith('.md') ? rel.slice(0, -3) : rel;
      files.push(withoutExt);
    }
  }
  return files;
};

export const listTemplates = (): string[] => {
  return walkDir(BASE);
};

export const renderTemplate = (
  name: string,
  vars: Record<string, unknown> = {}
): { html: string; meta: ReturnType<typeof loadTemplate> } => {
  const tpl = loadTemplate(name);
  validateTemplateMeta(name, tpl);
  const html = MarkdownRenderer.render(tpl.content, vars);
  return { html, meta: tpl };
};

export default { listTemplates, renderTemplate };
