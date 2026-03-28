import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ProjectRuntime } from '../../../src/runtime/ProjectRuntime';
import {
  StartupConfigFile,
  StartupConfigFileRegistry,
} from '../../../src/runtime/StartupConfigFileRegistry';

describe('src/runtime/StartupConfigFileRegistry patch coverage (extra)', () => {
  it('tracks preload state and supports test-only clearing', async () => {
    StartupConfigFileRegistry.clear();
    expect(StartupConfigFileRegistry.isPreloaded()).toBe(false);

    expect(StartupConfigFileRegistry.has(StartupConfigFile.Cache)).toBe(false);
    expect(StartupConfigFileRegistry.get(StartupConfigFile.Cache)).toBeUndefined();

    await StartupConfigFileRegistry.preload([]);
    expect(StartupConfigFileRegistry.isPreloaded()).toBe(true);

    StartupConfigFileRegistry.clear();
    expect(StartupConfigFileRegistry.isPreloaded()).toBe(false);
  });

  it('merges root and service-local config overrides when an active service is set', async () => {
    const previousRoot = process.env['ZINTRUST_PROJECT_ROOT'];
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-startup-overrides-'));

    try {
      process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;
      fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, 'src/services/ecommerce/users/config'), { recursive: true });

      fs.writeFileSync(
        path.join(tempRoot, 'config/cache.mjs'),
        "export default { default: 'memory', drivers: { memory: { ttl: 30 } }, ttl: 30 }\n",
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tempRoot, 'src/services/ecommerce/users/config/cache.mjs'),
        "export default { drivers: { memory: { ttl: 90 } }, keyPrefix: 'users:' }\n",
        'utf-8'
      );

      ProjectRuntime.clear();
      ProjectRuntime.set({
        activeService: {
          id: 'ecommerce/users',
          domain: 'ecommerce',
          name: 'users',
          configRoot: 'src/services/ecommerce/users/config',
        },
      });

      StartupConfigFileRegistry.clear();
      await StartupConfigFileRegistry.preload([StartupConfigFile.Cache]);

      expect(StartupConfigFileRegistry.get(StartupConfigFile.Cache)).toEqual({
        default: 'memory',
        drivers: { memory: { ttl: 90 } },
        ttl: 30,
        keyPrefix: 'users:',
      });
    } finally {
      StartupConfigFileRegistry.clear();
      ProjectRuntime.clear();
      fs.rmSync(tempRoot, { recursive: true, force: true });

      if (previousRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
      else process.env['ZINTRUST_PROJECT_ROOT'] = previousRoot;
    }
  });
});
