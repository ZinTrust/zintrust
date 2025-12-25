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

  // Save updated checksums
  saveChecksums(checksums);

  // Summary
  Logger.info(`\n📦 Template sync complete`);
  Logger.info(`   Updated: ${updated}`);
  Logger.info(`   Skipped: ${skipped}`);
  Logger.info(`   Total: ${mappings.length}\n`);
}

// Run sync
try {
  await syncTemplates();
} catch (error) {
  Logger.error('Template sync failed', error);
  process.exit(1);
}
