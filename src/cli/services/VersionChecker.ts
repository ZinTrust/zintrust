/**
 * VersionChecker - CLI Version Update Notification Service
 *
 * Checks if the current CLI version is outdated and warns users
 * when a newer version is available from npm registry.
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateAvailable: boolean;
}

interface NpmRegistryResponse {
  'dist-tags': {
    latest: string;
    [tag: string]: string;
  };
  version: string;
}

interface VersionCheckConfig {
  enabled: boolean;
  checkInterval: number; // hours
  skipVersionCheck: boolean;
}

export const VersionChecker = Object.freeze({
  /**
   * Get current version from package.json
   */
  getCurrentVersion(): string {
    try {
      const packagePath = join(process.cwd(), 'package.json');
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
      checkInterval: parseInt(process.env['ZINTRUST_VERSION_CHECK_INTERVAL'] ?? '24', 10),
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
    const args = process.argv.slice(2);
    if (args.includes('-v') || args.includes('--version') || args.includes('help')) {
      return false;
    }

    // Check last check time
    const lastCheckKey = 'zintrust_last_version_check';
    const lastCheck = globalThis.localStorage?.getItem?.(lastCheckKey);

    if (lastCheck !== null && lastCheck !== undefined) {
      const lastCheckTime = parseInt(lastCheck, 10);
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
      const response = await fetch('https://registry.npmjs.org/@zintrust/core/latest', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ZinTrust-CLI-Version-Check',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw ErrorFactory.createConfigError(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as NpmRegistryResponse;
      return data['dist-tags'].latest || data.version;
    } catch (error) {
      // Silently fail for network issues - don't block CLI usage
      Logger.debug('Failed to fetch latest version from npm registry', error);
      throw ErrorFactory.createConfigError('Failed to check for updates', error);
    }
  },

  /**
   * Compare versions using semver-like comparison
   */
  compareVersions(current: string, latest: string): number {
    const cleanVersion = (version: string): string => version.replace(/^v/, '').replace(/-.*$/, '');

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
