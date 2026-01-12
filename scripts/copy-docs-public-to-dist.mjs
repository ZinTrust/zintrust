import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'public');
const rootIndexFile = path.join(projectRoot, 'index.html');
const targetDir = path.join(projectRoot, 'dist', 'public');

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const copyDir = async (sourceDir, destDir) => {
  await fs.mkdir(destDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
      continue;
    }

    if (entry.isSymbolicLink()) {
      // Avoid copying symlinks into dist.
      continue;
    }

    await fs.copyFile(srcPath, destPath);
  }
};

const main = async () => {
  const hasPublicDir = await exists(publicDir);
  if (hasPublicDir) {
    await copyDir(publicDir, targetDir);
    console.log(`[postbuild] Copied ${publicDir} -> ${targetDir}`);
    return;
  }

  const hasRootIndex = await exists(rootIndexFile);
  if (!hasRootIndex) {
    // docs build might be skipped in some workflows; don't fail build.
    console.warn(`[postbuild] Skipping docs copy; missing: ${publicDir} and ${rootIndexFile}`);
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, 'index.html');
  await fs.copyFile(rootIndexFile, targetFile);
  console.log(`[postbuild] Copied ${rootIndexFile} -> ${targetFile}`);
};

await main();
