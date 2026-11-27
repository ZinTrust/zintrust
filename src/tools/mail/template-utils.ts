/**
 * Template utilities shared by mail modules.
 */

export type TemplateVariables = Record<string, unknown>;

/** One compiled token pattern for all interpolations; keys are never used as regex source. */
const TOKEN_PATTERN = /{{([^{}]+?)}}/g;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Stringify a template value without relying on Object's default toString. */
function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/** Escape a value before embedding it in an HTML template. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * Handlebars-style interpolation: replaces `{{ key }}` (whitespace optional) with String(value).
 * Unknown tokens are left untouched so conditional/loop block tags survive to their own pass.
 * A replacer function is used so `$&`/`$'` inside values are inserted literally.
 */
export function interpolate(
  template: string,
  data: TemplateVariables,
  escapeValues = false
): string {
  return template.replace(TOKEN_PATTERN, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (!Object.hasOwn(data, key)) return match;
    const value = data[key];
    const text = stringifyTemplateValue(value);
    return escapeValues ? escapeHtml(text) : text;
  });
}
