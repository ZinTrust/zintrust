#!/usr/bin/env node

/**
 * Toggle dev/test routes in api.ts
 * Usage:
 *   node scripts/toggle-dev-routes.mjs comment   # Comment out dev routes before build
 *   node scripts/toggle-dev-routes.mjs remove    # Remove dev routes before CI build/coverage
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

function removeMarkerLine(content, marker) {
  if (!marker) return { content, changed: false };

  const directPattern = new RegExp(String.raw`^\s*${escapeRegex(marker)}\s*\n?`, 'm');
  if (directPattern.test(content)) {
    return { content: content.replace(directPattern, ''), changed: true };
  }

  const commentedPattern = new RegExp(String.raw`^\s*//\s*${escapeRegex(marker)}\s*\n?`, 'm');
  if (commentedPattern.test(content)) {
    return { content: content.replace(commentedPattern, ''), changed: true };
  }

  return { content, changed: false };
}

function removeLines(content, markers) {
  const markerValues = [
    markers.import,
    markers.registerDev,
    markers.registerTest,
    markers.pluginImport,
  ];

  let modified = content;
  let changeCount = 0;

  for (const marker of markerValues) {
    const result = removeMarkerLine(modified, marker);
    modified = result.content;
    if (result.changed) changeCount++;
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

const ACTION_LABELS = {
  comment: 'Commenting out',
  remove: 'Removing',
  uncomment: 'Restoring',
};

const ACTION_STATE_LABELS = {
  comment: 'commented out',
  remove: 'removed',
  uncomment: 'active',
};

const ACTION_SUCCESS_LABELS = {
  comment: 'commented out',
  remove: 'removed',
  uncomment: 'restored',
};

function isValidAction(action) {
  return action === 'comment' || action === 'remove' || action === 'uncomment';
}

function applyAction(content, markers, action) {
  if (action === 'comment') return commentOut(content, markers);
  if (action === 'remove') return removeLines(content, markers);
  return uncomment(content, markers);
}

function main() {
  const action = process.argv[2];

  if (!isValidAction(action)) {
    console.error('❌ Usage: node scripts/toggle-dev-routes.mjs <comment|remove|uncomment>');
    process.exit(1);
  }

  const actionLabel = ACTION_LABELS[action];
  console.log(`📝 ${actionLabel} dev routes...`);

  let totalChanges = 0;

  for (const target of targets) {
    const content = readTargetFile(target.filePath);
    const result = applyAction(content, target.markers, action);

    if (result.changeCount > 0) {
      writeTargetFile(target.filePath, result.modified);
      totalChanges += result.changeCount;
    }
  }

  if (totalChanges === 0) {
    const stateLabel = ACTION_STATE_LABELS[action];
    console.log(`ℹ️  No changes needed - dev-only imports already ${stateLabel}`);
    process.exit(0);
  }

  const successLabel = ACTION_SUCCESS_LABELS[action];
  console.log(`✅ Successfully ${successLabel} ${totalChanges} line(s)`);
}

main();
