import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');
const shimDir = path.join(repoRoot, 'tmp', 'release-core-shim');

const cliArgs = process.argv.slice(2);
const isDryRun = cliArgs.includes('--dry-run');
const continueOnError = cliArgs.includes('--continue-on-error');
const noFail = cliArgs.includes('--no-fail');
const onlyUnpublished = cliArgs.includes('--only-unpublished');
const verifyCoreOnNpm = cliArgs.includes('--verify-core-on-npm');
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

function installCoreShimIntoPackage(pkgDir) {
  run(
    'npm',
    ['install', '--no-save', '--no-package-lock', '--ignore-scripts', '--silent', shimDir],
    {
      cwd: pkgDir,
    }
  );
}

function buildPackage(pkgDir) {
  run('npm', ['run', 'build'], { cwd: pkgDir });
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

function isNpmNotFoundOutput(s) {
  const text = String(s ?? '');
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

function verifyCorePublishedOrThrow(coreVersion) {
  // Only useful for real publishing; dry-run can be used to validate packaging without network assumptions.
  if (isDryRun) return;
  const published = isPublishedOnNpm({ packageName: '@zintrust/core', version: coreVersion });
  if (!published) throw new Error(`@zintrust/core@${coreVersion} is not published on npm`);
}

async function writeFailureReport({ failures, successes, reportPath }) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    JSON.stringify({ failures, successes, total: successes.length + failures.length }, null, 2)
  );

  const lines = [
    `\n## Package publish failures\n`,
    `- Total attempted: ${successes.length + failures.length}\n`,
    `- Succeeded: ${successes.length}\n`,
    `- Failed: ${failures.length}\n\n`,
    `| Package | Version | Dir | Error |\n`,
    `|---|---:|---|---|\n`,
    ...failures.map(
      (f) => `| ${f.name} | ${f.version} | ${f.dirName} | ${flattenForTableCell(f.message)} |\n`
    ),
    `\nReport file: ${reportPath}\n`,
  ];
  await appendGithubStepSummary(lines.join(''));
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

  // Publish in a stable order.
  packageDirs.sort();
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
  failures.push({ dirName, name: pkg.name, version: pkg.version, message });
  emitGithubError(title, `${pkg.name}@${pkg.version} (${dirName}): ${message}`);
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
  if (pkg.version !== coreVersion)
    return {
      shouldSkip: true,
      skipMessage: `Skipping version mismatch: ${pkg.name}@${pkg.version} (expected ${coreVersion})`,
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

async function processPackageDir({ dirName, coreVersion, failures, successes, checkIssues }) {
  const pkgDir = path.join(packagesDir, dirName);
  const pkgJsonPath = path.join(pkgDir, 'package.json');

  const pkg = await loadPackageJson(pkgJsonPath);
  if (!pkg) return;

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

  announcePublishAttempt({ pkg, coreVersion });

  try {
    installCoreShimIntoPackage(pkgDir);
    buildPackage(pkgDir);
    publishPackage(pkgDir);
    successes.push({ dirName, name: pkg.name, version: pkg.version });
  } catch (err) {
    recordFailureAndMaybeThrow({ failures, dirName, pkg, err, title: 'Package publish failed' });
  }
}

async function publishAllPackages({ packageDirs, coreVersion }) {
  const failures = [];
  const successes = [];
  const checkIssues = [];

  try {
    // Create shim for @zintrust/core so packages can resolve it during build
    await createCoreShim();

    for (const dirName of packageDirs) {
      await processPackageDir({ dirName, coreVersion, failures, successes, checkIssues });
    }
  } finally {
    // Cleanup shim
    await fs.rm(shimDir, { recursive: true, force: true }).catch(() => {});
  }

  return { failures, successes, checkIssues };
}

async function createCoreShim() {
  await fs.mkdir(shimDir, { recursive: true });

  const pkgJson = {
    name: '@zintrust/core',
    version: '0.0.0',
    main: 'index.js',
    types: 'index.d.ts',
  };

  await fs.writeFile(path.join(shimDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // NOTE: This shim exists only so package builds can type-check against
  // '@zintrust/core' during release publishing without installing the real
  // package from npm. Keep it broad enough to cover package imports.
  const dts = `
export declare const Logger: any;
export declare const ErrorFactory: any;
export declare const Env: any;
export declare const DatabaseAdapterRegistry: any;
export declare const CacheDriverRegistry: any;
export declare const MailDriverRegistry: any;
export declare const FeatureFlags: any;
export declare const QueryBuilder: any;
export declare const Cloudflare: any;
export declare const Router: any;
export declare const Queue: any;
export declare const Broadcast: any;
export declare const Notification: any;
export declare const NodeSingletons: any;
export declare const RedisKeys: any;
export declare const MIME_TYPES: any;
export declare const appConfig: any;
export declare const databaseConfig: any;
export declare const queueConfig: any;
export declare const workersConfig: any;
export declare const ZintrustLang: any;
export declare const MigrationSchema: any;
export declare const SignedRequest: any;
export declare const JobStateTracker: any;
export declare const TimeoutManager: any;
export declare const CloudflareSocket: any;

export declare function generateUuid(): string;
export declare function generateSecureJobId(): string;
export declare function delay(ms: number): Promise<void>;
export declare function ensureDirSafe(path: string): Promise<void>;
export declare function resolveLockPrefix(): string;
export declare function getBullMQSafeQueueName(name?: string): string;
export declare function getValidatedBody(...args: any[]): any;
export declare function registerDatabasesFromRuntimeConfig(...args: any[]): any;
export declare function createBaseDrivers(...args: any[]): any;
export declare function createLockProvider(...args: any[]): any;
export declare function getLockProvider(...args: any[]): any;
export declare function registerLockProvider(...args: any[]): any;
export declare function createRedisConnection(...args: any[]): any;
export declare function useEnsureDbConnected(...args: any[]): any;

export declare const RedisQueue: any;
export type QueueMessage<T = unknown> = any;
export type BullMQPayload = any;

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
export type RouteOptions = any;
export type WorkerConfig = any;
export type WorkerStatus = any;
export type IDatabase = any;
export type Blueprint = any;
`;
  await fs.writeFile(path.join(shimDir, 'index.d.ts'), dts);

  const js = `
export const Logger = {};
export const ErrorFactory = {};
export const Env = {};
export const DatabaseAdapterRegistry = {};
export const CacheDriverRegistry = {};
export const MailDriverRegistry = {};
export const FeatureFlags = {};
export const QueryBuilder = {};
export const Cloudflare = {};
export const Router = {};
export const Queue = {};
export const Broadcast = {};
export const Notification = {};
export const NodeSingletons = {};
export const RedisKeys = {};
export const MIME_TYPES = {};
export const appConfig = {};
export const databaseConfig = {};
export const queueConfig = {};
export const workersConfig = {};
export const ZintrustLang = {};
export const MigrationSchema = {};
export const SignedRequest = {};
export const JobStateTracker = {};
export const TimeoutManager = {};
export const CloudflareSocket = {};

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

export function createRedisConnection() {
  return {};
}

export function useEnsureDbConnected() {
  return undefined;
}

export const RedisQueue = {};

export const S3Driver = {};
export const R2Driver = {};
export const GcsDriver = {};

export const SmtpDriver = {};
export const SendGridDriver = {};
export const MailgunDriver = {};
`;
  await fs.writeFile(path.join(shimDir, 'index.js'), js);
}

async function main() {
  removeDevRoutesForCiReleaseBuilds();

  const rootPkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = rootPkg.version;

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
