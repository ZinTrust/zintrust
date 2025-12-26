/**
 * Template Sync Script
 * Synchronizes base framework files to .tpl templates when checksums change
 * Runs during npm run build
 */

import { TemplateRegistry } from '@/templates/TemplateRegistry.js';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as crypto from '@node-singletons/crypto';
import fs from '@node-singletons/fs';
import { fileURLToPath } from '@node-singletons/url';
import * as path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

/**
 * Ensure directory exists, create if needed
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
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

const isSensitiveEnvKey = (key: string): boolean => {
  const k = key.toUpperCase();
  return (
    k.endsWith('_SECRET') ||
    k.endsWith('_TOKEN') ||
    k.endsWith('_PASSWORD') ||
    k.endsWith('_PRIVATE_KEY') ||
    k.endsWith('_ACCESS_KEY') ||
    k.endsWith('_API_KEY') ||
    k === 'APP_KEY' ||
    k === 'JWT_SECRET' ||
    k === 'SONAR_TOKEN' ||
    k === 'SNYK_TOKEN' ||
    k === 'STRIPE_SECRET_KEY'
  );
};

const sanitizeEnvFile = (content: string): string => {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) {
      out.push(line);
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    if (key === '') {
      out.push(line);
      continue;
    }

    if (isSensitiveEnvKey(key)) {
      out.push(`${key}=`);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
};

const syncProjectTemplateDir = (params: {
  checksums: ChecksumRecord;
  baseDirRel: string;
  templateDirRel: string;
  description: string;
  transformContent?: (relPath: string, content: string) => string;
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
    const baseKey = `${params.baseDirRel}/${file.relPath}`;
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

const syncProjectEnv = (checksums: ChecksumRecord): { updated: number; skipped: number } => {
  const baseRel = fs.existsSync(path.join(ROOT_DIR, '.env')) ? '.env' : '.env.example';
  const baseAbs = path.join(ROOT_DIR, baseRel);
  const outRel = 'src/templates/project/basic/.env.tpl';
  const outAbs = path.join(ROOT_DIR, outRel);

  if (!fs.existsSync(baseAbs)) {
    Logger.warn(`⚠️  Base file not found: ${baseRel}`);
    return { updated: 0, skipped: 0 };
  }

  const baseKey = baseRel;
  const currentHash = hashFile(baseAbs);
  const storedHash = checksums[baseKey];
  if (currentHash === storedHash && fs.existsSync(outAbs)) {
    Logger.info('✓ Starter project .env (in sync)');
    return { updated: 0, skipped: 1 };
  }

  const raw = fs.readFileSync(baseAbs, 'utf8');
  const sanitized = sanitizeEnvFile(raw);
  ensureDir(path.dirname(outAbs));
  fs.writeFileSync(outAbs, sanitized, 'utf8');
  checksums[baseKey] = currentHash;
  Logger.info('✓ Updated: Starter project .env');
  return { updated: 1, skipped: 0 };
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
  let updated = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    const basePath = path.join(ROOT_DIR, mapping.basePath);
    const templatePath = path.join(ROOT_DIR, mapping.templatePath);

    // Check if base file exists
    if (!fs.existsSync(basePath)) {
      Logger.warn(`⚠️  Base file not found: ${mapping.basePath}`);
      continue;
    }

    // Calculate current hash
    const currentHash = hashFile(basePath);
    const storedHash = checksums[mapping.basePath];

    // Check if update is needed
    if (currentHash === storedHash && fs.existsSync(templatePath)) {
      Logger.info(`✓ ${mapping.description} (in sync)`);
      skipped++;
      continue;
    }

    // Extract and write template
    try {
      const templateContent = extractTemplateContent(basePath);
      ensureDir(path.dirname(templatePath));
      fs.writeFileSync(templatePath, templateContent, 'utf8');

      // Update checksum
      checksums[mapping.basePath] = currentHash;

      Logger.info(`✓ Updated: ${mapping.description}`);
      updated++;
    } catch (error) {
      Logger.error(`❌ Failed to sync ${mapping.basePath}:`, error);
      process.exit(1);
    }
  }

  // Sync starter project templates (basic) from base framework folders.
  // Spec: app/* -> app/*, src/config/* -> config/*, src/database/* -> database/*, routes/* -> routes/*
  // plus .env (generated from .env.example with sensitive values blanked).
  Logger.info('');
  Logger.info('🔄 Syncing starter project templates (basic)...');

  const projectRoot = 'src/templates/project/basic';
  const s1 = syncProjectTemplateDir({
    checksums,
    baseDirRel: 'app',
    templateDirRel: `${projectRoot}/app`,
    description: 'Starter project app/*',
  });

  const s2 = syncProjectTemplateDir({
    checksums,
    baseDirRel: 'src/config',
    templateDirRel: `${projectRoot}/config`,
    description: 'Starter project config/* (from src/config/*)',
  });

  const s3 = syncProjectTemplateDir({
    checksums,
    baseDirRel: 'src/database',
    templateDirRel: `${projectRoot}/database`,
    description: 'Starter project database/* (from src/database/*)',
  });

  const s4 = syncProjectTemplateDir({
    checksums,
    baseDirRel: 'routes',
    templateDirRel: `${projectRoot}/routes`,
    description: 'Starter project routes/*',
  });

  const s5 = syncProjectEnv(checksums);

  updated += s1.updated + s2.updated + s3.updated + s4.updated + s5.updated;
  skipped += s1.skipped + s2.skipped + s3.skipped + s4.skipped + s5.skipped;

  // Save updated checksums
  saveChecksums(checksums);

  // Summary
  Logger.info(`\n📦 Template sync complete`);
  Logger.info(`   Updated: ${updated}`);
  Logger.info(`   Skipped: ${skipped}`);
  Logger.info(`   Total: ${mappings.length + s1.total + s2.total + s3.total + s4.total + 1}\n`);
}

// Run sync
try {
  await syncTemplates();
} catch (error) {
  Logger.error('Template sync failed', error);
  process.exit(1);
}
