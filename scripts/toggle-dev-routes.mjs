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
const targets = [
  {
    filePath: join(rootDir, 'routes', 'api.ts'),
    markers: {
      import: "import { registerDevRoutes } from '@routes/apiDev';",
      registerDev: 'registerDevRoutes(router);',
    },
  },
  {
    filePath: join(rootDir, 'src', 'boot', 'bootstrap.ts'),
    markers: {
      pluginImport: "import '@/zintrust.plugins';",
    },
  },
];

function readTargetFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ Failed to read ${filePath}:`, error.message);
    process.exit(1);
  }
}

function writeTargetFile(filePath, content) {
  try {
    writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    console.error(`❌ Failed to write ${filePath}:`, error.message);
    process.exit(1);
  }
}

function commentOut(content, markers) {
  let modified = content;
  let changeCount = 0;

  if (markers.import && content.includes(markers.import)) {
    modified = modified.replace(new RegExp(`^(${escapeRegex(markers.import)})`, 'm'), '// $1');
    changeCount++;
  }

  if (markers.registerDev && content.includes(markers.registerDev)) {
    modified = modified.replace(
      new RegExp(String.raw`^(\s*)(${escapeRegex(markers.registerDev)})`, 'm'),
      '$1// $2'
    );
    changeCount++;
  }

  if (markers.registerTest && content.includes(markers.registerTest)) {
    modified = modified.replace(
      new RegExp(String.raw`^(\s*)(${escapeRegex(markers.registerTest)})`, 'm'),
      '$1// $2'
    );
    changeCount++;
  }

  if (markers.pluginImport && content.includes(markers.pluginImport)) {
    modified = modified.replace(
      new RegExp(`^(${escapeRegex(markers.pluginImport)})`, 'm'),
      '// $1'
    );
    changeCount++;
  }

  return { modified, changeCount };
}

function uncomment(content, markers) {
  let modified = content;
  let changeCount = 0;

  if (markers.import) {
    const importPattern = new RegExp(String.raw`^//\s*(${escapeRegex(markers.import)})`, 'm');
    if (importPattern.test(content)) {
      modified = modified.replace(importPattern, '$1');
      changeCount++;
    }
  }

  if (markers.registerDev) {
    const devPattern = new RegExp(
      String.raw`^(\s*)//\s*(${escapeRegex(markers.registerDev)})`,
      'm'
    );
    if (devPattern.test(modified)) {
      modified = modified.replace(devPattern, '$1$2');
      changeCount++;
    }
  }

  if (markers.registerTest) {
    const testPattern = new RegExp(
      String.raw`^(\s*)//\s*(${escapeRegex(markers.registerTest)})`,
      'm'
    );
    if (testPattern.test(modified)) {
      modified = modified.replace(testPattern, '$1$2');
      changeCount++;
    }
  }

  if (markers.pluginImport) {
    const pluginPattern = new RegExp(String.raw`^//\s*(${escapeRegex(markers.pluginImport)})`, 'm');
    if (pluginPattern.test(modified)) {
      modified = modified.replace(pluginPattern, '$1');
      changeCount++;
    }
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

  let totalChanges = 0;

  for (const target of targets) {
    const content = readTargetFile(target.filePath);
    // const result =
    //   action === 'comment'
    //     ? commentOut(content, target.markers)
    //     : uncomment(content, target.markers);
    const result =
      action === 'comment'
        ? commentOut(content, target.markers)
        : uncomment(content, target.markers);

    if (result.changeCount > 0) {
      writeTargetFile(target.filePath, result.modified);
      totalChanges += result.changeCount;
    }
  }

  if (totalChanges === 0) {
    console.log(
      `ℹ️  No changes needed - dev-only imports already ${
        action === 'comment' ? 'commented out' : 'active'
      }`
    );
    process.exit(0);
  }

  console.log(
    `✅ Successfully ${action === 'comment' ? 'commented out' : 'restored'} ${totalChanges} line(s)`
  );
}

main();
