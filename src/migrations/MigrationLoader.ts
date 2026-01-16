import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import type { IDatabase } from '@orm/Database';
import { pathToFileURL } from 'node:url';

import type { LoadedMigration, MigrationHandler, MigrationModule } from '@migrations/types';

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

function normalizeHandler(fn: unknown, label: string): MigrationHandler {
  if (!isFunction(fn)) {
    throw ErrorFactory.createValidationError(
      `Invalid migration export: expected function for ${label}`
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

export const MigrationLoader = Object.freeze({
  async load(filePath: string): Promise<LoadedMigration> {
    const url = pathToFileURL(filePath).href;
    const raw = (await import(url)) as unknown;

    // Some tooling/transpilation paths wrap exports under `default`.
    // Prefer direct named exports, but fall back to default export if present.
    const mod = (raw ?? {}) as MigrationModule & { default?: unknown };
    const fallback = (mod.default ?? {}) as MigrationModule;

    const up = mod.migration?.up ?? mod.up ?? fallback.migration?.up ?? fallback.up;
    const down = mod.migration?.down ?? mod.down ?? fallback.migration?.down ?? fallback.down;

    if (up === undefined) {
      throw ErrorFactory.createValidationError(`Migration '${filePath}' is missing an 'up' export`);
    }
    if (down === undefined) {
      throw ErrorFactory.createValidationError(
        `Migration '${filePath}' is missing a 'down' export`
      );
    }

    return {
      name: path.basename(filePath, path.extname(filePath)),
      filePath,
      up: normalizeHandler(up, 'up'),
      down: normalizeHandler(down, 'down'),
    };
  },
});
