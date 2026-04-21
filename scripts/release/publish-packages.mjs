import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');
const shimDir = path.join(repoRoot, 'tmp', 'release-core-shim');
const builtLocalPackageDirs = new Set();
const publishedVersionCache = new Map();

const cliArgs = process.argv.slice(2);
const isDryRun = cliArgs.includes('--dry-run');
const continueOnError = cliArgs.includes('--continue-on-error');
const noFail = cliArgs.includes('--no-fail');
const onlyUnpublished = cliArgs.includes('--only-unpublished');
const verifyCoreOnNpm = cliArgs.includes('--verify-core-on-npm');
const showHelp = cliArgs.includes('--help') || cliArgs.includes('-h');
const showVersion = cliArgs.includes('--version') || cliArgs.includes('-v');
const isCi = process.env.CI === 'true' || process.env.CI === '1';

function getArgValue(flag) {
  const i = cliArgs.indexOf(flag);
  if (i === -1) return undefined;
  const v = cliArgs[i + 1];
  if (!v || v.startsWith('-')) return undefined;
  return v;
}

const npmTag = getArgValue('--tag');
const onlyDirsRaw = getArgValue('--only');
const reportFile =
  getArgValue('--report-file') ?? path.join(repoRoot, 'tmp', 'publish-packages-report.json');
const onlyDirs = onlyDirsRaw
  ? new Set(
      onlyDirsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : undefined;

const releasePublishPriority = Object.freeze({
  // workers must publish before trace because trace imports @zintrust/workers
  // at build time (dynamic import) and relies on workers' dist being present.
  workers: 5,
  'db-d1': 10,
  'db-mysql': 11,
  'db-postgres': 12,
  'db-sqlite': 13,
  'db-sqlserver': 14,
  'd1-migrator': 20,
});

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
  }
}

function runCapture(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    encoding: 'utf8',
    ...opts,
  });
}

function escapeGithubAnnotationValue(s) {
  return String(s).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function emitGithubError(title, message) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    process.stdout.write(
      `::error title=${escapeGithubAnnotationValue(title)}::${escapeGithubAnnotationValue(message)}\n`
    );
    return;
  }

  process.stderr.write(`[ERROR] ${title}: ${message}\n`);
}

async function appendGithubStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  await fs.appendFile(summaryPath, markdown);
}

function flattenForTableCell(value) {
  return String(value).replaceAll('\n', ' ');
}

function getLocalFileDependencyInstallTargets(pkgDir, pkg) {
  return Object.values(pkg.dependencies ?? {})
    .filter((spec) => typeof spec === 'string' && spec.startsWith('file:'))
    .map((spec) => path.resolve(pkgDir, spec.slice('file:'.length)));
}

async function getLocalFileDependencyVersion(pkgDir, dependencySpec) {
  if (typeof dependencySpec !== 'string' || !dependencySpec.startsWith('file:')) {
    return undefined;
  }

  const dependencyDir = path.resolve(pkgDir, dependencySpec.slice('file:'.length));
  const dependencyPkg = await loadPackageJson(path.join(dependencyDir, 'package.json'));
  return typeof dependencyPkg?.version === 'string' ? dependencyPkg.version : undefined;
}

async function buildLocalFileDependencies(pkgDir, pkg, coreVersion, buildStack = new Set()) {
  const dependencyDirs = getLocalFileDependencyInstallTargets(pkgDir, pkg);

  for (const dependencyDir of dependencyDirs) {
    if (builtLocalPackageDirs.has(dependencyDir)) continue;

    if (buildStack.has(dependencyDir)) {
      throw new Error(`Circular local package dependency detected: ${dependencyDir}`);
    }

    const dependencyPkgPath = path.join(dependencyDir, 'package.json');
    const dependencyPkg = await loadPackageJson(dependencyPkgPath);
    if (!dependencyPkg) continue;

    buildStack.add(dependencyDir);
    await buildLocalFileDependencies(dependencyDir, dependencyPkg, coreVersion, buildStack);
    installBuildDependenciesIntoPackage(dependencyDir, dependencyPkg);
    await installCoreShimIntoPackage(dependencyDir, coreVersion);

    if (dependencyPkg.scripts?.build) {
      buildPackage(dependencyDir);
    }

    builtLocalPackageDirs.add(dependencyDir);
    buildStack.delete(dependencyDir);
  }
}

function installBuildDependenciesIntoPackage(pkgDir, pkg) {
  const installTargets = getLocalFileDependencyInstallTargets(pkgDir, pkg);

  if (installTargets.length === 0) return;

  run(
    'npm',
    [
      'install',
      '--no-save',
      '--no-package-lock',
      '--ignore-scripts',
      '--silent',
      '--legacy-peer-deps',
      ...installTargets,
    ],
    {
      cwd: pkgDir,
    }
  );
}

async function installCoreShimIntoPackage(pkgDir, coreVersion) {
  await createCoreShim(coreVersion);
  const targetDir = path.join(pkgDir, 'node_modules', '@zintrust', 'core');
  await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(shimDir, targetDir, { recursive: true });
}

function printHelp() {
  process.stdout.write('Usage: node scripts/release/publish-packages.mjs [options]\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  --only <dir[,dir...]>       Publish only specific package directories\n');
  process.stdout.write('  --dry-run                   Build and pack without publishing to npm\n');
  process.stdout.write('  --tag <tag>                 Publish with a custom npm dist-tag\n');
  process.stdout.write('  --only-unpublished          Skip packages that already exist on npm\n');
  process.stdout.write(
    '  --verify-core-on-npm        Require the root core version to exist on npm first\n'
  );
  process.stdout.write('  --continue-on-error         Continue after a package publish failure\n');
  process.stdout.write(
    '  --no-fail                   Exit zero even when publish failures are reported\n'
  );
  process.stdout.write('  --report-file <path>        Write the publish report to a custom path\n');
  process.stdout.write('  --help, -h                  Show this help text and exit\n');
  process.stdout.write('  --version, -v               Print the root package version and exit\n');
}

function postProcessBuiltPackage(pkgDir) {
  const pkgDist = path.join(pkgDir, 'dist');

  run('node', [path.join(repoRoot, 'scripts/fix-dist-esm-imports.mjs'), pkgDist], {
    cwd: repoRoot,
  });
  run('node', [path.join(repoRoot, 'scripts/add-package-version-banner.mjs'), pkgDir], {
    cwd: repoRoot,
  });
  run('node', [path.join(repoRoot, 'scripts/replace-package-placeholders.mjs'), pkgDir], {
    cwd: repoRoot,
  });
  run('node', [path.join(repoRoot, 'scripts/generate-package-manifest.mjs'), pkgDir], {
    cwd: repoRoot,
  });
}

function buildPackage(pkgDir) {
  run('npm', ['run', 'build'], { cwd: pkgDir });
  postProcessBuiltPackage(pkgDir);
}

function publishPackage(pkgDir) {
  const publishArgs = ['publish', '--access', 'public'];
  if (npmTag) publishArgs.push('--tag', npmTag);
  if (isDryRun) publishArgs.push('--dry-run');
  run('npm', publishArgs, { cwd: pkgDir });
}

function removeDevRoutesForCiReleaseBuilds() {
  if (!isCi) return;
  run('node', ['scripts/toggle-dev-routes.mjs', 'remove'], { cwd: repoRoot });
}

async function assertCoreShimHasRequiredExports() {
  const requiredTokensByFile = {
    'index.d.ts': [
      'export declare function useDatabase(...args: any[]): IDatabase;',
      'export declare function isArray(value: unknown): value is unknown[];',
      'export declare function resolveDeduplicationLockKey(queueName: string, deduplicationId: string): string;',
      'export declare const NodeSingletons: {',
      'EventEmitter: any;',
      'randomBytes: (size: number) => any;',
      'createHash: (algorithm: string) => any;',
      'export type SocketAuthorizationContext = any;',
      'export type SocketAuthorizationDecision = any;',
      'export declare const SocketFeature: {',
      'export type SocketFeatureSettings = any;',
      'export type SocketNodeUpgradeInput = any;',
      'export type SocketPublishDecision = any;',
      'export type SocketPublishPolicy = any;',
      'export type SocketPublishPolicyHandler = any;',
      'export type SocketRouteRegistrar = any;',
      'export type SocketRuntimeDiagnostics = any;',
      'export type SocketRuntime = any;',
      'export type SocketWorkerContext = any;',
      'export declare const SocketRuntimeRegistry: {',
      'export declare const MultipartParserRegistry: any;',
      'export declare const LocalD1Resolver: {',
      'resolveD1Binding: (...args: any[]) => any;',
      'resolveLocalD1SqlitePath: (...args: any[]) => Promise<string>;',
      'export type UploadedFile = any;',
      'export type MultipartFieldValue = any;',
      'export type MultipartParseInput = any;',
      'export type MultipartParserProvider = any;',
      'export type ParsedMultipartData = any;',
      'export type WorkerAutoScalingConfig = any;',
      'export type WorkerComplianceConfig = any;',
      'export type WorkerCostConfig = any;',
      'export type WorkerObservabilityConfig = any;',
      'export type WorkerVersioningConfig = any;',
      'export type WorkersConfigOverrides = any;',
      'export type WorkersGlobalConfig = any;',
    ],
    'cli.d.ts': [
      'export declare const BaseCommand: any;',
      'export type CommandOptions = Record<string, unknown>;',
      'export declare const WorkerCommands: any;',
      'export declare const OptionalCliCommandRegistry: any;',
      'export type CliCommandProvider = any;',
    ],
    'proxy.d.ts': [
      'export declare const ErrorHandler: any;',
      'export declare const RequestValidator: any;',
      'export declare const SigningService: any;',
    ],
  };

  const missing = [];

  for (const [fileName, requiredTokens] of Object.entries(requiredTokensByFile)) {
    const dtsPath = path.join(shimDir, fileName);
    let dts;

    try {
      dts = await fs.readFile(dtsPath, 'utf8');
    } catch {
      missing.push(`${fileName} (missing file)`);
      continue;
    }

    for (const token of requiredTokens) {
      if (!dts.includes(token)) {
        missing.push(`${fileName}: ${token}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`release-core-shim is missing required exports/types: ${missing.join(', ')}`);
  }
}

function isNpmNotFoundOutput(s) {
  const text = String(s ?? '');
  if (text.trim() === '') return true;
  return text.includes('E404') || text.includes('404 Not Found') || text.includes('code E404');
}

function isPublishedOnNpm({ packageName, version }) {
  const result = runCapture('npm', ['view', `${packageName}@${version}`, 'version', '--silent']);
  if (result.status === 0) return true;

  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (isNpmNotFoundOutput(combined)) return false;

  // Unknown failure (network, auth, rate limit, etc).
  throw new Error(
    `npm view failed for ${packageName}@${version}: ${flattenForTableCell(combined).trim()}`
  );
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function createSameMinorRange(version) {
  const parsed = parseSemver(version);
  if (!parsed) return `^${version}`;

  return `>=${parsed.major}.${parsed.minor}.0 <${parsed.major}.${parsed.minor + 1}.0`;
}

function getPublishedCorePeerRange(coreVersion) {
  const publishedCoreVersion = getPublishedVersion('@zintrust/core');

  if (typeof publishedCoreVersion === 'string' && publishedCoreVersion.length > 0) {
    return createSameMinorRange(publishedCoreVersion);
  }

  if (typeof coreVersion === 'string' && coreVersion.length > 0) {
    return createSameMinorRange(coreVersion);
  }

  return '*';
}

function isPublishablePackageVersion(packageVersion, coreVersion) {
  const parsedPackageVersion = parseSemver(packageVersion);
  const parsedCoreVersion = parseSemver(coreVersion);

  if (!parsedPackageVersion || !parsedCoreVersion) {
    return packageVersion === coreVersion;
  }

  return (
    parsedPackageVersion.major === parsedCoreVersion.major &&
    parsedPackageVersion.minor === parsedCoreVersion.minor &&
    parsedPackageVersion.patch >= parsedCoreVersion.patch
  );
}

function getPublishedVersion(packageName) {
  if (publishedVersionCache.has(packageName)) {
    return publishedVersionCache.get(packageName);
  }

  const result = runCapture('npm', ['view', packageName, 'version', '--silent']);
  if (result.status === 0) {
    const version = String(result.stdout ?? '').trim();
    publishedVersionCache.set(packageName, version);
    return version;
  }

  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (isNpmNotFoundOutput(combined)) {
    publishedVersionCache.set(packageName, undefined);
    return undefined;
  }

  throw new Error(`npm view failed for ${packageName}: ${flattenForTableCell(combined).trim()}`);
}

function verifyCorePublishedOrThrow(coreVersion) {
  // Only useful for real publishing; dry-run can be used to validate packaging without network assumptions.
  if (isDryRun) return;
  const published = isPublishedOnNpm({ packageName: '@zintrust/core', version: coreVersion });
  if (!published) throw new Error(`@zintrust/core@${coreVersion} is not published on npm`);
}

async function writePublishReport({ failures, successes, checkIssues, reportPath }) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        failures,
        successes,
        checkIssues,
        total: successes.length + failures.length,
      },
      null,
      2
    )
  );

  const blocks = [];

  if (failures.length > 0) {
    blocks.push(
      `\n## Package publish failures\n` +
        `- Total attempted: ${successes.length + failures.length}\n` +
        `- Succeeded: ${successes.length}\n` +
        `- Failed: ${failures.length}\n\n` +
        `| Package | Version | Dir | Error |\n` +
        `|---|---:|---|---|\n` +
        failures
          .map(
            (f) =>
              `| ${f.name} | ${f.version} | ${f.dirName} | ${flattenForTableCell(f.message)} |\n`
          )
          .join('') +
        `\n`
    );
  }

  if (checkIssues.length > 0) {
    blocks.push(
      `\n## Publish check issues\n` +
        `These occurred while checking whether a package is already on npm (publish still attempted).\n\n` +
        `| Package | Version | Dir | Error |\n` +
        `|---|---:|---|---|\n` +
        checkIssues
          .map(
            (c) =>
              `| ${c.name} | ${c.version} | ${c.dirName} | ${flattenForTableCell(c.message)} |\n`
          )
          .join('') +
        `\n`
    );
  }

  blocks.push(`\nReport file: ${reportPath}\n`);
  await appendGithubStepSummary(blocks.join(''));
}

async function getPackageDirsToPublish() {
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  let packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (onlyDirs && onlyDirs.size > 0) {
    packageDirs = packageDirs.filter((d) => onlyDirs.has(d));
  }

  // Publish in a stable order, but keep adapter packages ahead of d1-migrator so
  // its rewritten npm dependencies never fall back to stale registry versions.
  packageDirs.sort((left, right) => {
    const leftPriority = releasePublishPriority[left] ?? 1000;
    const rightPriority = releasePublishPriority[right] ?? 1000;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right);
  });
  return packageDirs;
}

function shouldSkipForVersionMismatch({ packageName, packageVersion, coreVersion }) {
  if (packageVersion === coreVersion) return false;
  process.stdout.write(
    `Skipping version mismatch: ${packageName}@${packageVersion} (expected ${coreVersion})\n`
  );
  return true;
}

function shouldSkipBecauseAlreadyPublished({ packageName, version }) {
  if (!onlyUnpublished) return false;
  if (isPublishedOnNpm({ packageName, version })) {
    process.stdout.write(`Skipping already published: ${packageName}@${version}\n`);
    return true;
  }
  return false;
}

function recordFailureAndMaybeThrow({ failures, dirName, pkg, err, title }) {
  const message = err instanceof Error ? err.message : String(err);
  const packageName = pkg?.name ?? dirName;
  const packageVersion = pkg?.version ?? 'unknown';
  failures.push({ dirName, name: packageName, version: packageVersion, message });
  emitGithubError(title, `${packageName}@${packageVersion} (${dirName}): ${message}`);
  if (!continueOnError) throw err;
}

function announcePublishAttempt({ pkg, coreVersion }) {
  process.stdout.write(
    `\n=== ${isDryRun ? 'Dry-run publishing' : 'Publishing'} ${pkg.name}@${pkg.version} (core ${coreVersion}) ===\n`
  );
}

async function loadPackageJson(pkgJsonPath) {
  try {
    return JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
  } catch {
    return undefined;
  }
}

function evaluateEligibility({ pkg, coreVersion }) {
  if (pkg.private === true)
    return { shouldSkip: true, skipMessage: `Skipping private package: ${pkg.name}` };
  if (!isPublishablePackageVersion(pkg.version, coreVersion))
    return {
      shouldSkip: true,
      skipMessage: `Skipping version mismatch: ${pkg.name}@${pkg.version} (expected release line ${coreVersion})`,
    };
  return { shouldSkip: false };
}

function maybeSkipBecausePublished({ pkg }) {
  if (!onlyUnpublished) return { shouldSkip: false };
  try {
    const shouldSkip = shouldSkipBecauseAlreadyPublished({
      packageName: pkg.name,
      version: pkg.version,
    });
    return { shouldSkip };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      shouldSkip: false,
      checkIssue: { name: pkg.name, version: pkg.version, message },
    };
  }
}

async function transformPackageForPublish(pkg, pkgDir, coreVersion) {
  const transformed = { ...pkg };

  if (typeof transformed.peerDependencies?.['@zintrust/core'] === 'string') {
    transformed.peerDependencies = {
      ...transformed.peerDependencies,
      '@zintrust/core': getPublishedCorePeerRange(coreVersion),
    };
  }

  // d1-migrator builds against local file: adapters, then publishes with live adapter versions.
  if (transformed.name === '@zintrust/d1-migrator' && transformed.dependencies) {
    transformed.dependencies = { ...transformed.dependencies };

    const fileDeps = [
      '@zintrust/db-mysql',
      '@zintrust/db-postgres',
      '@zintrust/db-sqlite',
      '@zintrust/db-sqlserver',
      '@zintrust/db-d1',
    ];

    for (const dep of fileDeps) {
      if (!transformed.dependencies[dep]?.startsWith('file:')) {
        continue;
      }

      const expectedVersion = await getLocalFileDependencyVersion(
        pkgDir,
        transformed.dependencies[dep]
      );
      if (typeof expectedVersion !== 'string' || expectedVersion.length === 0) {
        throw new Error(
          `Unable to resolve publish version for ${dep} from ${transformed.dependencies[dep]}`
        );
      }

      const publishedExpectedVersion = isPublishedOnNpm({
        packageName: dep,
        version: expectedVersion,
      });

      if (!publishedExpectedVersion) {
        const latestPublishedVersion = getPublishedVersion(dep);
        throw new Error(
          `${dep}@${expectedVersion} is not published on npm; refusing to rewrite d1-migrator to stale ${latestPublishedVersion ?? 'unpublished'} metadata`
        );
      }

      transformed.dependencies[dep] = expectedVersion;
    }
  }

  return transformed;
}

async function processPackageDir({ dirName, coreVersion, failures, successes, checkIssues }) {
  const pkgDir = path.join(packagesDir, dirName);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  const originalPkgText = await fs.readFile(pkgJsonPath, 'utf8');

  const pkg = JSON.parse(originalPkgText);

  const eligibility = evaluateEligibility({ pkg, coreVersion });
  if (eligibility.shouldSkip) {
    process.stdout.write(`${eligibility.skipMessage}\n`);
    return;
  }

  const publishedCheck = maybeSkipBecausePublished({ pkg });
  if (publishedCheck.checkIssue) {
    checkIssues.push({ dirName, ...publishedCheck.checkIssue });
    emitGithubError(
      'Publish check failed',
      `${pkg.name}@${pkg.version} (${dirName}): ${publishedCheck.checkIssue.message}`
    );
    if (!continueOnError) throw new Error(publishedCheck.checkIssue.message);
  }
  if (publishedCheck.shouldSkip) return;

  let publishPkg = pkg;
  let publishPkgText = originalPkgText;

  announcePublishAttempt({ pkg, coreVersion });

  try {
    publishPkg = await transformPackageForPublish(pkg, pkgDir, coreVersion);
    publishPkgText = JSON.stringify(publishPkg, null, 2);

    await buildLocalFileDependencies(pkgDir, pkg, coreVersion);
    installBuildDependenciesIntoPackage(pkgDir, pkg);
    await installCoreShimIntoPackage(pkgDir, coreVersion);
    buildPackage(pkgDir);

    // d1-migrator builds against local file: adapters, then publishes with semver deps.
    if (publishPkgText !== originalPkgText) {
      await fs.writeFile(pkgJsonPath, publishPkgText);
    }

    publishPackage(pkgDir);
    successes.push({ dirName, name: publishPkg.name, version: publishPkg.version });
  } catch (err) {
    recordFailureAndMaybeThrow({
      failures,
      dirName,
      pkg: publishPkg,
      err,
      title: 'Package publish failed',
    });
  } finally {
    if (publishPkgText !== originalPkgText) {
      await fs.writeFile(pkgJsonPath, originalPkgText);
    }
  }
}

async function publishAllPackages({ packageDirs, coreVersion }) {
  const failures = [];
  const successes = [];
  const checkIssues = [];

  try {
    // Create shim for @zintrust/core so packages can resolve it during build
    await createCoreShim(coreVersion);
    await assertCoreShimHasRequiredExports();

    for (const dirName of packageDirs) {
      await processPackageDir({ dirName, coreVersion, failures, successes, checkIssues });
    }
  } finally {
    // Cleanup shim
    await fs.rm(shimDir, { recursive: true, force: true }).catch(() => {});
  }

  return { failures, successes, checkIssues };
}

async function createCoreShim(coreVersion) {
  await fs.mkdir(shimDir, { recursive: true });

  const pkgJson = {
    name: '@zintrust/core',
    version: coreVersion,
    type: 'module',
    main: 'index.js',
    types: 'index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
      },
      './cli': {
        types: './cli.d.ts',
        import: './cli.js',
      },
      './proxy': {
        types: './proxy.d.ts',
        import: './proxy.js',
      },
      './package.json': './package.json',
    },
  };

  await fs.writeFile(path.join(shimDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // NOTE: This shim exists only so package builds can type-check against
  // '@zintrust/core' during release publishing without installing the real
  // package from npm. Keep it broad enough to cover package imports and
  // public subpaths used by packages in this repo.
  const dts = `
export declare const Logger: any;
export declare const ErrorFactory: any;
export declare const Env: any;
export declare const DatabaseAdapterRegistry: any;
export declare const DatabaseConnectionRegistry: any;
export declare const CacheDriverRegistry: any;
export declare const MailDriverRegistry: any;
export declare const FeatureFlags: any;
export declare const QueryBuilder: any;
export declare const BaseAdapter: {
  normalizeReadValue: (value: unknown) => unknown;
  normalizeRow: (row: Record<string, unknown>) => Record<string, unknown>;
  normalizeRows: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  normalizeQueryResult: <T extends { rows: Record<string, unknown>[] }>(result: T) => T;
};
export declare const Cloudflare: any;
export declare const Router: any;
export declare const Broadcast: any;
export declare const Notification: any;
export declare const NodeSingletons: {
  fs: any;
  path: any;
  os: any;
  url: any;
  module: any;
  process: any;
  EventEmitter: any;
  createCipheriv: (...args: any[]) => any;
  createDecipheriv: (...args: any[]) => any;
  pbkdf2Sync: (...args: any[]) => any;
  randomBytes: (size: number) => any;
  createHash: (algorithm: string) => any;
  [key: string]: any;
};
export declare const RedisKeys: any;
export declare const MIME_TYPES: any;
export declare const appConfig: any;
export declare const broadcastConfig: any;
export declare const databaseConfig: any;
export declare const middlewareConfig: any;
export declare const queueConfig: any;
export declare const workersConfig: any;
export declare const ZintrustLang: any;
export declare const MigrationSchema: any;
export declare const SignedRequest: any;
export declare const JobStateTracker: any;
export declare const TimeoutManager: any;
export declare const CloudflareSocket: any;
export declare const MultipartParserRegistry: any;
export declare const LocalD1Resolver: {
  resolveD1Binding: (...args: any[]) => any;
  resolveLocalD1SqlitePath: (...args: any[]) => Promise<string>;
};
export declare const WranglerConfig: any;

export declare function generateUuid(): string;
export declare function generateSecureJobId(): string;
export declare function delay(ms: number): Promise<void>;
export declare function ensureDirSafe(path: string): Promise<void>;
export declare function resolveLockPrefix(): string;
export declare function getBullMQSafeQueueName(name?: string): string;
export declare function getValidatedBody<T = unknown>(...args: any[]): T | undefined;
export declare function registerDatabasesFromRuntimeConfig(...args: any[]): any;
export declare function createBaseDrivers(...args: any[]): any;
export declare function createLockProvider(...args: any[]): any;
export declare function getLockProvider(...args: any[]): any;
export declare function registerLockProvider(...args: any[]): any;
export declare function useDatabase(...args: any[]): IDatabase;
export declare function resolveDeduplicationLockKey(queueName: string, deduplicationId: string): string;
export declare function createRedisConnection(...args: any[]): {
  hgetall: (...args: any[]) => Promise<Record<string, string>>;
  hget: (...args: any[]) => Promise<string | null>;
  hset: (...args: any[]) => Promise<any>;
  hmget: (...args: any[]) => Promise<Array<string | null>>;
  hdel: (...args: any[]) => Promise<any>;
  disconnect: () => void;
  [key: string]: any;
};
export declare function useEnsureDbConnected(...args: any[]): any;
export declare function isArray(value: unknown): value is unknown[];
export declare function isFunction(value: unknown): value is (...args: any[]) => any;
export declare function isNonEmptyString(value: unknown): value is string;
export declare function isObject(value: unknown): value is Record<string, unknown>;
export type SocketAuthorizationDecision = any;
export declare const SocketFeature: {
  getSettings: (...args: any[]) => SocketFeatureSettings;
};
export declare const SocketRuntimeRegistry: {
  registerRuntime: (...args: any[]) => void;
  getRuntime: (...args: any[]) => SocketRuntime | undefined;
  registerRoutes: (...args: any[]) => void;
  getRouteRegistrar: (...args: any[]) => SocketRouteRegistrar | undefined;
  getDiagnostics: (...args: any[]) => any;
  reset: (...args: any[]) => void;
};

export declare const RedisQueue: any;
export type QueueMessage<T = unknown> = any;
export type BullMQPayload = any;
export type QueueApi = {
  dequeue<T = unknown>(...args: any[]): Promise<QueueMessage<T> | null>;
  [key: string]: any;
};
export declare const Queue: QueueApi;

export declare const S3Driver: any;
export type S3Config = any;
export declare const R2Driver: any;
export type R2Config = any;
export declare const GcsDriver: any;
export type GcsConfig = any;

export declare const SmtpDriver: any;
export type SmtpDriverConfig = any;
export declare const SendGridDriver: any;
export type SendGridConfig = any;
export type SendGridMailAddress = any;
export type SendGridMailAttachment = any;
export type SendGridMailMessage = any;
export type SendGridSendResult = any;
export declare const MailgunDriver: any;
export type MailgunConfig = any;
export type MailgunMessage = any;
export type MailgunResult = any;

export type RedisConfig = any;
export type IRouter = any;
export type IRequest = any;
export type IResponse = any;
export type SocketAuthorizationContext = any;
export type SocketAuthorizer = any;
export type SocketAuthorizerHandler = any;
export type SocketFeatureSettings = any;
export type SocketNodeUpgradeInput = any;
export type SocketPublishDecision = any;
export type SocketPublishPolicy = any;
export type SocketPublishPolicyHandler = any;
export type SocketRouteRegistrar = any;
export type SocketRuntimeDiagnostics = any;
export type SocketRuntime = any;
export type SocketWorkerContext = any;
export type AssetsBinding = any;
export type UploadedFile = any;
export type MultipartFieldValue = any;
export type MultipartParseInput = any;
export type MultipartParserProvider = any;
export type ParsedMultipartData = any;
export type RouteOptions = any;
export type WorkerConfig = any;
export type WorkerAutoScalingConfig = any;
export type WorkerComplianceConfig = any;
export type WorkerCostConfig = any;
export type WorkerObservabilityConfig = any;
export type WorkerStatus = any;
export type WorkerVersioningConfig = any;
export type WorkersConfigOverrides = any;
export type WorkersGlobalConfig = any;
export type DbQueryBuilder = {
  limit(...args: any[]): DbQueryBuilder;
  offset(...args: any[]): DbQueryBuilder;
  where(...args: any[]): DbQueryBuilder;
  whereIn(...args: any[]): DbQueryBuilder;
  get<T = unknown>(): Promise<T[]>;
  first<T = unknown>(): Promise<T | undefined>;
  insert(...args: any[]): Promise<any>;
  update(...args: any[]): Promise<any>;
  delete(...args: any[]): Promise<any>;
};
export type IDatabase = {
  connect: (...args: any[]) => Promise<void>;
  disconnect: (...args: any[]) => Promise<void>;
  isConnected: (...args: any[]) => boolean;
  query: (...args: any[]) => Promise<any[]>;
  queryOne: (...args: any[]) => Promise<any>;
  execute: (...args: any[]) => Promise<any>;
  table: (...args: any[]) => DbQueryBuilder;
};
export type Blueprint = any;
`;
  await fs.writeFile(path.join(shimDir, 'index.d.ts'), dts);

  const cliDts = `
export declare const BaseCommand: any;
export type CommandOptions = Record<string, unknown>;
export declare const CLI: any;
export declare const ErrorHandler: any;
export declare const EXIT_CODES: any;
export declare const WorkerCommands: any;
export declare const OptionalCliCommandRegistry: any;
export type CliCommandProvider = any;
`;
  await fs.writeFile(path.join(shimDir, 'cli.d.ts'), cliDts);

  const proxyDts = `
export declare const ErrorHandler: any;
export declare const RequestValidator: any;
export declare const SigningService: any;
`;
  await fs.writeFile(path.join(shimDir, 'proxy.d.ts'), proxyDts);

  const js = `
export const Logger = {};
export const ErrorFactory = {};
export const Env = {};
export const DatabaseAdapterRegistry = {};
export const CacheDriverRegistry = {};
export const MailDriverRegistry = {};
export const FeatureFlags = {};
export const QueryBuilder = {};
export const BaseAdapter = {
  normalizeReadValue(value) {
    if (typeof value !== 'string') return value;
    return value.trim().toLowerCase() === 'null' ? null : value;
  },
  normalizeRow(row) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, BaseAdapter.normalizeReadValue(value)])
    );
  },
  normalizeRows(rows) {
    return rows.map((row) => BaseAdapter.normalizeRow(row));
  },
  normalizeQueryResult(result) {
    return {
      ...result,
      rows: BaseAdapter.normalizeRows(result.rows),
    };
  },
};
export const Cloudflare = {};
export const Router = {};
export const Broadcast = {};
export const Notification = {};
export const NodeSingletons = {
  fs: {},
  path: {},
  os: {},
  url: {
    pathToFileURL() {
      return { href: '' };
    },
    fileURLToPath() {
      return '';
    },
  },
  module: {
    createRequire() {
      return () => undefined;
    },
  },
  process: {
    cwd() {
      return '';
    },
  },
  EventEmitter: class {
    on() {
      return this;
    }
    off() {
      return this;
    }
    emit() {
      return false;
    }
    listenerCount() {
      return 0;
    }
    setMaxListeners() {
      return this;
    }
  },
  randomBytes() {
    return { toString() { return ''; } };
  },
  createCipheriv() {
    return { update() { return ''; }, final() { return ''; } };
  },
  createDecipheriv() {
    return { update() { return ''; }, final() { return ''; } };
  },
  pbkdf2Sync() {
    return '';
  },
  createHash() {
    return { update() { return this; }, digest() { return ''; } };
  },
};
export const RedisKeys = {};
export const MIME_TYPES = {};
export const appConfig = {};
export const broadcastConfig = {
  socket: {
    authorize: undefined,
    publish: undefined,
    authMiddleware: [],
    allowAuthRouteOverride: false,
  },
};
export const databaseConfig = {};
export const middlewareConfig = {
  route: {},
};
export const queueConfig = {};
export const workersConfig = {};
export const ZintrustLang = {};
export const MigrationSchema = {};
export const SignedRequest = {};
export const JobStateTracker = {};
export const TimeoutManager = {};
export const CloudflareSocket = {};
export const MultipartParserRegistry = {};
export const LocalD1Resolver = {
  resolveD1Binding() {
    return {};
  },
  async resolveLocalD1SqlitePath() {
    return '';
  },
};
export const WranglerConfig = {};

export function generateUuid() {
  return '00000000-0000-0000-0000-000000000000';
}

export function generateSecureJobId() {
  return 'job_00000000';
}

export async function delay(_ms) {
  return undefined;
}

export async function ensureDirSafe(_path) {
  return undefined;
}

export function resolveLockPrefix() {
  return '';
}

export function getBullMQSafeQueueName(name = '') {
  return name;
}

export function getValidatedBody() {
  return undefined;
}

export function registerDatabasesFromRuntimeConfig() {
  return undefined;
}

export function createBaseDrivers() {
  return {};
}

export function createLockProvider() {
  return {};
}

export function getLockProvider() {
  return {};
}

export function registerLockProvider() {
  return {};
}

export function useDatabase() {
  return {
    async connect() {},
    async disconnect() {},
    isConnected() {
      return true;
    },
    async query() {
      return [];
    },
    async queryOne() {
      return undefined;
    },
    async execute() {
      return undefined;
    },
    table() {
      return {
        limit() {
          return this;
        },
        offset() {
          return this;
        },
        where() {
          return this;
        },
        whereIn() {
          return this;
        },
        async get() {
          return [];
        },
        async first() {
          return undefined;
        },
        async insert() {
          return undefined;
        },
        async update() {
          return undefined;
        },
        async delete() {
          return undefined;
        },
      };
    },
  };
}

export function createRedisConnection() {
  return {
    async hgetall() {
      return {};
    },
    async hget() {
      return null;
    },
    async hset() {
      return undefined;
    },
    async hmget() {
      return [];
    },
    async hdel() {
      return undefined;
    },
    disconnect() {},
  };
}

export function useEnsureDbConnected() {
  return undefined;
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isFunction(value) {
  return typeof value === 'function';
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function isObject(value) {
  return value !== null && typeof value === 'object';
}

export function resolveDeduplicationLockKey(queueName, deduplicationId) {
  return 'queue:' + String(queueName) + ':' + String(deduplicationId);
}

export const SocketFeature = {
  getSettings() {
    return {
      enabled: false,
      transport: 'auto',
      path: '/app',
      appId: 'local',
      appKey: '',
      secret: '',
      activityTimeout: 120,
    };
  },
};

export const SocketRuntimeRegistry = {
  registerRuntime() {},
  getRuntime() {
    return undefined;
  },
  registerRoutes() {},
  getRouteRegistrar() {
    return undefined;
  },
  getDiagnostics() {
    return null;
  },
  reset() {},
};

export const Queue = {
  async dequeue() {
    return null;
  },
};

export const RedisQueue = {};

export const S3Driver = {};
export const R2Driver = {};
export const GcsDriver = {};

export const SmtpDriver = {};
export const SendGridDriver = {};
export const MailgunDriver = {};
`;
  await fs.writeFile(path.join(shimDir, 'index.js'), js);

  const cliJs = `
const createCommand = () => ({});
const createProvider = () => ({
  getCommand() {
    return createCommand();
  },
});

export const BaseCommand = {
  create(config = {}) {
    return {
      ...config,
      getCommand() {
        return createCommand();
      },
      info() {},
      success() {},
      warn() {},
      debug() {},
    };
  },
};

export const CLI = {};
export const ErrorHandler = {};
export const EXIT_CODES = {};
export const WorkerCommands = {
  createWorkerListCommand: createProvider,
  createWorkerStatusCommand: createProvider,
  createWorkerStartCommand: createProvider,
  createWorkerStartAllCommand: createProvider,
  createWorkerStopCommand: createProvider,
  createWorkerRestartCommand: createProvider,
  createWorkerSummaryCommand: createProvider,
};
export const OptionalCliCommandRegistry = {
  register() {},
  get() {
    return undefined;
  },
  has() {
    return false;
  },
  list() {
    return [];
  },
};
`;
  await fs.writeFile(path.join(shimDir, 'cli.js'), cliJs);

  const proxyJs = `
export const ErrorHandler = {
  toProxyError(status = 500, code = 'proxy_error', message = 'Proxy error') {
    return {
      status,
      body: { code, message },
    };
  },
};

export const RequestValidator = {
  parseJson(value) {
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: true, value: undefined };
    }

    try {
      return { ok: true, value: JSON.parse(value) };
    } catch (error) {
      return { ok: false, error };
    }
  },
  requirePost(method) {
    return method === 'POST' ? undefined : { status: 405 };
  },
};

export const SigningService = {
  async verifyWithKeyProvider() {
    return { ok: true };
  },
};
`;
  await fs.writeFile(path.join(shimDir, 'proxy.js'), proxyJs);
}

async function main() {
  const rootPkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = rootPkg.version;

  if (showVersion) {
    process.stdout.write(`${version}\n`);
    return;
  }

  if (showHelp) {
    printHelp();
    return;
  }

  removeDevRoutesForCiReleaseBuilds();

  if (verifyCoreOnNpm || onlyUnpublished) {
    verifyCorePublishedOrThrow(version);
  }

  const packageDirs = await getPackageDirsToPublish();
  const { failures, successes, checkIssues } = await publishAllPackages({
    packageDirs,
    coreVersion: version,
  });

  if (failures.length > 0 || checkIssues.length > 0) {
    await writePublishReport({ failures, successes, checkIssues, reportPath: reportFile });

    process.stderr.write(`\nPublish report written to: ${reportFile}\n`);
    if (!noFail) process.exitCode = 1;
  }
}

await main();
