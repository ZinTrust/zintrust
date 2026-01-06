/**
 * Template Sync Script
 * Synchronizes base framework files to .tpl templates when checksums change
 * Runs during npm run build
 */

import { TemplateRegistry } from '@/templates/TemplateRegistry.js';
import { ensureDir, esmDirname } from '@common/index';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as crypto from '@node-singletons/crypto';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import * as nodePath from 'node:path';

const __dirname = esmDirname(import.meta.url);
const ROOT_DIR = path.resolve(__dirname, '../../');

interface ChecksumRecord {
  [basePath: string]: string;
}

/**
 * Calculate SHA1 hash of file content
 */
function hashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha1').update(content).digest('hex'); // NOSONAR;
  } catch (error) {
    Logger.error(`Error reading file ${filePath}`, error);
    throw ErrorFactory.createTryCatchError(`Failed to read file: ${filePath}`, error);
  }
}

/**
 * Extract content between TEMPLATE_START and TEMPLATE_END markers
 */
function extractTemplateContent(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const startMarker = '// TEMPLATE_START';
    const endMarker = '// TEMPLATE_END';

    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx === -1 || endIdx === -1) {
      Logger.warn(`Template markers not found in ${filePath}`);
      return content;
    }

    // Extract from after START marker to before END marker (inclusive of END comment)
    return content.substring(startIdx, endIdx + endMarker.length);
  } catch (error) {
    Logger.error(`Error extracting template from ${filePath}`, error);
    throw ErrorFactory.createTryCatchError(`Failed to extract template from: ${filePath}`, error);
  }
}

type WalkFile = {
  absPath: string;
  relPath: string;
};

const shouldSkipEntry = (name: string): boolean => {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'coverage' ||
    name === '.git' ||
    name === '.DS_Store'
  );
};

const listFilesRecursive = (baseDirAbs: string): WalkFile[] => {
  const out: WalkFile[] = [];
  const walk = (dirAbs: string): void => {
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkipEntry(entry.name)) continue;
      const abs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push({ absPath: abs, relPath: path.relative(baseDirAbs, abs) });
    }
  };
  walk(baseDirAbs);
  return out;
};

const syncProjectTemplateDir = (params: {
  checksums: ChecksumRecord;
  baseDirRel: string;
  templateDirRel: string;
  description: string;
  transformContent?: (relPath: string, content: string) => string;
  checksumSalt?: string;
}): { updated: number; skipped: number; total: number } => {
  const baseDirAbs = path.join(ROOT_DIR, params.baseDirRel);
  const templateDirAbs = path.join(ROOT_DIR, params.templateDirRel);

  if (!fs.existsSync(baseDirAbs)) {
    Logger.warn(`⚠️  Base directory not found: ${params.baseDirRel}`);
    return { updated: 0, skipped: 0, total: 0 };
  }

  const files = listFilesRecursive(baseDirAbs);
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const checksumSaltPart =
      typeof params.checksumSalt === 'string' && params.checksumSalt.length > 0
        ? `|${params.checksumSalt}`
        : '';
    const baseKey = `${params.baseDirRel}/${file.relPath}${checksumSaltPart}`;
    const currentHash = hashFile(file.absPath);
    const storedHash = params.checksums[baseKey];

    const outRel = `${file.relPath}.tpl`;
    const outAbs = path.join(templateDirAbs, outRel);

    if (currentHash === storedHash && fs.existsSync(outAbs)) {
      skipped++;
      continue;
    }

    const raw = fs.readFileSync(file.absPath, 'utf8');
    const transformed =
      typeof params.transformContent === 'function'
        ? params.transformContent(file.relPath, raw)
        : raw;

    ensureDir(path.dirname(outAbs));
    fs.writeFileSync(outAbs, transformed, 'utf8');
    params.checksums[baseKey] = currentHash;
    updated++;
  }

  if (files.length > 0) {
    Logger.info(
      `✓ ${params.description} (updated: ${updated}, skipped: ${skipped}, total: ${files.length})`
    );
  }

  return { updated, skipped, total: files.length };
};

const rewriteStarterTemplateImports = (relPath: string, content: string): string => {
  if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx') && !relPath.endsWith('.mts')) {
    return content;
  }

  const rewriteConfigAlias = (aliasSuffix: string): string => {
    const currentDir = nodePath.posix.dirname(relPath);
    const from = currentDir === '.' ? '' : currentDir;
    const target = aliasSuffix;
    const relative = nodePath.posix.relative(from, target);
    return relative.startsWith('.') ? relative : `./${relative}`;
  };

  // Starter templates should import framework APIs from the public package surface,
  // not from internal path-alias modules that only exist in the framework repo.
  return (
    content
      // Node-singletons are internal to this repo; starter templates should use Node built-ins.
      .replaceAll("'@node-singletons/fs'", "'node:fs'")
      .replaceAll('"@node-singletons/fs"', '"node:fs"')
      .replaceAll("'@node-singletons/path'", "'node:path'")
      .replaceAll('"@node-singletons/path"', '"node:path"')

      // Starter project config/* should reference sibling config modules via relative imports.
      .replaceAll(/(['"])@config\/([^'"]+)\1/g, (_m, quote: string, suffix: string) => {
        const rewritten = rewriteConfigAlias(suffix);
        return `${quote}${rewritten}${quote}`;
      })

      // Middleware imports are framework APIs; they must come from the public package.
      .replaceAll(/(['"])@middleware\/[^'"]+\1/g, (_m, quote: string) => {
        return `${quote}@zintrust/core${quote}`;
      })

      .replaceAll("'@routing/Router'", "'@zintrust/core'")
      .replaceAll("'@orm/Database'", "'@zintrust/core'")
      .replaceAll("'@orm/QueryBuilder'", "'@zintrust/core'")
      .replaceAll("'@orm/DatabaseAdapter'", "'@zintrust/core'")
      .replaceAll("'@exceptions/ZintrustError'", "'@zintrust/core'")
      .replaceAll("'@common/index'", "'@zintrust/core'")
      .replaceAll("'@httpClient/Http'", "'@zintrust/core'")
      // Handle double-quoted module specifiers too
      .replaceAll('"@routing/Router"', '"@zintrust/core"')
      .replaceAll('"@orm/Database"', '"@zintrust/core"')
      .replaceAll('"@orm/QueryBuilder"', '"@zintrust/core"')
      .replaceAll('"@orm/DatabaseAdapter"', '"@zintrust/core"')
      .replaceAll('"@exceptions/ZintrustError"', '"@zintrust/core"')
      .replaceAll('"@common/index"', '"@zintrust/core"')
      .replaceAll('"@httpClient/Http"', '"@zintrust/core"')
  );
};

const syncRegistryMappings = (params: {
  checksums: ChecksumRecord;
  mappings: Array<{ basePath: string; templatePath: string; description: string }>;
}): { updated: number; skipped: number } => {
  let updated = 0;
  let skipped = 0;

  for (const mapping of params.mappings) {
    const basePath = path.join(ROOT_DIR, mapping.basePath);
    const templatePath = path.join(ROOT_DIR, mapping.templatePath);

    if (!fs.existsSync(basePath)) {
      Logger.warn(`⚠️  Base file not found: ${mapping.basePath}`);
      continue;
    }

    const currentHash = hashFile(basePath);
    const storedHash = params.checksums[mapping.basePath];

    if (currentHash === storedHash && fs.existsSync(templatePath)) {
      Logger.info(`✓ ${mapping.description} (in sync)`);
      skipped++;
      continue;
    }

    try {
      const templateContent = extractTemplateContent(basePath);
      ensureDir(path.dirname(templatePath));
      fs.writeFileSync(templatePath, templateContent, 'utf8');
      params.checksums[mapping.basePath] = currentHash;
      Logger.info(`✓ Updated: ${mapping.description}`);
      updated++;
    } catch (error) {
      Logger.error(`❌ Failed to sync ${mapping.basePath}:`, error);
      process.exit(1);
    }
  }

  return { updated, skipped };
};

const syncStarterEnvTemplate = (params: {
  checksums: ChecksumRecord;
  projectRoot: string;
}): { updated: number; skipped: number; total: number } => {
  const envExampleAbs = fs.existsSync(path.join(ROOT_DIR, '.env.example'))
    ? path.join(ROOT_DIR, '.env.example')
    : path.join(ROOT_DIR, '.env.example.generated');

  const envTemplateAbs = path.join(ROOT_DIR, params.projectRoot, '.env.tpl');
  const envChecksumKey = 'starter/.env';

  if (!fs.existsSync(envExampleAbs)) {
    Logger.warn('⚠️  .env.example not found; skipping starter .env template generation');
    return { updated: 0, skipped: 0, total: 1 };
  }

  const currentHash = hashFile(envExampleAbs);
  const storedHash = params.checksums[envChecksumKey];

  if (currentHash === storedHash && fs.existsSync(envTemplateAbs)) {
    return { updated: 0, skipped: 1, total: 1 };
  }

  const raw = fs.readFileSync(envExampleAbs, 'utf8');
  const lines = raw.split(/\r?\n/);
  const rendered =
    lines
      .map((line) => {
        if (line.trim() === '' || line.startsWith('#')) return line;
        const eq = line.indexOf('=');
        if (eq === -1) return line;
        const key = line.slice(0, eq).trim();
        if (key === '') return line;
        if (key === 'NODE_ENV') return 'NODE_ENV=development';
        return `${key}=`;
      })
      .join('\n') + '\n';

  ensureDir(path.dirname(envTemplateAbs));
  fs.writeFileSync(envTemplateAbs, rendered, 'utf8');
  params.checksums[envChecksumKey] = currentHash;
  Logger.info('✓ Starter project .env (generated)');
  return { updated: 1, skipped: 0, total: 1 };
};

const syncStarterProjectTemplates = (params: {
  checksums: ChecksumRecord;
  projectRoot: string;
}): { updated: number; skipped: number; total: number } => {
  const s1 = syncProjectTemplateDir({
    checksums: params.checksums,
    baseDirRel: 'app',
    templateDirRel: `${params.projectRoot}/app`,
    description: 'Starter project app/*',
  });

  const s2 = syncProjectTemplateDir({
    checksums: params.checksums,
    baseDirRel: 'src/config',
    templateDirRel: `${params.projectRoot}/config`,
    description: 'Starter project config/* (from src/config/*)',
    transformContent: rewriteStarterTemplateImports,
    checksumSalt: 'starter-imports-v4',
  });

  const s3 = syncProjectTemplateDir({
    checksums: params.checksums,
    baseDirRel: 'src/database',
    templateDirRel: `${params.projectRoot}/database`,
    description: 'Starter project database/* (from src/database/*)',
    transformContent: rewriteStarterTemplateImports,
    checksumSalt: 'starter-imports-v3',
  });

  const s4 = syncProjectTemplateDir({
    checksums: params.checksums,
    baseDirRel: 'routes',
    templateDirRel: `${params.projectRoot}/routes`,
    description: 'Starter project routes/*',
    transformContent: rewriteStarterTemplateImports,
    checksumSalt: 'starter-imports-v1',
  });

  const s5 = syncStarterEnvTemplate({
    checksums: params.checksums,
    projectRoot: params.projectRoot,
  });

  return {
    updated: s1.updated + s2.updated + s3.updated + s4.updated + s5.updated,
    skipped: s1.skipped + s2.skipped + s3.skipped + s4.skipped + s5.skipped,
    total: s1.total + s2.total + s3.total + s4.total + s5.total,
  };
};

/**
 * Load existing checksums from JSON file
 */
function loadChecksums(): ChecksumRecord {
  const checksumPath = path.join(ROOT_DIR, '.template-checksums.json');
  if (fs.existsSync(checksumPath)) {
    try {
      const content = fs.readFileSync(checksumPath, 'utf8');
      return <ChecksumRecord>JSON.parse(content);
    } catch (error) {
      Logger.error('Could not parse .template-checksums.json, starting fresh', error);
      return {};
    }
  }
  return {};
}

/**
 * Save checksums to JSON file
 */
function saveChecksums(checksums: ChecksumRecord): void {
  const checksumPath = path.join(ROOT_DIR, '.template-checksums.json');
  fs.writeFileSync(checksumPath, JSON.stringify(checksums, null, 2));
}

/**
 * Main sync function
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function syncTemplates(): Promise<void> {
  Logger.info('🔄 Syncing templates...\n');

  const checksums = loadChecksums();
  const mappings = TemplateRegistry.getMappings();
  const registry = syncRegistryMappings({ checksums, mappings });

  // Sync starter project templates (basic) from base framework folders.
  // Spec: app/* -> app/*, src/config/* -> config/*, src/database/* -> database/*, routes/* -> routes/*
  // plus .env (generated from .env.example with sensitive values blanked).
  Logger.info('');
  Logger.info('🔄 Syncing starter project templates (basic)...');

  const projectRoot = 'src/templates/project/basic';
  const starter = syncStarterProjectTemplates({ checksums, projectRoot });

  // Save updated checksums
  saveChecksums(checksums);

  // Summary
  const updated = registry.updated + starter.updated;
  const skipped = registry.skipped + starter.skipped;
  Logger.info(`\n📦 Template sync complete`);
  Logger.info(`   Updated: ${updated}`);
  Logger.info(`   Skipped: ${skipped}`);
  Logger.info(`   Total: ${mappings.length + starter.total}\n`);
}

// Run sync
try {
  await syncTemplates();
} catch (error) {
  Logger.error('Template sync failed', error);
  process.exit(1);
}
