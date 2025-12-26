import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const sourceFile = path.join(projectRoot, 'docs', 'getting-started.md');
const targetDir = path.join(projectRoot, 'dist');
const targetFile = path.join(targetDir, 'README.md');

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const hasSource = await exists(sourceFile);
  if (!hasSource) {
    console.warn(`[postbuild] Skipping dist README copy; missing: ${sourceFile}`);
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  const content = await fs.readFile(sourceFile, 'utf8');
  await fs.writeFile(targetFile, content.endsWith('\n') ? content : `${content}\n`, 'utf8');

  console.log(`[postbuild] Copied ${sourceFile} -> ${targetFile}`);
};

await main();
