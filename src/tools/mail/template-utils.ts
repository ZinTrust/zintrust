/**
 * Template utilities shared by mail modules.
 */

export type TemplateVariables = Record<string, unknown>;

/**
 * Simple handlebars‐style interpolation: replaces all occurrences of
 * `{{ key }}` (whitespace optional) with String(value).
 */
export function interpolate(template: string, data: TemplateVariables): string {
  let out = template;
  for (const [key, value] of Object.entries(data)) {
    const replacement = value === null || value === undefined ? '' : String(value);
    const regex = new RegExp(String.raw`{{\s*${key}\s*}}`, 'g');
    out = out.replace(regex, replacement);
  }
  return out;
}
