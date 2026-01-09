import { SeederDiscovery } from '@/seeders/SeederDiscovery';
import { SeederLoader } from '@/seeders/SeederLoader';
import { CommonUtils } from '@common/index';
import * as path from '@node-singletons/path';
import type { IDatabase } from '@orm/Database';

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
