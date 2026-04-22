import { describe, expect, it, vi } from 'vitest';

const writtenFiles = new Map<string, string>();
const existingFiles = new Set<string>();

vi.mock('@cli/scaffolding/FileGenerator', () => {
  return {
    FileGenerator: {
      fileExists: (p: string) => existingFiles.has(p),
      readFile: (p: string) => writtenFiles.get(p) ?? '',
      writeFile: (
        p: string,
        content: string,
        options?: { overwrite?: boolean; createDirs?: boolean }
      ) => {
        const overwrite = options?.overwrite ?? false;
        if (overwrite === false && existingFiles.has(p)) return false;
        existingFiles.add(p);
        writtenFiles.set(p, content);
        return true;
      },
    },
  };
});

const spawnAndWait = vi
  .fn<(input: { command: string; args: string[]; cwd: string }) => Promise<number>>()
  .mockResolvedValue(0);

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait,
  },
}));

const resolvePackageManager = vi.fn(() => 'npm');
vi.mock('@common/index', () => ({ resolvePackageManager }));

const getCurrentVersion = vi.fn(() => '0.4.28');
vi.mock('@cli/services/VersionChecker', () => ({
  VersionChecker: {
    getCurrentVersion,
  },
}));

const bundledGovernancePackageUrl = `file://${process.cwd()}/packages/governance/package.json`;

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GovernanceScaffolder patch coverage', () => {
  it('writes package.json updates and optional files without overwriting existing configs', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();

    const projectRoot = '/tmp/project';
    const pkgPath = `${projectRoot}/package.json`;

    existingFiles.add(pkgPath);
    // Make eslint config already exist so overwrite:false returns false
    existingFiles.add(`${projectRoot}/eslint.config.mjs`);

    writtenFiles.set(
      pkgPath,
      JSON.stringify({
        dependencies: {
          '@zintrust/core': '^1.2.3',
          other: 123,
        },
        scripts: {
          lint: 'custom-lint',
          'test:coverage': '',
        },
        devDependencies: {
          eslint: '',
        },
      })
    );

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const result = await GovernanceScaffolder.scaffold(projectRoot);

    expect(result.success).toBe(true);

    // eslint.config.mjs shouldn't be created since it already existed and overwrite=false
    expect(result.filesCreated.some((p) => p.endsWith('eslint.config.mjs'))).toBe(false);

    // arch tests should be created (createDirs: true)
    expect(result.filesCreated.some((p) => p.includes('ImportBoundaries.arch.test.ts'))).toBe(true);
    expect(
      result.filesCreated.some((p) => p.includes('RouteMiddlewareRegistry.arch.test.ts'))
    ).toBe(true);

    const updatedRaw = writtenFiles.get(pkgPath);
    expect(updatedRaw).toBeTruthy();
    const updated = JSON.parse(updatedRaw ?? '{}') as any;

    // scripts are upserted only if missing/empty
    expect(updated.scripts.lint).toBe('custom-lint');
    expect(updated.scripts['test:coverage']).toBe('vitest run --coverage');
    expect(updated.scripts.sonarqube).toContain('SonarQube not configured');

    // devDependencies ensured
    expect(updated.devDependencies.eslint).toBe('^9.0.0');
    expect(updated.devDependencies['@zintrust/governance']).toBe('^1.2.2');
  });

  it('writes eslint config that imports the governance eslint subpath', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();

    const projectRoot = '/tmp/project-eslint';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(pkgPath, JSON.stringify({}));

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');
    const result = await GovernanceScaffolder.scaffold(projectRoot, {
      writeArchTests: false,
    });

    expect(result.success).toBe(true);
    expect(writtenFiles.get(`${projectRoot}/eslint.config.mjs`)).toContain(
      "from '@zintrust/governance/eslint'"
    );
    expect(writtenFiles.get(`${projectRoot}/eslint.config.mjs`)).toContain(
      'enforcePathAliases: false'
    );
  });

  it('installs governance dependencies using resolved package manager', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();
    spawnAndWait.mockResolvedValue(0);

    resolvePackageManager.mockReturnValueOnce('yarn');

    const projectRoot = '/tmp/project';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(pkgPath, JSON.stringify({}));

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const result = await GovernanceScaffolder.scaffold(projectRoot, {
      install: true,
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(result.success).toBe(true);
    expect(spawnAndWait).toHaveBeenCalledWith({
      command: 'yarn',
      args: ['add', '--dev', 'eslint', '@zintrust/governance@^0.4.2'],
      cwd: projectRoot,
    });
  });

  it('returns a failure result when package.json is missing or invalid', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const missing = await GovernanceScaffolder.scaffold('/tmp/missing', {
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(missing.success).toBe(false);
    expect(missing.message).toContain('package.json not found');

    const projectRoot = '/tmp/invalid';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(pkgPath, JSON.stringify(null));

    const invalid = await GovernanceScaffolder.scaffold(projectRoot, {
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(invalid.success).toBe(false);
    expect(invalid.message).toContain('package.json is not a JSON object');
  });

  it('returns a failure result when install exits non-zero', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();
    spawnAndWait.mockResolvedValueOnce(1);

    const projectRoot = '/tmp/install-fail';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(pkgPath, JSON.stringify({}));

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const result = await GovernanceScaffolder.scaffold(projectRoot, {
      install: true,
      packageManager: 'pnpm',
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to install governance dependencies');
  });

  it('preserves an existing governance devDependency and falls back when bundled metadata is blank', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();

    const projectRoot = '/tmp/existing-governance';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(
      pkgPath,
      JSON.stringify({
        dependencies: {
          '@zintrust/core': '^1.2.3',
        },
        devDependencies: {
          '@zintrust/governance': '^9.9.9',
        },
      })
    );
    writtenFiles.set(bundledGovernancePackageUrl, JSON.stringify({ version: '' }));

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const result = await GovernanceScaffolder.scaffold(projectRoot, {
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(result.success).toBe(true);

    const updatedRaw = writtenFiles.get(pkgPath);
    expect(updatedRaw).toBeTruthy();
    const updated = JSON.parse(updatedRaw ?? '{}') as any;
    expect(updated.devDependencies['@zintrust/governance']).toBe('^9.9.9');
  });

  it('prefers the bundled governance version over deriving from core when bundled metadata is present', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();

    const projectRoot = '/tmp/bundled-governance-version';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(
      pkgPath,
      JSON.stringify({
        dependencies: {
          '@zintrust/core': '^1.2.3',
        },
      })
    );
    writtenFiles.set(bundledGovernancePackageUrl, JSON.stringify({ version: '1.9.4' }));

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const result = await GovernanceScaffolder.scaffold(projectRoot, {
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(result.success).toBe(true);

    const updatedRaw = writtenFiles.get(pkgPath);
    expect(updatedRaw).toBeTruthy();
    const updated = JSON.parse(updatedRaw ?? '{}') as any;
    expect(updated.devDependencies['@zintrust/governance']).toBe('^1.9.2');
  });

  it('falls back to the default governance range and npm install command when no versions are available', async () => {
    vi.resetModules();

    existingFiles.clear();
    writtenFiles.clear();
    spawnAndWait.mockResolvedValueOnce(0);
    resolvePackageManager.mockReturnValueOnce('npm');
    getCurrentVersion.mockReturnValueOnce('0.0.0');

    const projectRoot = '/tmp/fallback-governance';
    const pkgPath = `${projectRoot}/package.json`;
    existingFiles.add(pkgPath);
    writtenFiles.set(pkgPath, JSON.stringify({ devDependencies: {} }));
    writtenFiles.set(bundledGovernancePackageUrl, JSON.stringify({ version: '' }));

    const { GovernanceScaffolder } = await import('@cli/scaffolding/GovernanceScaffolder');

    const result = await GovernanceScaffolder.scaffold(projectRoot, {
      install: true,
      writeArchTests: false,
      writeEslintConfig: false,
    });

    expect(result.success).toBe(true);

    const updated = JSON.parse(writtenFiles.get(pkgPath) ?? '{}') as any;
    expect(updated.devDependencies['@zintrust/governance']).toBe('^0.4.0');
    expect(spawnAndWait).toHaveBeenCalledWith({
      command: 'npm',
      args: ['install', '--save-dev', 'eslint', '@zintrust/governance@^0.4.0'],
      cwd: projectRoot,
    });
  });
});
