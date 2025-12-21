/**
 * ConfigManager Tests
 */

import { ConfigManager } from '@cli/config/ConfigManager';
import { DEFAULT_CONFIG } from '@cli/config/ConfigSchema';
import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TEST_CONFIG_PATH = '/tmp/test-config-manager.json'; // NOSONAR

describe('ConfigManager Basic Operations', () => {
  beforeEach(async () => {
    // Clean up any existing test file
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should load default config when file does not exist', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    const config = await manager.load();

    expect(config).toBeDefined();
    expect(config.name).toBe(DEFAULT_CONFIG.name);
    expect(config.server.port).toBe(DEFAULT_CONFIG.server.port);
  });

  it('should save config to file', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    const config = await manager.load();

    config.name = 'test-app';
    await manager.save(config);

    // Verify file was created
    const exists = await manager.exists();
    expect(exists).toBe(true);

    // Verify content
    const content = await fs.readFile(TEST_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe('test-app');
  });

  it('should get config value', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    const port = manager.get('server.port');
    expect(port).toBe(3000);
  });

  it('should set config value', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    manager.set('server.port', 3001);
    expect(manager.get('server.port')).toBe(3001);
  });

  it('should set nested config values', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    manager.set('database.host', 'localhost');
    expect(manager.get('database.host')).toBe('localhost');
  });
});

describe('ConfigManager Advanced Operations', () => {
  beforeEach(async () => {
    // Clean up any existing test file
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should merge partial config', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
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
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    const config = await manager.load();

    config.name = 'changed-app';
    await manager.save(config);

    await manager.reset();
    expect(manager.get('name')).toBe(DEFAULT_CONFIG.name);
  });
});

describe('ConfigManager Persistence', () => {
  beforeEach(async () => {
    // Clean up any existing test file
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should create default config', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.create({ name: 'initial-app' });

    const exists = await manager.exists();
    expect(exists).toBe(true);

    const config = manager.getConfig();
    expect(config.name).toBe('initial-app');
  });

  it('should persist changes across save and load', async () => {
    let manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    manager.set('server.port', 5000);
    await manager.save();

    // Create new manager instance and load
    manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    expect(manager.get('server.port')).toBe(5000);
  });
});

describe('ConfigManager Export and Keys', () => {
  beforeEach(async () => {
    // Clean up any existing test file
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should export config as JSON', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    const json = manager.export();
    expect(json).toContain('name');
    expect(json).toContain('server');

    // Verify it's valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.name).toBeDefined();
  });

  it('should get all config keys', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    const keys = manager.getAllKeys();
    expect(keys).toContain('name');
    expect(keys).toContain('version');
    expect(keys).toContain('server.port');
    expect(keys).toContain('database.connection');
    expect(keys.length).toBeGreaterThan(10);
  });

  it('should get undefined for non-existent key', async () => {
    const manager = new ConfigManager(TEST_CONFIG_PATH);
    await manager.load();

    const value = manager.get('non.existent.key');
    expect(value).toBeUndefined();
  });
});
