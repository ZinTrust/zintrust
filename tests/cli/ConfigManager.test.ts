/**
 * ConfigManager Tests
 */

import { DEFAULT_CONFIG } from '@cli/config/ConfigSchema';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let testConfigPath = path.join(process.cwd(), 'tests/tmp/test-config-manager.json');

async function createTestManager() {
  // Other test files sometimes mock '@node-singletons/fs'. The patch-coverage script
  // runs Vitest with coverage enabled, which can change worker scheduling and expose
  // cross-file mock leakage. Force the real fs wrapper for this file.
  vi.resetModules();
  vi.doUnmock('node:fs');
  vi.doUnmock('node:fs/promises');
  vi.doUnmock('@node-singletons/fs');
  vi.doUnmock('@node-singletons/path');
  const { ConfigManager } = await import('@cli/config/ConfigManager');
  return ConfigManager.create(testConfigPath);
}

describe('ConfigManager Basic Operations', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    testConfigPath = path.join(
      process.cwd(),
      'tests/tmp',
      `test-config-manager-${process.pid}-${randomUUID()}.json`
    );

    // Clean up any existing test file
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should load default config when file does not exist', async () => {
    const manager = await createTestManager();
    const config = await manager.load();

    expect(config).toBeDefined();
    expect(config.name).toBe(DEFAULT_CONFIG.name);
    expect(config.server.port).toBe(DEFAULT_CONFIG.server.port);
  });

  it('should save config to file', async () => {
    const manager = await createTestManager();
    const config = await manager.load();

    config.name = 'test-app';
    await manager.save(config);

    // Verify file was created
    const exists = await manager.exists();
    expect(exists).toBe(true);

    // Verify content
    const content = await fs.readFile(testConfigPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe('test-app');
  });

  it('should get config value', async () => {
    const manager = await createTestManager();
    await manager.load();

    const port = manager.get('server.port');
    expect(port).toBe(7777);
  });

  it('should set config value', async () => {
    const manager = await createTestManager();
    await manager.load();

    manager.set('server.port', 3001);
    expect(manager.get('server.port')).toBe(3001);
  });

  it('should set nested config values', async () => {
    const manager = await createTestManager();
    await manager.load();

    manager.set('database.host', 'localhost');
    expect(manager.get('database.host')).toBe('localhost');
  });
});

describe('ConfigManager Advanced Operations', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    testConfigPath = path.join(
      process.cwd(),
      'tests/tmp',
      `test-config-manager-${process.pid}-${randomUUID()}.json`
    );

    // Clean up any existing test file
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should merge partial config', async () => {
    const manager = await createTestManager();
    await manager.load();

    manager.merge({
      name: 'merged-app',
      server: {
        port: 4000,
        host: 'localhost',
        environment: 'development',
        debug: false,
        profiling: false,
        tracing: false,
      },
    });

    expect(manager.get('name')).toBe('merged-app');
    expect(manager.get('server.port')).toBe(4000);
  });

  it('should reset to default config', async () => {
    const manager = await createTestManager();
    const config = await manager.load();

    config.name = 'changed-app';
    await manager.save(config);

    await manager.reset();
    expect(manager.get('name')).toBe(DEFAULT_CONFIG.name);
  });
});

describe('ConfigManager Persistence', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    testConfigPath = path.join(
      process.cwd(),
      'tests/tmp',
      `test-config-manager-${process.pid}-${randomUUID()}.json`
    );

    // Clean up any existing test file
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should create default config', async () => {
    const manager = await createTestManager();
    await manager.create({ name: 'initial-app' });

    const exists = await manager.exists();
    expect(exists).toBe(true);

    const config = manager.getConfig();
    expect(config.name).toBe('initial-app');
  });

  it('should persist changes across save and load', async () => {
    let manager = await createTestManager();
    await manager.load();

    manager.set('server.port', 5000);
    await manager.save();

    // Sanity-check the persisted value is actually written to disk.
    const persisted = JSON.parse(await fs.readFile(testConfigPath, 'utf-8')) as {
      server?: { port?: number };
    };
    expect(persisted.server?.port).toBe(5000);

    // Create new manager instance and load
    manager = await createTestManager();
    await manager.load();

    expect(manager.get('server.port')).toBe(5000);
  });
});

describe('ConfigManager Export and Keys', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    testConfigPath = path.join(
      process.cwd(),
      'tests/tmp',
      `test-config-manager-${process.pid}-${randomUUID()}.json`
    );

    // Clean up any existing test file
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should export config as JSON', async () => {
    const manager = await createTestManager();
    await manager.load();

    const json = manager.export();
    expect(json).toContain('name');
    expect(json).toContain('server');

    // Verify it's valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.name).toBeDefined();
  });

  it('should get all config keys', async () => {
    const manager = await createTestManager();
    await manager.load();

    const keys = manager.getAllKeys();
    expect(keys).toContain('name');
    expect(keys).toContain('version');
    expect(keys).toContain('server.port');
    expect(keys).toContain('database.connection');
    expect(keys.length).toBeGreaterThan(10);
  });

  it('should get undefined for non-existent key', async () => {
    const manager = await createTestManager();
    await manager.load();

    const value = manager.get('non.existent.key');
    expect(value).toBeUndefined();
  });
});
