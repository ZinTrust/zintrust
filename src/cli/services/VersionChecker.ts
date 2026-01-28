/**
 * VersionChecker - CLI Version Update Notification Service
 *
 * Checks if the current CLI version is outdated and warns users
 * when a newer version is available from npm registry.
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { HttpClient, type IHttpResponse } from '@httpClient/Http';
import { existsSync, readFileSync } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';

interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateAvailable: boolean;
}

interface VersionCheckConfig {
  enabled: boolean;
  checkInterval: number; // hours
  skipVersionCheck: boolean;
}

export const VersionChecker = Object.freeze({
  /**
   * Resolve the nearest package.json from a starting directory.
   */
  findNearestPackageJson(startDir: string): string | null {
    let current = startDir;
    for (let i = 0; i < 8; i++) {
      const candidate = join(current, 'package.json');
      if (existsSync(candidate)) return candidate;

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return null;
  },

  /**
   * Get current version from package.json
   */
  getCurrentVersion(): string {
    try {
      const moduleDir = dirname(fileURLToPath(import.meta.url));
      const modulePackagePath = this.findNearestPackageJson(moduleDir);
      const cwdPackagePath = this.findNearestPackageJson(process.cwd());
      const packagePath = modulePackagePath ?? cwdPackagePath;

      if (packagePath === null) return '0.0.0';

      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
        version?: string;
      };
      return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
    } catch {
      return '0.0.0';
    }
  },

  /**
   * Get version check configuration
   */
  getConfig(): VersionCheckConfig {
    return {
      enabled: process.env['ZINTRUST_VERSION_CHECK'] !== 'false',
      checkInterval: Number.parseInt(process.env['ZINTRUST_VERSION_CHECK_INTERVAL'] ?? '24', 10),
      skipVersionCheck: process.env['ZINTRUST_SKIP_VERSION_CHECK'] === 'true',
    };
  },

  /**
   * Check if version check should be performed
   */
  shouldCheckVersion(): boolean {
    const config = this.getConfig();

    // Skip if disabled
    if (!config.enabled || config.skipVersionCheck) {
      return false;
    }

    // Skip for version commands
    const args = new Set(process.argv.slice(2));
    if (args.has('-v') || args.has('--version') || args.has('help')) {
      return false;
    }

    // Check last check time
    const lastCheckKey = 'zintrust_last_version_check';
    const lastCheck = globalThis.localStorage?.getItem?.(lastCheckKey);

    if (lastCheck !== null && lastCheck !== undefined) {
      const lastCheckTime = Number.parseInt(lastCheck, 10);
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheckTime) / (1000 * 60 * 60);

      if (hoursSinceLastCheck < config.checkInterval) {
        return false;
      }
    }

    return true;
  },

  /**
   * Fetch latest version from npm registry
   */
  async fetchLatestVersion(): Promise<string> {
    try {
      const response = await this.fetchFromNpmRegistry();

      if (!response.ok) {
        return this.handleHttpError(response);
      }

      const data = await response.json();
      return this.extractVersionFromResponse(data);
    } catch (error) {
      // For network errors or other issues, don't block CLI usage
      Logger.debug('Failed to fetch latest version from npm registry', error);
      return this.getCurrentVersion();
    }
  },

  /**
   * Make request to npm registry
   */
  async fetchFromNpmRegistry(): Promise<IHttpResponse> {
    return HttpClient.get('https://registry.npmjs.org/@zintrust/core/latest')
      .withHeader('Accept', 'application/json')
      .withHeader('User-Agent', 'ZinTrust-CLI-Version-Check')
      .withTimeout(5000) // 5 second timeout
      .send();
  },

  /**
   * Handle HTTP errors from npm registry
   */
  handleHttpError(response: IHttpResponse): string {
    // If package doesn't exist (404), return current version
    if (response.status === 404) {
      Logger.debug('Package not found on npm registry, assuming development version');
      return this.getCurrentVersion();
    }

    throw ErrorFactory.createConfigError(`HTTP ${response.status}: Failed to fetch version`);
  },

  /**
   * Extract version from npm registry response
   */
  extractVersionFromResponse(data: unknown): string {
    if (!this.isValidResponseData(data)) {
      Logger.debug('Unexpected npm registry response structure, using current version');
      return this.getCurrentVersion();
    }

    const dataRecord = data;

    // Try to get version from dist-tags.latest (standard npm response)
    const latestVersion = this.getVersionFromDistTags(dataRecord);
    if (latestVersion !== null && latestVersion !== undefined && latestVersion !== '') {
      return latestVersion;
    }

    // Fallback to version field
    const fallbackVersion = this.getVersionFromField(dataRecord);
    if (fallbackVersion !== null && fallbackVersion !== undefined && fallbackVersion !== '') {
      return fallbackVersion;
    }

    // Final fallback
    Logger.debug('Could not extract version from response, using current version');
    return this.getCurrentVersion();
  },

  /**
   * Check if response data is valid object
   */
  isValidResponseData(data: unknown): data is Record<string, unknown> {
    return data !== null && data !== undefined && typeof data === 'object';
  },

  /**
   * Extract version from dist-tags
   */
  getVersionFromDistTags(dataRecord: Record<string, unknown>): string | null {
    const distTags = dataRecord['dist-tags'];
    if (distTags !== null && distTags !== undefined) {
      const distTagsRecord = distTags as Record<string, unknown>;
      const latest = distTagsRecord['latest'];
      if (typeof latest === 'string' && latest !== '') {
        return latest;
      }
    }
    return null;
  },

  /**
   * Extract version from version field
   */
  getVersionFromField(dataRecord: Record<string, unknown>): string | null {
    const version = dataRecord['version'];
    if (typeof version === 'string' && version !== '') {
      return version;
    }
    return null;
  },

  /**
   * Compare versions using semver-like comparison
   */
  compareVersions(current: string, latest: string): number {
    const cleanVersion = (version: string): string => {
      // Remove leading 'v' and trailing pre-release identifiers safely
      // Using specific patterns instead of greedy quantifiers to prevent ReDoS
      return version.replace(/^v/, '').replace(/-[^-]*$/, '');
    };

    const currentParts = cleanVersion(current).split('.').map(Number);
    const latestParts = cleanVersion(latest).split('.').map(Number);

    const maxLength = Math.max(currentParts.length, latestParts.length);

    for (let i = 0; i < maxLength; i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (currentPart < latestPart) return -1;
      if (currentPart > latestPart) return 1;
    }

    return 0;
  },

  /**
   * Perform version check and return result
   */
  async checkVersion(): Promise<VersionCheckResult | null> {
    if (!this.shouldCheckVersion()) {
      return null;
    }

    try {
      const currentVersion = this.getCurrentVersion();
      const latestVersion = await this.fetchLatestVersion();

      const comparison = this.compareVersions(currentVersion, latestVersion);
      const isOutdated = comparison < 0;
      const updateAvailable = isOutdated;

      // Update last check time
      const lastCheckKey = 'zintrust_last_version_check';
      globalThis.localStorage?.setItem?.(lastCheckKey, Date.now().toString());

      return {
        currentVersion,
        latestVersion,
        isOutdated,
        updateAvailable,
      };
    } catch (error) {
      // Silently fail - version check should never block CLI usage
      Logger.debug('Version check failed, continuing with CLI execution', error);
      return null;
    }
  },

  /**
   * Display update notification to user
   */
  displayUpdateNotification(result: VersionCheckResult): void {
    if (!result.updateAvailable) {
      return;
    }

    const { currentVersion, latestVersion } = result;

    // Use process.stdout.write for better control and to avoid eslint console errors
    const output = [
      '',
      '⚠️  Update Available',
      '┌' + '─'.repeat(50) + '┐',
      `│ Current:  ${currentVersion.padEnd(40)}│`,
      `│ Latest:   ${latestVersion.padEnd(40)}│`,
      '└' + '─'.repeat(50) + '┘',
      '',
      '💡 Update to get the latest features and bug fixes:',
      `   npm install -g @zintrust/core@${latestVersion}`,
      '   or: npx @zintrust/core@latest [command]',
      '',
      '🔧 To disable version checks:',
      '   export ZINTRUST_VERSION_CHECK=false',
      '',
    ].join('\n');

    process.stdout.write(output);
  },

  /**
   * Run version check and display notification if needed
   */
  async runVersionCheck(): Promise<void> {
    try {
      const result = await this.checkVersion();
      if (result) {
        this.displayUpdateNotification(result);
      }
    } catch (error) {
      // Version check should never crash the CLI
      Logger.debug('Version check encountered an error', error);
    }
  },
});
