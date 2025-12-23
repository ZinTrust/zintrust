import {
  addFeature,
  getAvailableFeatures,
  validateOptions,
} from '@cli/scaffolding/FeatureScaffolder';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('FeatureScaffolder', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      FileGenerator.deleteDirectory(dir);
    }
    tempDirs.length = 0;
  });

  it('lists available features', () => {
    const features = getAvailableFeatures();
    expect(features.length).toBeGreaterThan(0);
    expect(features).toContain('auth');
  });

  it('validates options and reports missing servicePath', () => {
    const result = validateOptions({ name: 'auth', servicePath: '/path/does/not/exist' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Service path does not exist');
  });

  it('adds a feature and creates files', async () => {
    const servicePath = makeTempDir('zintrust-service-');
    tempDirs.push(servicePath);

    // servicePath must exist; the scaffolder will create src/features/<feature>
    const res = await addFeature({ name: 'auth', servicePath, withTest: true });

    expect(res.success).toBe(true);
    expect(res.filesCreated.length).toBeGreaterThanOrEqual(3);

    // Verify expected files exist
    const featureDir = path.join(servicePath, 'src', 'features', 'auth');
    expect(FileGenerator.directoryExists(featureDir)).toBe(true);
    expect(FileGenerator.fileExists(path.join(featureDir, 'index.ts'))).toBe(true);
    expect(FileGenerator.fileExists(path.join(featureDir, 'README.md'))).toBe(true);
    expect(FileGenerator.fileExists(path.join(featureDir, 'auth.test.ts'))).toBe(true);
  });

  it('returns an error when feature already exists', async () => {
    const servicePath = makeTempDir('zintrust-service-');
    tempDirs.push(servicePath);

    const first = await addFeature({ name: 'cache', servicePath });
    expect(first.success).toBe(true);

    const second = await addFeature({ name: 'cache', servicePath });
    expect(second.success).toBe(false);
    expect(second.message).toContain('already exists');
  });
});
