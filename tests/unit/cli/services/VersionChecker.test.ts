/**
 * VersionChecker Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock HttpClient with factory function to avoid hoisting issues
vi.mock('@httpClient/Http', () => {
  const mockHttpClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    HttpClient: mockHttpClient,
  };
});

import { VersionChecker } from '@cli/services/VersionChecker';
import { HttpClient } from '@httpClient/Http';
const mockedHttpClient = vi.mocked(HttpClient);

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock process.env
const originalEnv = process.env;

describe('VersionChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getCurrentVersion', () => {
    it('should return version from package.json', () => {
      const result = VersionChecker.getCurrentVersion();
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = VersionChecker.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.checkInterval).toBe(24);
      expect(config.skipVersionCheck).toBe(false);
    });

    it('should respect environment variables', () => {
      process.env['ZINTRUST_VERSION_CHECK'] = 'false';
      process.env['ZINTRUST_VERSION_CHECK_INTERVAL'] = '12';
      process.env['ZINTRUST_SKIP_VERSION_CHECK'] = 'true';

      const config = VersionChecker.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.checkInterval).toBe(12);
      expect(config.skipVersionCheck).toBe(true);
    });
  });

  describe('shouldCheckVersion', () => {
    it('should return false when disabled', () => {
      process.env['ZINTRUST_VERSION_CHECK'] = 'false';
      expect(VersionChecker.shouldCheckVersion()).toBe(false);
    });

    it('should return false when skip is true', () => {
      process.env['ZINTRUST_SKIP_VERSION_CHECK'] = 'true';
      expect(VersionChecker.shouldCheckVersion()).toBe(false);
    });

    it('should return false for version commands', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'zintrust', '--version'];
      expect(VersionChecker.shouldCheckVersion()).toBe(false);

      process.argv = ['node', 'zintrust', '-v'];
      expect(VersionChecker.shouldCheckVersion()).toBe(false);

      process.argv = ['node', 'zintrust', 'help'];
      expect(VersionChecker.shouldCheckVersion()).toBe(false);

      process.argv = originalArgv;
    });

    it('should return true when conditions are met', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'zintrust', 'start'];
      expect(VersionChecker.shouldCheckVersion()).toBe(true);
      process.argv = originalArgv;
    });
  });

  describe('compareVersions', () => {
    it('should compare versions correctly', () => {
      expect(VersionChecker.compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(VersionChecker.compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(VersionChecker.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(VersionChecker.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(VersionChecker.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(VersionChecker.compareVersions('v1.0.0', '1.0.0')).toBe(0);
      expect(VersionChecker.compareVersions('1.0.0-alpha', '1.0.0')).toBe(0);
    });
  });

  describe('fetchLatestVersion', () => {
    it('should fetch latest version from npm registry', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {},
        body: JSON.stringify({
          'dist-tags': { latest: '1.2.3' },
          version: '1.2.3',
        }),
        json: vi.fn().mockReturnValue({
          'dist-tags': { latest: '1.2.3' },
          version: '1.2.3',
        }),
        text: vi.fn().mockReturnValue(
          JSON.stringify({
            'dist-tags': { latest: '1.2.3' },
            version: '1.2.3',
          })
        ),
      };

      mockedHttpClient.get.mockReturnValue({
        withHeader: vi.fn().mockReturnThis(),
        withHeaders: vi.fn().mockReturnThis(),
        withAuth: vi.fn().mockReturnThis(),
        withBasicAuth: vi.fn().mockReturnThis(),
        withTimeout: vi.fn().mockReturnThis(),
        asJson: vi.fn().mockReturnThis(),
        asForm: vi.fn().mockReturnThis(),
        send: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await VersionChecker.fetchLatestVersion();
      expect(result).toBe('1.2.3');
      expect(mockedHttpClient.get).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@zintrust/core/latest'
      );
    });

    it('should handle network errors gracefully', async () => {
      mockedHttpClient.get.mockReturnValue({
        withHeader: vi.fn().mockReturnThis(),
        withHeaders: vi.fn().mockReturnThis(),
        withAuth: vi.fn().mockReturnThis(),
        withBasicAuth: vi.fn().mockReturnThis(),
        withTimeout: vi.fn().mockReturnThis(),
        asJson: vi.fn().mockReturnThis(),
        asForm: vi.fn().mockReturnThis(),
        send: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      // Should return current version instead of throwing
      const result = await VersionChecker.fetchLatestVersion();
      expect(result).toBe('0.1.27'); // Current version from package.json
    });

    it('should return current version when npm returns 404', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: vi.fn(),
      };

      mockedHttpClient.get.mockReturnValue({
        withHeader: vi.fn().mockReturnThis(),
        withHeaders: vi.fn().mockReturnThis(),
        withAuth: vi.fn().mockReturnThis(),
        withBasicAuth: vi.fn().mockReturnThis(),
        withTimeout: vi.fn().mockReturnThis(),
        asJson: vi.fn().mockReturnThis(),
        asForm: vi.fn().mockReturnThis(),
        send: vi.fn().mockResolvedValue(mockResponse),
      });

      const currentVersionSpy = vi
        .spyOn(VersionChecker, 'getCurrentVersion')
        .mockReturnValue('0.0.0');

      const result = await VersionChecker.fetchLatestVersion();
      expect(result).toBe('0.0.0');
      expect(currentVersionSpy).toHaveBeenCalled();
      currentVersionSpy.mockRestore();
    });

    it('should return current version when npm returns non-404 error', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn(),
      };

      mockedHttpClient.get.mockReturnValue({
        withHeader: vi.fn().mockReturnThis(),
        withHeaders: vi.fn().mockReturnThis(),
        withAuth: vi.fn().mockReturnThis(),
        withBasicAuth: vi.fn().mockReturnThis(),
        withTimeout: vi.fn().mockReturnThis(),
        asJson: vi.fn().mockReturnThis(),
        asForm: vi.fn().mockReturnThis(),
        send: vi.fn().mockResolvedValue(mockResponse),
      });

      const currentVersionSpy = vi
        .spyOn(VersionChecker, 'getCurrentVersion')
        .mockReturnValue('0.0.0');

      const result = await VersionChecker.fetchLatestVersion();
      expect(result).toBe('0.0.0');
      expect(currentVersionSpy).toHaveBeenCalled();
      currentVersionSpy.mockRestore();
    });
  });

  describe('extractVersionFromResponse', () => {
    it('should return current version for invalid response data', () => {
      const currentVersionSpy = vi
        .spyOn(VersionChecker, 'getCurrentVersion')
        .mockReturnValue('0.0.0');

      const result = VersionChecker.extractVersionFromResponse(null);
      expect(result).toBe('0.0.0');
      expect(currentVersionSpy).toHaveBeenCalled();
      currentVersionSpy.mockRestore();
    });

    it('should fall back to version field when dist-tags are missing', () => {
      const result = VersionChecker.extractVersionFromResponse({
        version: '2.3.4',
      });
      expect(result).toBe('2.3.4');
    });

    it('should return current version when no usable version fields exist', () => {
      const currentVersionSpy = vi
        .spyOn(VersionChecker, 'getCurrentVersion')
        .mockReturnValue('0.0.0');

      const result = VersionChecker.extractVersionFromResponse({
        'dist-tags': { latest: '' },
        version: '',
      });
      expect(result).toBe('0.0.0');
      expect(currentVersionSpy).toHaveBeenCalled();
      currentVersionSpy.mockRestore();
    });
  });

  describe('getVersionFromField', () => {
    it('should return null when version is missing or empty', () => {
      expect(VersionChecker.getVersionFromField({})).toBeNull();
      expect(VersionChecker.getVersionFromField({ version: '' })).toBeNull();
      expect(VersionChecker.getVersionFromField({ version: 123 })).toBeNull();
    });
  });

  describe('checkVersion', () => {
    it('should return null when version check should not run', async () => {
      process.env['ZINTRUST_VERSION_CHECK'] = 'false';
      const result = await VersionChecker.checkVersion();
      expect(result).toBeNull();
    });

    it('should return version comparison result', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          'dist-tags': { latest: '1.2.3' },
          version: '1.2.3',
        }),
      };

      mockedHttpClient.get.mockReturnValue({
        withHeader: vi.fn().mockReturnThis(),
        withHeaders: vi.fn().mockReturnThis(),
        withAuth: vi.fn().mockReturnThis(),
        withBasicAuth: vi.fn().mockReturnThis(),
        withTimeout: vi.fn().mockReturnThis(),
        asJson: vi.fn().mockReturnThis(),
        asForm: vi.fn().mockReturnThis(),
        send: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await VersionChecker.checkVersion();
      expect(result).not.toBeNull();
      expect(result!.currentVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result!.latestVersion).toBe('1.2.3');
      expect(typeof result!.isOutdated).toBe('boolean');
      expect(typeof result!.updateAvailable).toBe('boolean');
    });
  });

  describe('displayUpdateNotification', () => {
    it('should not display notification when no update available', () => {
      const mockWrite = vi.fn();
      const originalStdoutWrite = process.stdout.write;
      process.stdout.write = mockWrite;

      VersionChecker.displayUpdateNotification({
        currentVersion: '1.2.3',
        latestVersion: '1.2.3',
        isOutdated: false,
        updateAvailable: false,
      });

      expect(mockWrite).not.toHaveBeenCalled();
      process.stdout.write = originalStdoutWrite;
    });

    it('should display notification when update available', () => {
      const mockWrite = vi.fn();
      const originalStdoutWrite = process.stdout.write;
      process.stdout.write = mockWrite;

      VersionChecker.displayUpdateNotification({
        currentVersion: '1.2.3',
        latestVersion: '1.2.4',
        isOutdated: true,
        updateAvailable: true,
      });

      expect(mockWrite).toHaveBeenCalled();
      const output = mockWrite.mock.calls[0][0];
      expect(output).toContain('Update Available');
      expect(output).toContain('Current:  1.2.3');
      expect(output).toContain('Latest:   1.2.4');
      expect(output).toContain('npm install -g @zintrust/core@1.2.4');

      process.stdout.write = originalStdoutWrite;
    });
  });

  describe('runVersionCheck', () => {
    it('should run version check without throwing errors', async () => {
      // Should not throw even if network fails
      mockedHttpClient.get.mockReturnValue({
        withHeader: vi.fn().mockReturnThis(),
        withHeaders: vi.fn().mockReturnThis(),
        withAuth: vi.fn().mockReturnThis(),
        withBasicAuth: vi.fn().mockReturnThis(),
        withTimeout: vi.fn().mockReturnThis(),
        asJson: vi.fn().mockReturnThis(),
        asForm: vi.fn().mockReturnThis(),
        send: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      await expect(VersionChecker.runVersionCheck()).resolves.toBeUndefined();
    });
  });
});
