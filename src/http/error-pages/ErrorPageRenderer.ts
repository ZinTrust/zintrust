import { MIME_TYPES } from '@/config/constants';
import { Cloudflare } from '@config/cloudflare';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

type ErrorTemplateName = '404' | '500';

type RenderInput = {
  statusCode: number;
  errorName: string;
  errorMessage: string;
  requestPath: string;
  stackPretty?: string;
  stackRaw?: string;
  requestPretty?: string;
  requestRaw?: string;
};

type TemplateStore = Partial<Record<ErrorTemplateName, string>>;

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const DEFAULT_TEMPLATES: Record<ErrorTemplateName, string> = {
  '404': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{statusCode}} {{errorName}}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 48px; color: #1f2937; }
      h1 { font-size: 32px; margin: 0 0 12px; }
      p { margin: 0 0 8px; color: #4b5563; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>{{statusCode}} {{errorName}}</h1>
    <p>{{errorMessage}}</p>
    <p>Path: <code>{{requestPath}}</code></p>
  </body>
</html>`,
  '500': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{statusCode}} {{errorName}}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 48px; color: #1f2937; }
      h1 { font-size: 32px; margin: 0 0 12px; }
      p { margin: 0 0 8px; color: #4b5563; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow: auto; }
    </style>
  </head>
  <body>
    <h1>{{statusCode}} {{errorName}}</h1>
    <p>{{errorMessage}}</p>
    <pre>{{stackPretty}}</pre>
  </body>
</html>`,
};

const getTemplateStore = (): TemplateStore => {
  const globalStore = (globalThis as unknown as { __zintrustErrorTemplates?: TemplateStore })
    .__zintrustErrorTemplates;
  if (globalStore) return globalStore;
  const created: TemplateStore = {};
  (globalThis as unknown as { __zintrustErrorTemplates?: TemplateStore }).__zintrustErrorTemplates =
    created;
  return created;
};

const resolveTemplateFromStore = (name: ErrorTemplateName): string | undefined => {
  const store = getTemplateStore();
  const stored = store[name];
  return typeof stored === 'string' && stored.trim() !== '' ? stored : undefined;
};

const setTemplateInStore = (name: ErrorTemplateName, template: string): void => {
  const store = getTemplateStore();
  store[name] = template;
};

const getAcceptHeader = (request: IRequest): string => {
  const accept = request.getHeader('accept');
  if (typeof accept === 'string') return accept;
  if (Array.isArray(accept)) return accept.join(',');
  return '';
};

const prefersHtml = (request: IRequest): boolean => {
  if (request.getPath().startsWith('/api')) return false;

  const accept = getAcceptHeader(request).toLowerCase();
  if (accept === '') return false;

  // Browser Accept values almost always include one of these.
  return accept.includes(MIME_TYPES.HTML) || accept.includes(MIME_TYPES.XHTML);
};

const prefersJson = (request: IRequest): boolean => {
  if (request.getPath().startsWith('/api')) return true;

  const accept = getAcceptHeader(request).toLowerCase();

  // If the client explicitly accepts HTML, treat it as an HTML preference.
  if (accept.includes(MIME_TYPES.TEXT) || accept.includes(MIME_TYPES.XHTML)) return false;

  if (accept.includes(MIME_TYPES.JSON)) return true;

  // Default to JSON when the client doesn't express a preference.
  return accept === '' || accept.includes('*/*');
};

const interpolate = (template: string, data: RenderInput): string => {
  return template
    .replaceAll('{{statusCode}}', escapeHtml(String(data.statusCode)))
    .replaceAll('{{errorName}}', escapeHtml(data.errorName))
    .replaceAll('{{errorMessage}}', escapeHtml(data.errorMessage))
    .replaceAll('{{requestPath}}', escapeHtml(data.requestPath))
    .replaceAll('{{stackPretty}}', escapeHtml(data.stackPretty ?? ''))
    .replaceAll('{{stackRaw}}', escapeHtml(data.stackRaw ?? ''))
    .replaceAll('{{requestPretty}}', escapeHtml(data.requestPretty ?? ''))
    .replaceAll('{{requestRaw}}', escapeHtml(data.requestRaw ?? ''));
};

const resolveTemplatePath = (publicRoot: string, templateName: ErrorTemplateName): string => {
  return path.join(publicRoot, 'error-pages', `${templateName}.html`);
};

const safeReadTemplate = (filePath: string): string | undefined => {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const content = fs.readFileSync(filePath, 'utf-8');
    return typeof content === 'string' && content.length > 0 ? content : undefined;
  } catch (error) {
    ErrorFactory.createTryCatchError(`Failed to read error page template: ${filePath}`, error);
    return undefined;
  }
};

const toTemplateName = (statusCode: number): ErrorTemplateName | undefined => {
  if (statusCode === 404) return '404';
  if (statusCode === 500) return '500';
  return undefined;
};

const isWorkersRuntime = (): boolean => Cloudflare.getWorkersEnv() !== null;

const getWorkersTemplate = (name: ErrorTemplateName): string | undefined => {
  const key = name === '404' ? 'ERROR_PAGE_404_HTML' : 'ERROR_PAGE_500_HTML';
  const raw = Cloudflare.getWorkersVar(key);
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : raw;
};

export const ErrorPageRenderer = Object.freeze({
  setTemplates(templates: TemplateStore): void {
    for (const [key, value] of Object.entries(templates)) {
      const name = key as ErrorTemplateName;
      if ((name === '404' || name === '500') && typeof value === 'string') {
        setTemplateInStore(name, value);
      }
    }
  },

  shouldSendHtml(request: IRequest): boolean {
    return prefersHtml(request) && !prefersJson(request);
  },

  renderHtml(publicRoot: string, input: RenderInput): string | undefined {
    const templateName = toTemplateName(input.statusCode);
    if (templateName === undefined) return undefined;

    const cachedTemplate = resolveTemplateFromStore(templateName);
    if (cachedTemplate !== undefined) {
      return interpolate(cachedTemplate, input);
    }

    if (isWorkersRuntime()) {
      const workersTemplate = getWorkersTemplate(templateName);
      if (workersTemplate !== undefined) {
        setTemplateInStore(templateName, workersTemplate);
        return interpolate(workersTemplate, input);
      }
      return interpolate(DEFAULT_TEMPLATES[templateName], input);
    }

    const templatePath = resolveTemplatePath(publicRoot, templateName);
    const template = safeReadTemplate(templatePath) ?? DEFAULT_TEMPLATES[templateName];
    if (template === undefined) return undefined;

    return interpolate(template, input);
  },

  async renderHtmlAsync(publicRoot: string, input: RenderInput): Promise<string | undefined> {
    const templateName = toTemplateName(input.statusCode);
    if (templateName === undefined) return undefined;

    const cached = resolveTemplateFromStore(templateName);
    if (cached !== undefined) return interpolate(cached, input);

    if (isWorkersRuntime()) {
      const workersHtml = await loadWorkersTemplate(templateName);
      if (workersHtml !== undefined) return interpolate(workersHtml, input);
      return interpolate(DEFAULT_TEMPLATES[templateName], input);
    }

    const nodeHtml = loadNodeTemplate(publicRoot, templateName);
    if (nodeHtml === undefined) return undefined;
    return interpolate(nodeHtml, input);
  },
});

const loadWorkersTemplate = async (
  templateName: ErrorTemplateName
): Promise<string | undefined> => {
  const assets = Cloudflare.getAssetsBinding();
  if (assets) {
    const html = await fetchAssetsTemplate(assets, templateName);
    if (html !== undefined) {
      setTemplateInStore(templateName, html);
      return html;
    }
  }

  const workersTemplate = getWorkersTemplate(templateName);
  if (workersTemplate !== undefined) {
    setTemplateInStore(templateName, workersTemplate);
    return workersTemplate;
  }

  return undefined;
};

const fetchAssetsTemplate = async (
  assets: { fetch: (input: string | URL, init?: RequestInit) => Promise<Response> },
  templateName: ErrorTemplateName
): Promise<string | undefined> => {
  try {
    const url = new URL(`/error-pages/${templateName}.html`, 'https://assets.local');
    const res = await assets.fetch(url.toString());
    if (!res.ok) return undefined;
    const html = await res.text();
    return html.trim() === '' ? undefined : html;
  } catch {
    return undefined;
  }
};

const loadNodeTemplate = (
  publicRoot: string,
  templateName: ErrorTemplateName
): string | undefined => {
  const templatePath = resolveTemplatePath(publicRoot, templateName);
  return safeReadTemplate(templatePath) ?? DEFAULT_TEMPLATES[templateName];
};
