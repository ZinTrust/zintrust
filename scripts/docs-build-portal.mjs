import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const docsRoot = path.join(projectRoot, 'docs-website');
const publicRoot = path.join(docsRoot, 'public');

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const copyIfExists = async (fromPath, toPath) => {
  if (!(await exists(fromPath))) return false;
  await fs.copyFile(fromPath, toPath);
  return true;
};

const main = async () => {
  await fs.mkdir(publicRoot, { recursive: true });

  const copiedHeaders = await copyIfExists(
    path.join(docsRoot, '_headers'),
    path.join(publicRoot, '_headers')
  );
  const copiedRedirects = await copyIfExists(
    path.join(docsRoot, '_redirects'),
    path.join(publicRoot, '_redirects')
  );

  const brandDir = path.join(docsRoot, 'brand');
  if (await exists(brandDir)) {
    await fs.cp(brandDir, path.join(publicRoot, 'brand'), { recursive: true, force: true });
  }

  console.log(
    `[docs:build:portal] Copied: _headers=${copiedHeaders}, _redirects=${copiedRedirects}, brand=${await exists(
      brandDir
    )}`
  );
};

await main();
