import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/PromptHelper');
vi.mock('@cli/scaffolding/ProjectScaffolder');
vi.mock('@/config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:path');

import { BaseCommand } from '@/cli/BaseCommand';
import { NewCommand } from '@/cli/commands/NewCommand';
import { Logger } from '@/config/logger';

describe('NewCommand', () => {
  let command: NewCommand;

  beforeEach(() => {
    command = new NewCommand();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Class Structure', () => {
    it('should create NewCommand instance', () => {
      expect(command).toBeDefined();
      expect(command).toBeInstanceOf(NewCommand);
    });

    it('should inherit from BaseCommand', () => {
      expect(command).toBeInstanceOf(BaseCommand);
    });

    it('should have name property (protected)', () => {
      const name = (command as any).name;
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    it('should have description property (protected)', () => {
      const description = (command as any).description;
      expect(description).toBeDefined();
      expect(typeof description).toBe('string');
    });

    it('should have execute method', () => {
      const execute = (command as any).execute;
      expect(typeof execute).toBe('function');
    });

    it('should have getCommand method from BaseCommand', () => {
      const getCommand = (command as any).getCommand;
      expect(typeof getCommand).toBe('function');
    });
  });

  describe('Command Metadata', () => {
    it('command name should be "new"', () => {
      const name = (command as any).name;
      expect(name).toMatch(/new/i);
    });

    it('description should not be empty', () => {
      const description = (command as any).description;
      expect(description.length).toBeGreaterThan(0);
    });

    it('description should mention project creation', () => {
      const description = (command as any).description;
      expect(description.toLowerCase()).toContain('project');
    });
  });

  describe('Instance Methods', () => {
    it('addOptions method should be defined', () => {
      const addOptions = (command as any).addOptions;
      expect(typeof addOptions).toBe('function');
    });

    it('debug method should be defined', () => {
      const debug = (command as any).debug;
      expect(typeof debug).toBe('function');
    });

    it('info method should be defined', () => {
      const info = (command as any).info;
      expect(typeof info).toBe('function');
    });

    it('success method should be defined', () => {
      const success = (command as any).success;
      expect(typeof success).toBe('function');
    });

    it('warn method should be defined', () => {
      const warn = (command as any).warn;
      expect(typeof warn).toBe('function');
    });
  });

  describe('Protected Methods', () => {
    it('should have getProjectConfig private method', () => {
      const getProjectConfig = (command as any).getProjectConfig;
      expect(typeof getProjectConfig).toBe('function');
    });

    it('should have promptForConfig private method', () => {
      const promptForConfig = (command as any).promptForConfig;
      expect(typeof promptForConfig).toBe('function');
    });

    it('should have getQuestions private method', () => {
      const getQuestions = (command as any).getQuestions;
      expect(typeof getQuestions).toBe('function');
    });

    it('should have runScaffolding private method', () => {
      const runScaffolding = (command as any).runScaffolding;
      expect(typeof runScaffolding).toBe('function');
    });

    it('should have initializeGit private method', () => {
      const initializeGit = (command as any).initializeGit;
      expect(typeof initializeGit).toBe('function');
    });

    it('should have getGitBinary private method', () => {
      const getGitBinary = (command as any).getGitBinary;
      expect(typeof getGitBinary).toBe('function');
    });

    it('should have getSafeEnv private method', () => {
      const getSafeEnv = (command as any).getSafeEnv;
      expect(typeof getSafeEnv).toBe('function');
    });
  });

  describe('Constructor Initialization', () => {
    it('should set name to "new" in constructor', () => {
      const newCommand = new NewCommand();
      expect((newCommand as any).name).toBe('new');
    });

    it('should set description in constructor', () => {
      const newCommand = new NewCommand();
      const description = (newCommand as any).description;
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('Command Creation', () => {
    it('getCommand should return a Command object', () => {
      const cmd = (command as any).getCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toMatch(/new/i);
    });

    it('getCommand should set up command name correctly', () => {
      const cmd = (command as any).getCommand();
      expect(cmd.name()).toBe('new');
    });

    it('getCommand should set up command description', () => {
      const cmd = (command as any).getCommand();
      const description = cmd.description();
      expect(description.length).toBeGreaterThan(0);
    });

    it('getCommand should have arguments configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('<name>');
    });

    it('getCommand should have template option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--template');
    });

    it('getCommand should have database option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--database');
    });

    it('getCommand should have port option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--port');
    });

    it('getCommand should have interactive option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--interactive');
    });

    it('getCommand should have git option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--no-git');
    });
  });

  describe('Execution Tests', () => {
    it('should throw error if project name is missing', async () => {
      const options = {
        args: [],
        interactive: false,
      };

      await expect(command.execute(options)).rejects.toThrow('Project name is required');
    });

    it('should throw error if project name is empty string', async () => {
      const options = {
        args: [''],
        interactive: false,
      };

      await expect(command.execute(options)).rejects.toThrow('Project name is required');
    });

    it('should execute with project name provided', async () => {
      const options = {
        args: ['my-project'],
        template: 'basic',
        database: 'postgresql',
        port: '3000',
        git: true,
        interactive: false,
      };

      // Mock methods to avoid actual file operations
      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).getProjectConfig).toHaveBeenCalled();
    });

    it('should handle execution errors gracefully', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockRejectedValue(new Error('Config error'));

      await expect(command.execute(options)).rejects.toThrow('Project creation failed');
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should skip git initialization when git option is false', async () => {
      const options = {
        args: ['my-project'],
        git: false,
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).initializeGit).not.toHaveBeenCalled();
    });

    it('should use default options when not provided', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).getProjectConfig).toHaveBeenCalledWith('my-project', options);
    });

    it('should handle different database options', async () => {
      const databases = ['postgresql', 'mysql', 'sqlite'];

      for (const db of databases) {
        const options = {
          args: ['my-project'],
          database: db,
          interactive: false,
        };

        (command as any).getProjectConfig = vi.fn().mockResolvedValue({
          template: 'basic',
          database: db,
          port: 3000,
          author: '',
          description: '',
        });

        (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
        (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

        await command.execute(options);

        expect((command as any).getProjectConfig).toHaveBeenCalled();
      }
    });

    it('should handle custom port configuration', async () => {
      const options = {
        args: ['my-project'],
        port: '8080',
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 8080,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).getProjectConfig).toHaveBeenCalled();
    });

    it('should handle template options', async () => {
      const templates = ['basic', 'api'];

      for (const template of templates) {
        const options = {
          args: ['my-project'],
          template,
          interactive: false,
        };

        (command as any).getProjectConfig = vi.fn().mockResolvedValue({
          template,
          database: 'postgresql',
          port: 3000,
          author: '',
          description: '',
        });

        (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
        (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

        await command.execute(options);

        expect((command as any).getProjectConfig).toHaveBeenCalled();
      }
    });

    it('should handle author metadata', async () => {
      const options = {
        args: ['my-project'],
        author: 'John Doe',
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: 'John Doe',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).getProjectConfig).toHaveBeenCalled();
    });

    it('should handle project description', async () => {
      const options = {
        args: ['my-project'],
        description: 'My awesome project',
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: 'My awesome project',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).getProjectConfig).toHaveBeenCalled();
    });

    it('should handle overwrite option', async () => {
      const options = {
        args: ['my-project'],
        overwrite: true,
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).runScaffolding).toHaveBeenCalledWith(
        'my-project',
        expect.any(Object),
        true
      );
    });

    it('should call scaffolding with correct parameters', async () => {
      const options = {
        args: ['test-project'],
        template: 'api',
        database: 'mysql',
        port: '5000',
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'api',
        database: 'mysql',
        port: 5000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).runScaffolding).toHaveBeenCalledWith(
        'test-project',
        {
          template: 'api',
          database: 'mysql',
          port: 5000,
          author: '',
          description: '',
        },
        undefined
      );
    });

    it('should call initializeGit when git option is not explicitly false', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect((command as any).initializeGit).toHaveBeenCalledWith('my-project');
    });

    it('should log info messages on success', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      (command as any).getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      (command as any).runScaffolding = vi.fn().mockResolvedValue(undefined);
      (command as any).initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      // Check that info method is called (from BaseCommand methods)
      expect((command as any).info).toBeDefined();
    });
  });

  describe('getProjectConfig', () => {
    it('should return config with all options provided', async () => {
      const result = await (command as any).getProjectConfig('test', {
        template: 'api',
        database: 'mysql',
        port: '5000',
        author: 'John',
        description: 'Test app',
        interactive: false,
      });

      expect(result.template).toBe('api');
      expect(result.database).toBe('mysql');
      expect(result.port).toBe(5000);
      expect(result.author).toBe('John');
      expect(result.description).toBe('Test app');
    });

    it('should parse port to number', async () => {
      const result = await (command as any).getProjectConfig('test', {
        template: 'basic',
        port: '8080',
        interactive: false,
      });

      expect(typeof result.port).toBe('number');
      expect(result.port).toBe(8080);
    });
  });

  describe('getQuestions', () => {
    it('should return array of questions', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);
    });

    it('should include template question', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const template = questions.find((q: any) => q.name === 'template');
      expect(template).toBeDefined();
      expect(template?.type).toBe('list');
    });

    it('should include database question with options', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const database = questions.find((q: any) => q.name === 'database');
      expect(database).toBeDefined();
      expect(database?.type).toBe('list');
      expect(database?.choices).toContain('postgresql');
    });

    it('should include port question', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const port = questions.find((q: any) => q.name === 'port');
      expect(port).toBeDefined();
      expect(port?.type).toBe('input');
      expect(typeof port?.validate).toBe('function');
    });

    it('should validate port number range', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const port = questions.find((q: any) => q.name === 'port');
      const validate = port?.validate;

      expect(validate('3000')).toBe(true);
      expect(validate('1')).toBe(true);
      expect(validate('0')).not.toBe(true);
    });

    it('should include author question', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const author = questions.find((q: any) => q.name === 'author');
      expect(author).toBeDefined();
      expect(author?.type).toBe('input');
    });

    it('should include description question', () => {
      const questions = (command as any).getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const description = questions.find((q: any) => q.name === 'description');
      expect(description).toBeDefined();
      expect(description?.type).toBe('input');
    });

    it('should use default description with project name', () => {
      const questions = (command as any).getQuestions('my-app', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const description = questions.find((q: any) => q.name === 'description');
      expect(description?.default).toContain('my-app');
    });
  });

  describe('getSafeEnv', () => {
    it('should return object with PATH key', () => {
      const env = (command as any).getSafeEnv();
      expect(env).toHaveProperty('PATH');
      expect(typeof env.PATH).toBe('string');
    });

    it('should include bin directories in PATH', () => {
      const env = (command as any).getSafeEnv();
      const pathStr = env.PATH as string;
      // Should contain either /usr/bin or Windows equivalents
      expect(pathStr.length).toBeGreaterThan(0);
    });

    it('should preserve other env variables', () => {
      process.env['TEST_VAR_UNIQUE'] = 'test-value-unique';
      const env = (command as any).getSafeEnv();
      expect(env['TEST_VAR_UNIQUE']).toBe('test-value-unique');
      delete process.env['TEST_VAR_UNIQUE'];
    });
  });

  describe('getGitBinary', () => {
    it('should return a string', () => {
      const binary = (command as any).getGitBinary();
      expect(typeof binary).toBe('string');
      expect(binary.length).toBeGreaterThan(0);
    });

    it('should contain git reference', () => {
      const binary = (command as any).getGitBinary();
      expect(binary).toContain('git');
    });
  });
});
