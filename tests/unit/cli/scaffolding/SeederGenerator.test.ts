import { SeederGenerator } from '@cli/scaffolding/SeederGenerator';
import fs from '@node-singletons/fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => {
  const writeFile = vi.fn().mockResolvedValue(undefined);
  const writeFileSync = vi.fn();
  const mkdir = vi.fn().mockResolvedValue(undefined);
  const stat = vi.fn().mockResolvedValue({ isDirectory: () => true });
  const existsSync = vi.fn().mockReturnValue(true);

  return {
    default: {
      existsSync,
      mkdirSync: vi.fn(),
      writeFileSync,
      statSync: vi.fn().mockReturnValue({ isDirectory: () => true, isFile: () => true }),
    },
    existsSync,
    mkdirSync: vi.fn(),
    writeFileSync,
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true, isFile: () => true }),
    fsPromises: {
      writeFile,
      mkdir,
      stat,
    },
  };
});

describe('SeederGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSeeder', () => {
    it('should generate a standard seeder', async () => {
      const result = await SeederGenerator.generateSeeder({
        seederName: 'UserSeeder',
        modelName: 'User',
        count: 50,
        seedersPath: '/path/to/seeders',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('UserSeeder.ts');
      expect(fs.writeFileSync).toHaveBeenCalled();

      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('export const UserSeeder');
      expect(content).toContain('const count = 50;');
      expect(content).toContain('TRUNCATE TABLE users');
    });
  });

  describe('generateDatabaseSeeder', () => {
    it('should generate a master DatabaseSeeder orchestrator', async () => {
      const result = await SeederGenerator.generateDatabaseSeeder({
        seedersPath: '/path/to/seeders',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('DatabaseSeeder.ts');
      expect(fs.writeFileSync).toHaveBeenCalled();

      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('export const DatabaseSeeder');
      expect(content).toContain('SeederDiscovery.listSeederFiles');
      expect(content).toContain('SeederLoader.load');
    });
  });
});
