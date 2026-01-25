import { MIME_TYPES } from '@/config/constants';
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

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

export const ErrorPageRenderer = Object.freeze({
  shouldSendHtml(request: IRequest): boolean {
    return prefersHtml(request) && !prefersJson(request);
  },

  renderHtml(publicRoot: string, input: RenderInput): string | undefined {
    const templateName = toTemplateName(input.statusCode);
    if (templateName === undefined) return undefined;

    const templatePath = resolveTemplatePath(publicRoot, templateName);
    const template = safeReadTemplate(templatePath);
    if (template === undefined) return undefined;

    return interpolate(template, input);
  },
});
