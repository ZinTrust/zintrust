import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export const MigrationDiscovery = Object.freeze({
  resolveDir(projectRoot: string, dir: string): string {
    return path.resolve(projectRoot, dir);
  },

  listMigrationFiles(dir: string, extension: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    return files
      .filter((f) => f.endsWith(extension))
      .sort((a, b) => a.localeCompare(b))
      .map((f) => path.join(dir, f));
  },
});
