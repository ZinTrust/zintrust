import { appConfig } from '@config/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  resolveNpmPath: () => 'npm',
  resolvePackageManager: () => 'npm',
}));

vi.mock('@cli/PromptHelper');
vi.mock('@cli/scaffolding/ProjectScaffolder');
vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@node-singletons/child-process', () => ({
  execFileSync: vi.fn(),
}));
vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn() },
}));
vi.mock('@node-singletons/path', () => ({
  resolve: vi.fn((...args) => args.join('/')),
  join: vi.fn((...args) => args.join('/')),
}));

import { NewCommand } from '@/cli/commands/NewCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { ProjectScaffolder } from '@cli/scaffolding/ProjectScaffolder';
import { execFileSync } from '@node-singletons/child-process';
import * as path from '@node-singletons/path';

describe('NewCommand', () => {
  let command: any;

  const findQuestionByName = (questions: any[], name: string) => {
    for (const q of questions) {
      if (q?.name === name) return q;
    }
    return undefined;
  };

  beforeEach(() => {
    command = NewCommand.create();
    vi.spyOn(command, 'info');
    vi.spyOn(command, 'warn');
    vi.spyOn(command, 'success');
    vi.spyOn(command, 'debug');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Class Structure', () => {
    it('should create NewCommand instance', () => {
      expect(command).toBeDefined();
    });

    it('should have IBaseCommand structure', () => {
      expect(command.name).toBe('new');
      expect(command.description).toBeDefined();
      expect(typeof command.execute).toBe('function');
      expect(typeof command.getCommand).toBe('function');
    });

    it('should have name property (protected)', () => {
      const name = command.name;
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    it('should have description property (protected)', () => {
      const description = command.description;
      expect(description).toBeDefined();
      expect(typeof description).toBe('string');
    });

    it('should have execute method', () => {
      const execute = command.execute;
      expect(typeof execute).toBe('function');
    });

    it('should have getCommand method from BaseCommand', () => {
      const getCommand = command.getCommand;
      expect(typeof getCommand).toBe('function');
    });
  });

  describe('Command Metadata', () => {
    it('command name should be "new"', () => {
      const name = command.name;
      expect(name).toMatch(/new/i);
    });

    it('description should not be empty', () => {
      const description = command.description;
      expect(description.length).toBeGreaterThan(0);
    });

    it('description should mention project creation', () => {
      const description = command.description;
      expect(description.toLowerCase()).toContain('project');
    });
  });

  describe('Instance Methods', () => {
    it('addOptions method should be defined', () => {
      const addOptions = command.addOptions;
      expect(typeof addOptions).toBe('function');
    });

    it('debug method should be defined', () => {
      const debug = command.debug;
      expect(typeof debug).toBe('function');
    });

    it('info method should be defined', () => {
      const info = command.info;
      expect(typeof info).toBe('function');
    });

    it('success method should be defined', () => {
      const success = command.success;
      expect(typeof success).toBe('function');
    });

    it('warn method should be defined', () => {
      const warn = command.warn;
      expect(typeof warn).toBe('function');
    });
  });

  describe('Protected Methods', () => {
    it('should have getProjectConfig private method', () => {
      const getProjectConfig = command.getProjectConfig;
      expect(typeof getProjectConfig).toBe('function');
    });

    it('should have promptForConfig private method', () => {
      const promptForConfig = command.promptForConfig;
      expect(typeof promptForConfig).toBe('function');
    });

    it('should have getQuestions private method', () => {
      const getQuestions = command.getQuestions;
      expect(typeof getQuestions).toBe('function');
    });

    it('should have runScaffolding private method', () => {
      const runScaffolding = command.runScaffolding;
      expect(typeof runScaffolding).toBe('function');
    });

    it('should have initializeGit private method', () => {
      const initializeGit = command.initializeGit;
      expect(typeof initializeGit).toBe('function');
    });

    it('should have getGitBinary private method', () => {
      const getGitBinary = command.getGitBinary;
      expect(typeof getGitBinary).toBe('function');
    });

    it('should have getSafeEnv private method', () => {
      expect(typeof appConfig.getSafeEnv()).toBe('object');
    });
  });

  describe('Constructor Initialization', () => {
    it('should set name to "new" in constructor', () => {
      const xcommand = NewCommand.create();
      expect(xcommand.name).toBe('new');
    });

    it('should set description in constructor', () => {
      const xcommand = NewCommand.create();
      const description = xcommand.description;
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('Command Creation', () => {
    it('getCommand should return a Command object', () => {
      const cmd = command.getCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toMatch(/new/i);
    });

    it('getCommand should set up command name correctly', () => {
      const cmd = command.getCommand();
      expect(cmd.name()).toBe('new');
    });

    it('getCommand should set up command description', () => {
      const cmd = command.getCommand();
      const description = cmd.description();
      expect(description.length).toBeGreaterThan(0);
    });

    it('getCommand should have arguments configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('<name>');
    });

    it('getCommand should have template option configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--template');
    });

    it('getCommand should have database option configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--database');
    });

    it('getCommand should have port option configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--port');
    });

    it('getCommand should have interactive option configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--interactive');
    });

    it('getCommand should have git option configured', () => {
      const cmd = command.getCommand();
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

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.getProjectConfig).toHaveBeenCalled();
    });

    it('should handle execution errors gracefully', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockRejectedValue(new Error('Config error'));

      await expect(command.execute(options)).rejects.toThrow('Project creation failed');
      await expect(command.execute(options)).rejects.toMatchObject({ code: 'CLI_ERROR' });
    });

    it('should skip git initialization when git option is false', async () => {
      const options = {
        args: ['my-project'],
        git: false,
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.initializeGit).not.toHaveBeenCalled();
    });

    it('should use default options when not provided', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.getProjectConfig).toHaveBeenCalledWith('my-project', options);
    });

    it('should handle different database options', async () => {
      const databases = ['postgresql', 'mysql', 'sqlite'];

      for (const db of databases) {
        const options = {
          args: ['my-project'],
          database: db,
          interactive: false,
        };

        command.getProjectConfig = vi.fn().mockResolvedValue({
          template: 'basic',
          database: db,
          port: 3000,
          author: '',
          description: '',
        });

        command.runScaffolding = vi.fn().mockResolvedValue(undefined);
        command.initializeGit = vi.fn().mockResolvedValue(undefined);

        // eslint-disable-next-line no-await-in-loop
        await command.execute(options);

        expect(command.getProjectConfig).toHaveBeenCalled();
      }
    });

    it('should handle custom port configuration', async () => {
      const options = {
        args: ['my-project'],
        port: '8080',
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 8080,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.getProjectConfig).toHaveBeenCalled();
    });

    it('should handle template options', async () => {
      const templates = ['basic', 'api'];

      for (const template of templates) {
        const options = {
          args: ['my-project'],
          template,
          interactive: false,
        };

        command.getProjectConfig = vi.fn().mockResolvedValue({
          template,
          database: 'postgresql',
          port: 3000,
          author: '',
          description: '',
        });

        command.runScaffolding = vi.fn().mockResolvedValue(undefined);
        command.initializeGit = vi.fn().mockResolvedValue(undefined);

        // eslint-disable-next-line no-await-in-loop
        await command.execute(options);

        expect(command.getProjectConfig).toHaveBeenCalled();
      }
    });

    it('should handle author metadata', async () => {
      const options = {
        args: ['my-project'],
        author: 'John Doe',
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: 'John Doe',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.getProjectConfig).toHaveBeenCalled();
    });

    it('should handle project description', async () => {
      const options = {
        args: ['my-project'],
        description: 'My awesome project',
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: 'My awesome project',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.getProjectConfig).toHaveBeenCalled();
    });

    it('should handle overwrite option', async () => {
      const options = {
        args: ['my-project'],
        overwrite: true,
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.runScaffolding).toHaveBeenCalledWith('my-project', expect.any(Object), true);
    });

    it('should call scaffolding with correct parameters', async () => {
      const options = {
        args: ['test-project'],
        template: 'api',
        database: 'mysql',
        port: '5000',
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'api',
        database: 'mysql',
        port: 5000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.runScaffolding).toHaveBeenCalledWith(
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

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.initializeGit).toHaveBeenCalledWith('my-project');
    });

    it('uses provided package manager to install dependencies', async () => {
      const options = {
        args: ['pm-project'],
        interactive: false,
        packageManager: 'yarn',
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      const { SpawnUtil } = await import('@cli/utils/spawn');
      vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

      await command.execute(options);

      expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith({
        command: 'yarn',
        args: ['install'],
        cwd: expect.any(String),
      });
    });

    it('skips auto-install in CI by default', async () => {
      const options = {
        args: ['ci-project'],
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      process.env['CI'] = '1';
      delete process.env['ZINTRUST_ALLOW_AUTO_INSTALL'];

      const { SpawnUtil } = await import('@cli/utils/spawn');

      await command.execute(options);

      expect(SpawnUtil.spawnAndWait).not.toHaveBeenCalled();

      delete process.env['CI'];
    });

    it('should log info messages on success', async () => {
      const options = {
        args: ['my-project'],
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue(undefined);
      command.initializeGit = vi.fn().mockResolvedValue(undefined);

      await command.execute(options);

      expect(command.info).toBeDefined();
    });

    it('should treat --force as overwrite in scaffolding', async () => {
      const options = {
        args: ['force-project'],
        force: true,
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });

      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      await command.execute(options);

      expect(command.runScaffolding).toHaveBeenCalledWith(
        'force-project',
        expect.any(Object),
        true
      );
    });

    it('should skip dependency installation when install option is false', async () => {
      const options = {
        args: ['no-install-project'],
        install: false,
        interactive: false,
      };

      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      await command.execute(options);

      const { SpawnUtil } = await import('@cli/utils/spawn');
      expect(SpawnUtil.spawnAndWait).not.toHaveBeenCalled();
    });
  });

  describe('getProjectConfig', () => {
    it('should return config with all options provided', async () => {
      const result = await command.getProjectConfig('test', {
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
      const result = await command.getProjectConfig('test', {
        template: 'basic',
        port: '8080',
        interactive: false,
      });

      expect(typeof result.port).toBe('number');
      expect(result.port).toBe(8080);
    });

    it('should default description to project name when not provided', async () => {
      const result = await command.getProjectConfig('my-app', {
        template: 'basic',
        database: 'sqlite',
        port: '3003',
        description: '',
        interactive: false,
      });

      expect(result.description).toContain('my-app');
    });
  });

  describe('getQuestions', () => {
    it('should return array of questions', () => {
      const questions = command.getQuestions('test', {
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
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const template = findQuestionByName(questions, 'template');
      expect(template).toBeDefined();
      expect(template?.type).toBe('list');
    });

    it('should include database question with options', () => {
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const database = findQuestionByName(questions, 'database');
      expect(database).toBeDefined();
      expect(database?.type).toBe('list');
      expect(database?.choices).toContain('postgresql');
    });

    it('should include port question', () => {
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const port = findQuestionByName(questions, 'port');
      expect(port).toBeDefined();
      expect(port?.type).toBe('input');
      expect(typeof port?.validate).toBe('function');
    });

    it('should validate port number range', () => {
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const port = findQuestionByName(questions, 'port');
      const validate = port?.validate;

      expect(validate('3000')).toBe(true);
      expect(validate('1')).toBe(true);
      expect(validate('0')).not.toBe(true);
    });

    it('should reject invalid ports (non-numeric, negative, too large)', () => {
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });

      const port = findQuestionByName(questions, 'port');
      const validate = port?.validate as (value: string) => boolean;

      expect(validate('not-a-number')).toBe(false);
      expect(validate('-1')).toBe(false);
      expect(validate('65536')).toBe(false);
      expect(validate('65535')).toBe(true);
    });

    it('should include author question', () => {
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const author = findQuestionByName(questions, 'author');
      expect(author).toBeDefined();
      expect(author?.type).toBe('input');
    });

    it('should include description question', () => {
      const questions = command.getQuestions('test', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const description = findQuestionByName(questions, 'description');
      expect(description).toBeDefined();
      expect(description?.type).toBe('input');
    });

    it('should use default description with project name', () => {
      const questions = command.getQuestions('my-app', {
        template: 'basic',
        database: 'postgresql',
        port: 3000,
        author: '',
        description: '',
      });

      const description = findQuestionByName(questions, 'description');
      expect(description?.default).toContain('my-app');
    });
  });

  describe('getSafeEnv', () => {
    it('should return object with PATH key', () => {
      const env = command.getSafeEnv();
      expect(env).toHaveProperty('PATH');
      expect(typeof env['PATH']).toBe('string');
    });

    it('should include bin directories in PATH', () => {
      const env = command.getSafeEnv();
      const pathStr = env['PATH'] as string;
      expect(pathStr.length).toBeGreaterThan(0);
    });

    it('should preserve other env variables', () => {
      process.env['TEST_VAR_UNIQUE'] = 'test-value-unique';
      const env = command.getSafeEnv();
      expect(env['TEST_VAR_UNIQUE']).toBe('test-value-unique');
      delete process.env['TEST_VAR_UNIQUE'];
    });
  });

  describe('getGitBinary', () => {
    it('should return a string', () => {
      const binary = command.getGitBinary();
      expect(typeof binary).toBe('string');
      expect(binary.length).toBeGreaterThan(0);
    });

    it('should contain git reference', () => {
      const binary = command.getGitBinary();
      expect(binary).toContain('git');
    });
  });

  describe('Internal Logic & Edge Cases', () => {
    it('should handle interactive project name prompt', async () => {
      const options = { args: [], interactive: true };
      vi.mocked(PromptHelper.projectName).mockResolvedValue('prompted-project');
      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      await command.execute(options);

      expect(PromptHelper.projectName).toHaveBeenCalled();
      expect(command.runScaffolding).toHaveBeenCalledWith(
        'prompted-project',
        expect.any(Object),
        undefined
      );
    });

    it('should throw error if interactive project name prompt returns empty', async () => {
      const options = { args: [], interactive: true };
      vi.mocked(PromptHelper.projectName).mockResolvedValue('');

      await expect(command.execute(options)).rejects.toThrow('Project name is required');
    });

    it('should handle scaffolding failure result', async () => {
      const options = { args: ['fail-project'], interactive: false };
      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: false, message: 'Disk full' });

      await expect(command.execute(options)).rejects.toThrow('Disk full');
    });

    it('should handle scaffolding failure result without message', async () => {
      const options = { args: ['fail-project'], interactive: false };
      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: false });

      await expect(command.execute(options)).rejects.toThrow('Project scaffolding failed');
    });

    it('should initialize git if git option is true', async () => {
      const options = { args: ['git-project'], git: true, interactive: false };
      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      await command.execute(options);

      expect(command.initializeGit).toHaveBeenCalledWith('git-project');
    });

    it('should install dependencies if install option is true', async () => {
      const options = { args: ['install-project'], install: true, interactive: false };
      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      vi.mocked(path.resolve).mockReturnValue('/mock/path/install-project');

      const { SpawnUtil } = await import('@cli/utils/spawn');
      vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

      await command.execute(options);

      expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith({
        command: 'npm',
        args: ['install'],
        cwd: '/mock/path/install-project',
      });
    });

    it('should handle dependency installation failure', async () => {
      const options = { args: ['install-fail'], install: true, interactive: false };
      command.getProjectConfig = vi.fn().mockResolvedValue({
        template: 'basic',
        database: 'sqlite',
        port: 3003,
        author: '',
        description: '',
      });
      command.runScaffolding = vi.fn().mockResolvedValue({ success: true });
      command.initializeGit = vi.fn();

      const { SpawnUtil } = await import('@cli/utils/spawn');
      vi.mocked(SpawnUtil.spawnAndWait).mockRejectedValue(new Error('spawn failed'));

      await command.execute(options);

      expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('npm install'));
    });

    it('should handle git initialization failure', () => {
      vi.mocked(execFileSync).mockImplementation(
        (file: string, args?: readonly string[], _options?: unknown): string => {
          if (file === 'git' && args?.[0] === '--version') return 'git version 2.30.0';
          if (file === 'git' && args?.[0] === 'init') throw new Error('git init failed');
          return '';
        }
      );

      command.initializeGit('git-fail');
      expect(command.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not initialize git')
      );
    });

    it('should skip git initialization if git is not installed', () => {
      vi.mocked(execFileSync).mockImplementation(
        (file: string, args?: readonly string[], _options?: unknown): string => {
          if (file === 'git' && args?.[0] === '--version') throw new Error('git not found');
          return '';
        }
      );

      command.initializeGit('no-git-installed');

      expect(execFileSync).not.toHaveBeenCalledWith('git', ['init'], expect.any(Object));
    });

    it('should initialize git repo with init/add/commit when git is installed', () => {
      vi.mocked(path.resolve).mockReturnValue('/mock/path/git-ok');
      vi.mocked(execFileSync).mockImplementation(
        (_file: string, _args?: readonly string[], _options?: unknown): string => ''
      );

      command.initializeGit('git-ok');

      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['--version'],
        expect.objectContaining({ stdio: 'ignore' })
      );
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['init'],
        expect.objectContaining({ cwd: '/mock/path/git-ok', stdio: 'ignore' })
      );
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['add', '.'],
        expect.objectContaining({ cwd: '/mock/path/git-ok', stdio: 'ignore' })
      );
      expect(execFileSync).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', expect.any(String)],
        expect.objectContaining({ cwd: '/mock/path/git-ok', stdio: 'ignore' })
      );
    });

    it('should prompt for config in interactive mode', async () => {
      const options = { args: ['interactive-project'], interactive: true };
      vi.mocked(PromptHelper.prompt).mockResolvedValue({
        template: 'api',
        database: 'mysql',
        port: '4000',
        author: 'Jane Doe',
        description: 'Custom description',
      });

      const config = await command.promptForConfig('interactive-project', options);

      expect(PromptHelper.prompt).toHaveBeenCalled();
      expect(config.template).toBe('api');
      expect(config.database).toBe('mysql');
      expect(config.port).toBe(4000);
      expect(config.author).toBe('Jane Doe');
      expect(config.description).toBe('Custom description');
    });

    it('should not prompt when interactive is false', async () => {
      const options = { args: ['non-interactive-project'], interactive: false };
      vi.mocked(PromptHelper.prompt).mockResolvedValue({
        template: 'api',
        database: 'mysql',
        port: '4000',
        author: 'Jane Doe',
        description: 'Should not be used',
      });

      const config = await command.promptForConfig('non-interactive-project', options);

      expect(PromptHelper.prompt).not.toHaveBeenCalled();
      expect(config.template).toBe('basic');
      expect(config.database).toBe('sqlite');
    });

    it('should use defaults if prompt answers are missing or invalid', async () => {
      const options = { args: ['interactive-project'], interactive: true };
      vi.mocked(PromptHelper.prompt).mockResolvedValue({});

      const config = await command.promptForConfig('interactive-project', options);

      expect(config.template).toBe('basic');
      expect(config.database).toBe('sqlite');
      expect(config.port).toBe(3003);
    });

    it('should handle numeric port in prompt answers', async () => {
      const options = { args: ['port-project'], interactive: true };
      vi.mocked(PromptHelper.prompt).mockResolvedValue({
        port: 5000,
      });

      let config = await command.promptForConfig('port-project', options);
      expect(config.port).toBe(5000);

      vi.mocked(PromptHelper.prompt).mockResolvedValue({
        port: NaN,
      });
      config = await command.promptForConfig('port-project', options);
      expect(config.port).toBe(3003);

      vi.mocked(PromptHelper.prompt).mockResolvedValue({
        port: 'invalid',
      });
      config = await command.promptForConfig('port-project', options);
      expect(config.port).toBe(3003);
    });

    it('should call ProjectScaffolder.scaffold in runScaffolding', async () => {
      vi.mocked(ProjectScaffolder.scaffold).mockResolvedValue({
        success: true,
        projectPath: '',
        filesCreated: 0,
        directoriesCreated: 0,
        message: '',
      });

      await command.runScaffolding(
        'scaffold-test',
        {
          template: 'basic',
          database: 'sqlite',
          port: 3003,
          author: '',
          description: '',
        },
        true
      );

      expect(ProjectScaffolder.scaffold).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: 'scaffold-test',
          force: true,
        })
      );
    });

    it('should handle non-Error objects in errorToMessage', async () => {
      const options = { args: ['error-test'], interactive: false };
      command.getProjectConfig = vi.fn().mockRejectedValue('String error');

      await expect(command.execute(options)).rejects.toThrow(
        'Project creation failed: String error'
      );

      command.getProjectConfig = vi.fn().mockRejectedValue(null);
      await expect(command.execute(options)).rejects.toThrow(
        'Project creation failed: Unknown error'
      );
    });

    it('should handle fallback values in getProjectDefaults', async () => {
      vi.mocked(PromptHelper.prompt).mockResolvedValue({});
      const config = await command.getProjectConfig('fallback-test', {
        port: 'invalid',
        template: '',
        database: '',
        interactive: 'not-a-boolean',
      });

      expect(config.port).toBe(3000);
      expect(config.template).toBe('basic');
      expect(config.database).toBe('sqlite');
    });
  });
});
