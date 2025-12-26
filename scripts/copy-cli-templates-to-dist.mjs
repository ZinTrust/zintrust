import fs from 'node:fs';
import path from 'node:path';

const copyDirRecursive = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(src, dest);
      continue;
    }

    if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
};

const repoRoot = process.cwd();
const srcTemplates = path.join(repoRoot, 'src', 'templates');
const distTemplates = path.join(repoRoot, 'dist', 'src', 'templates');

copyDirRecursive(srcTemplates, distTemplates);

process.stdout.write(`✅ Copied templates to ${distTemplates}\n`);
