import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export const MigrationDiscovery = Object.freeze({
  resolveDir(projectRoot: string, dir: string): string {
    return path.resolve(projectRoot, dir);
  },

  listMigrationFiles(dir: string, extension: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    // Only consider files that match the timestamped migration naming convention
    // e.g. 20260109074544_create_users_table.ts — avoids importing stray files.
    const migrationNameRe = /^\d{14,}_.+$/;
    const normalizeExt = (ext: string): string => (ext.startsWith('.') ? ext : `.${ext}`);
    const ext = normalizeExt(extension);

    const pick = (extToPick: string): string[] =>
      files.filter(
        (f) => f.endsWith(extToPick) && !f.startsWith('index.') && migrationNameRe.test(f)
      );

    const primary = pick(ext);
    if (primary.length > 0) {
      return primary.toSorted((a, b) => a.localeCompare(b)).map((f) => path.join(dir, f));
    }

    // Fallback to JS/TS variants to support compiled migrations in dist builds.
    let fallbackExts: string[];

    switch (ext) {
      case '.ts':
        fallbackExts = ['.js', '.mjs', '.cjs'];
        break;
      case '.js':
        fallbackExts = ['.mjs', '.cjs', '.ts'];
        break;
      case '.mjs':
        fallbackExts = ['.js', '.cjs', '.ts'];
        break;
      case '.cjs':
        fallbackExts = ['.js', '.mjs', '.ts'];
        break;
      default:
        fallbackExts = ['.ts', '.js', '.mjs', '.cjs'];
        break;
    }

    for (const candidate of fallbackExts) {
      const found = pick(candidate);
      if (found.length > 0) {
        return found.toSorted((a, b) => a.localeCompare(b)).map((f) => path.join(dir, f));
      }
    }

    return [];
  },
});
