import { SeederDiscovery } from '@zintrust/core/seeders';
import { SeederLoader } from '@zintrust/core/seeders';
import { CommonUtils } from '@zintrust/core/common';
import * as path from 'node:path';
import type { IDatabase } from '@zintrust/core/orm';

export const DatabaseSeeder = Object.freeze({
  async run(db: IDatabase): Promise<void> {
    const dir = CommonUtils.esmDirname(import.meta.url);
    const files = SeederDiscovery.listSeederFiles(dir).filter((filePath) => {
      const base = path.basename(filePath, path.extname(filePath));
      return base !== 'DatabaseSeeder';
    });

    const seeders = await Promise.all(files.map((filePath) => SeederLoader.load(filePath)));

    await Promise.all(seeders.map((seeder) => seeder.run(db)));
  },
});
