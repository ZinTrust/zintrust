import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'docs-website', 'public');
const targetDir = path.join(projectRoot, 'dist', 'public');

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const hasSource = await exists(sourceDir);
  if (!hasSource) {
    // docs build might be skipped in some workflows; don't fail build.
    console.warn(`[postbuild] Skipping docs copy; missing: ${sourceDir}`);
    return;
  }

  await fs.mkdir(path.dirname(targetDir), { recursive: true });

  // Ensure clean target to avoid stale assets.
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  await fs.cp(sourceDir, targetDir, { recursive: true, force: true });
  console.log(`[postbuild] Copied ${sourceDir} -> ${targetDir}`);
};

await main();
