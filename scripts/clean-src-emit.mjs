import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';

const removeIf = (filePath, shouldRemove) => {
  if (shouldRemove) {
    fs.unlinkSync(filePath);
  }
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    if (fullPath.endsWith('.js')) {
      const tsPath = fullPath.slice(0, -3) + '.ts';
      removeIf(fullPath, fs.existsSync(tsPath));
      continue;
    }

    if (fullPath.endsWith('.d.ts')) {
      const base = fullPath.slice(0, -5);
      removeIf(fullPath, fs.existsSync(base + '.ts') || fs.existsSync(base + '.tsx'));
      continue;
    }

    if (fullPath.endsWith('.js.map')) {
      const base = fullPath.slice(0, -7);
      removeIf(fullPath, fs.existsSync(base + '.ts') || fs.existsSync(base + '.js'));
    }
  }
};

if (fs.existsSync(ROOT)) {
  walk(ROOT);
}
