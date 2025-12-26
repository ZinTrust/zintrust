import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceFile = path.join(projectRoot, 'docs-website', 'index.html');
const targetDir = path.join(projectRoot, 'dist', 'public');
const targetFile = path.join(targetDir, 'index.html');

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const hasSource = await exists(sourceFile);
  if (!hasSource) {
    // docs build might be skipped in some workflows; don't fail build.
    console.warn(`[postbuild] Skipping docs copy; missing: ${sourceFile}`);
    return;
  }

  // Create dist/public directory if it doesn't exist
  await fs.mkdir(targetDir, { recursive: true });

  // Copy index.html to dist/public/index.html
  await fs.copyFile(sourceFile, targetFile);
  console.log(`[postbuild] Copied ${sourceFile} -> ${targetFile}`);
};

await main();
