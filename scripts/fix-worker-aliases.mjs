import fs from 'node:fs';
import path from 'node:path';

const filePath = path.join(process.cwd(), 'dist/src/runtime/WorkerAdapterImports.js');

if (fs.existsSync(filePath)) {
  console.log(`Fixing aliases in ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Revert tsc-alias resolution for plugin files
  // (Assuming tsc-alias converted "@/zintrust.plugins.ts" to "../zintrust.plugins.ts" or similar)
  // We want to force them to use the "@/..." alias so the consumer project resolves them.

  let changed = false;

  const replaceMap = [
    { from: /\.\.\/zintrust\.plugins\.ts/g, to: '@/zintrust.plugins.ts' },
    { from: /\.\.\/zintrust\.plugins\.wg\.ts/g, to: '@/zintrust.plugins.wg.ts' },
  ];

  for (const { from, to } of replaceMap) {
    if (content.match(from)) {
      content = content.replace(from, to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log('✅ Fixed WorkerAdapterImports.js aliases');
  } else {
    console.log('ℹ️  No aliases needed fixing in WorkerAdapterImports.js');
  }
} else {
  console.log(`⚠️  ${filePath} not found, skipping fix-worker-aliases.`);
}
