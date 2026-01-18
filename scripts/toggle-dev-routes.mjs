#!/usr/bin/env node

/**
 * Toggle dev/test routes in api.ts
 * Usage:
 *   node scripts/toggle-dev-routes.mjs comment   # Comment out dev routes before build
 *   node scripts/toggle-dev-routes.mjs uncomment # Restore dev routes after build
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const apiFilePath = join(rootDir, 'routes', 'api.ts');

const DEV_MARKERS = {
  import: "import { registerDevRoutes, registerTestRoutes } from '@routes/apiDev';",
  registerDev: 'registerDevRoutes(router);',
  registerTest: 'registerTestRoutes(pr);',
};

function readApiFile() {
  try {
    return readFileSync(apiFilePath, 'utf8');
  } catch (error) {
    console.error(`❌ Failed to read ${apiFilePath}:`, error.message);
    process.exit(1);
  }
}

function writeApiFile(content) {
  try {
    writeFileSync(apiFilePath, content, 'utf8');
  } catch (error) {
    console.error(`❌ Failed to write ${apiFilePath}:`, error.message);
    process.exit(1);
  }
}

function commentOut(content) {
  let modified = content;
  let changeCount = 0;

  // Comment out import
  if (content.includes(DEV_MARKERS.import)) {
    modified = modified.replace(new RegExp(`^(${escapeRegex(DEV_MARKERS.import)})`, 'm'), '// $1');
    changeCount++;
  }

  // Comment out registerDevRoutes
  if (content.includes(DEV_MARKERS.registerDev)) {
    modified = modified.replace(
      new RegExp(String.raw`^(\s*)(${escapeRegex(DEV_MARKERS.registerDev)})`, 'm'),
      '$1// $2'
    );
    changeCount++;
  }

  // Comment out registerTestRoutes
  if (content.includes(DEV_MARKERS.registerTest)) {
    modified = modified.replace(
      new RegExp(String.raw`^(\s*)(${escapeRegex(DEV_MARKERS.registerTest)})`, 'm'),
      '$1// $2'
    );
    changeCount++;
  }

  return { modified, changeCount };
}

function uncomment(content) {
  let modified = content;
  let changeCount = 0;

  // Uncomment import
  const importPattern = new RegExp(String.raw`^//\s*(${escapeRegex(DEV_MARKERS.import)})`, 'm');
  if (importPattern.test(content)) {
    modified = modified.replace(importPattern, '$1');
    changeCount++;
  }

  // Uncomment registerDevRoutes
  const devPattern = new RegExp(
    String.raw`^(\s*)//\s*(${escapeRegex(DEV_MARKERS.registerDev)})`,
    'm'
  );
  if (devPattern.test(modified)) {
    modified = modified.replace(devPattern, '$1$2');
    changeCount++;
  }

  // Uncomment registerTestRoutes
  const testPattern = new RegExp(
    String.raw`^(\s*)//\s*(${escapeRegex(DEV_MARKERS.registerTest)})`,
    'm'
  );
  if (testPattern.test(modified)) {
    modified = modified.replace(testPattern, '$1$2');
    changeCount++;
  }

  return { modified, changeCount };
}

function escapeRegex(str) {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function main() {
  const action = process.argv[2];

  if (!action || !['comment', 'uncomment'].includes(action)) {
    console.error('❌ Usage: node scripts/toggle-dev-routes.mjs <comment|uncomment>');
    process.exit(1);
  }

  console.log(`📝 ${action === 'comment' ? 'Commenting out' : 'Restoring'} dev routes...`);

  const content = readApiFile();
  const result = action === 'comment' ? commentOut(content) : uncomment(content);

  if (result.changeCount === 0) {
    console.log(
      `ℹ️  No changes needed - routes already ${action === 'comment' ? 'commented out' : 'active'}`
    );
    process.exit(0);
  }

  writeApiFile(result.modified);
  console.log(
    `✅ Successfully ${action === 'comment' ? 'commented out' : 'restored'} ${result.changeCount} line(s)`
  );
}

main();
