import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { extensionDirs, workspaceRoot } from './lib/extension-harness.mjs';

const outputDir = path.join(workspaceRoot, '.artifacts', 'vsix');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let copied = 0;
for (const extensionDir of extensionDirs) {
  const extensionPath = path.join(workspaceRoot, extensionDir);
  const files = await readdir(extensionPath);
  const vsixFiles = files.filter((fileName) => fileName.endsWith('.vsix'));

  for (const fileName of vsixFiles) {
    await copyFile(path.join(extensionPath, fileName), path.join(outputDir, fileName));
    copied += 1;
  }
}

if (copied === 0) {
  throw new Error('No VSIX artifacts were found. Run npm --prefix exts run validate first.');
}

console.log(`Collected ${String(copied)} VSIX artifacts in ${outputDir}.`);
