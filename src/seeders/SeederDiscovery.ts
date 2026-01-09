import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

const isSeederFile = (file: string): boolean => {
  if (file.endsWith('.d.ts')) return false;
  return file.endsWith('.ts') || file.endsWith('.js');
};

export const SeederDiscovery = Object.freeze({
  resolveDir(projectRoot: string, dir: string): string {
    return path.resolve(projectRoot, dir);
  },

  listSeederFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    return files
      .filter(isSeederFile)
      .sort((a, b) => a.localeCompare(b))
      .map((f) => path.join(dir, f));
  },
});
