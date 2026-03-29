import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

type EnsureProxyEntrypointOptions = {
  cwd: string;
  entryFile: string;
  exportName: string;
  moduleSpecifier: string;
};

type EnsureWranglerConfigOptions<TValues, TOptions> = {
  configPath: string;
  options: TOptions;
  envName: string;
  resolveValues: (content: string | undefined, options: TOptions) => TValues;
  renderEnvBlock: (values: TValues) => string;
  compatibilityDate: string;
};

type EnsureWranglerConfigResult<TValues> = {
  createdFile: boolean;
  insertedEnv: boolean;
  values: TValues;
};

export const trimNonEmptyOption = (value: string | undefined): string | undefined => {
  if (!isNonEmptyString(value)) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const resolveConfigPath = (raw: string | undefined, fallback = 'wrangler.jsonc'): string => {
  return trimNonEmptyOption(raw) ?? fallback;
};

const isJsonWhitespace = (char: string | undefined): boolean => {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
};

const findJsonKeyValueStart = (content: string, key: string): number => {
  const keyPosition = content.indexOf(`"${key}"`);
  if (keyPosition < 0) return -1;

  let cursor = keyPosition + key.length + 2;
  while (isJsonWhitespace(content[cursor])) cursor++;
  if (content[cursor] !== ':') return -1;

  cursor++;
  while (isJsonWhitespace(content[cursor])) cursor++;
  return cursor;
};

export const findQuotedValue = (content: string, key: string): string | undefined => {
  const valueStart = findJsonKeyValueStart(content, key);
  if (valueStart < 0 || content[valueStart] !== '"') return undefined;

  const valueEnd = content.indexOf('"', valueStart + 1);
  if (valueEnd < 0) return undefined;

  return trimNonEmptyOption(content.slice(valueStart + 1, valueEnd));
};

const hasEnvBlock = (content: string, envName: string): boolean => {
  const valueStart = findJsonKeyValueStart(content, envName);
  return valueStart >= 0 && content[valueStart] === '{';
};

const findEnvObjectStart = (content: string): number => {
  const valueStart = findJsonKeyValueStart(content, 'env');
  if (valueStart < 0 || content[valueStart] !== '{') return -1;
  return valueStart;
};

const isObjectEffectivelyEmpty = (content: string, objectStart: number): boolean => {
  let cursor = objectStart + 1;
  while (isJsonWhitespace(content[cursor])) cursor++;
  return content[cursor] === '}';
};

export const injectEnvBlock = (content: string, envName: string, block: string): string => {
  if (hasEnvBlock(content, envName)) return content;

  const envObjectStart = findEnvObjectStart(content);
  if (envObjectStart >= 0 && isObjectEffectivelyEmpty(content, envObjectStart)) {
    const closingBraceIndex = content.indexOf('}', envObjectStart);
    if (closingBraceIndex >= 0) {
      return `${content.slice(0, envObjectStart)}{\n${block}\n  }${content.slice(closingBraceIndex + 1)}`;
    }
  }

  if (envObjectStart >= 0) {
    return `${content.slice(0, envObjectStart + 1)}\n${block},${content.slice(envObjectStart + 1)}`;
  }

  const closingIndex = content.lastIndexOf('}');
  if (closingIndex < 0) {
    throw ErrorFactory.createCliError('Invalid wrangler.jsonc: missing closing brace.');
  }

  const before = content.slice(0, closingIndex).trimEnd();
  const suffix = before.endsWith('{') ? '\n' : ',\n';
  return `${before}${suffix}  "env": {\n${block}\n  }\n}\n`;
};

export const renderDefaultWranglerConfig = (
  envBlock: string,
  compatibilityDate: string
): string => {
  return [
    '{',
    '  "name": "zintrust-api",',
    '  "main": "./src/functions/cloudflare.ts",',
    `  "compatibility_date": "${compatibilityDate}",`,
    '  "compatibility_flags": ["nodejs_compat"],',
    '  "env": {',
    envBlock,
    '  }',
    '}',
    '',
  ].join('\n');
};

export const ensureProxyEntrypoint = (
  options: EnsureProxyEntrypointOptions
): { created: boolean; entryFilePath: string } => {
  const entryFilePath = join(options.cwd, options.entryFile);
  if (existsSync(entryFilePath)) {
    return { created: false, entryFilePath };
  }

  const lastSlashIndex = entryFilePath.lastIndexOf('/');
  const entryDir = lastSlashIndex > 0 ? entryFilePath.slice(0, lastSlashIndex) : options.cwd;
  mkdirSync(entryDir, { recursive: true });
  writeFileSync(
    entryFilePath,
    [
      `export { ${options.exportName} } from '${options.moduleSpecifier}';`,
      `export { ${options.exportName} as default } from '${options.moduleSpecifier}';`,
      '',
    ].join('\n'),
    'utf-8'
  );

  return { created: true, entryFilePath };
};

export const ensureWranglerConfig = <TValues, TOptions>(
  options: EnsureWranglerConfigOptions<TValues, TOptions>
): EnsureWranglerConfigResult<TValues> => {
  if (!existsSync(options.configPath)) {
    const values = options.resolveValues(undefined, options.options);
    writeFileSync(
      options.configPath,
      renderDefaultWranglerConfig(options.renderEnvBlock(values), options.compatibilityDate),
      'utf-8'
    );
    return { createdFile: true, insertedEnv: true, values };
  }

  const content = readFileSync(options.configPath, 'utf-8');
  const values = options.resolveValues(content, options.options);
  const next = injectEnvBlock(content, options.envName, options.renderEnvBlock(values));

  if (next !== content) {
    writeFileSync(options.configPath, next, 'utf-8');
    return { createdFile: false, insertedEnv: true, values };
  }

  return { createdFile: false, insertedEnv: false, values };
};
