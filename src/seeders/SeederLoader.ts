import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import { pathToFileURL } from 'node:url';

import type { LoadedSeeder, SeederHandler } from '@/seeders/types';
import type { IDatabase } from '@orm/Database';

type SeederModuleExports = Record<string, unknown> & {
  seeder?: unknown;
  run?: unknown;
  default?: unknown;
};

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasRun(value: unknown): value is { run?: unknown } {
  return typeof value === 'object' && value !== null && 'run' in value;
}

function normalizeHandler(fn: unknown, label: string): SeederHandler {
  if (!isFunction(fn)) {
    throw ErrorFactory.createValidationError(
      `Invalid seeder export: expected function for ${label}`
    );
  }

  return async (db: IDatabase): Promise<void> => {
    // Support both (db) => Promise<void> and () => Promise<void>.
    if (fn.length <= 0) {
      await Promise.resolve(fn());
      return;
    }

    await Promise.resolve(fn(db));
  };
}

function selectSeederExport(mod: SeederModuleExports, baseName: string): unknown {
  const defaultExport = mod.default;
  const defaultNamed = isRecord(defaultExport) ? defaultExport[baseName] : undefined;

  // Prefer conventional exports first.
  const candidate = mod.seeder ?? mod[baseName] ?? mod.run ?? defaultExport ?? defaultNamed;

  if (candidate !== undefined) return candidate;

  // Last resort: pick the first export that looks like a seeder object.
  for (const value of Object.values(mod)) {
    if (hasRun(value)) return value;
  }

  return undefined;
}

export const SeederLoader = Object.freeze({
  async load(filePath: string): Promise<LoadedSeeder> {
    const url = pathToFileURL(filePath).href;
    const raw = (await import(url)) as unknown;

    const mod: SeederModuleExports = isRecord(raw) ? raw : {};
    const baseName = path.basename(filePath, path.extname(filePath));
    const picked = selectSeederExport(mod, baseName);

    const baseExport = mod[baseName];
    const runFn =
      (hasRun(picked) ? picked.run : undefined) ??
      (hasRun(baseExport) ? baseExport.run : undefined) ??
      mod.run;

    if (runFn === undefined) {
      throw ErrorFactory.createValidationError(
        `Seeder '${filePath}' is missing a runnable export (expected '${baseName}.run()', 'seeder.run()', 'run()', or default export with 'run()')`
      );
    }

    return {
      name: baseName,
      filePath,
      run: normalizeHandler(runFn, 'run'),
    };
  },
});
