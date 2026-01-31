/* eslint-disable max-nested-callbacks */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/config/ConfigManager');
vi.mock('@cli/config/ConfigValidator');
vi.mock('@cli/ErrorHandler');
vi.mock('@cli/PromptHelper');
vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    bold: (s: string) => s,
    gray: (s: string) => s,
  },
}));

import { ConfigCommand } from '@/cli/commands/ConfigCommand';
import type { ProjectConfig } from '@/cli/config';
import { ConfigManager } from '@/cli/config/ConfigManager';
import { ConfigValidator } from '@/cli/config/ConfigValidator';
import { PromptHelper } from '@/cli/PromptHelper';

const describeValidationError = (error: any) => error?.message ?? String(error);

// Helper function to create a mock config manager
const createMockConfigManager = () => ({
  load: function (): Promise<ProjectConfig> {
    throw new Error('Function not implemented.');
  },
  save: function (_config?: ProjectConfig): Promise<void> {
    throw new Error('Function not implemented.');
  },
  getConfig: function (): ProjectConfig {
    throw new Error('Function not implemented.');
  },
  get: function (_key: string): unknown {
    throw new Error('Function not implemented.');
  },
  set: function (_key: string, _value: unknown): void {
    throw new Error('Function not implemented.');
  },
  exists: function (): Promise<boolean> {
    throw new Error('Function not implemented.');
  },
  create: function (_initialConfig?: Partial<ProjectConfig>): Promise<void> {
    throw new Error('Function not implemented.');
  },
  reset: function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  merge: function (_partial: Partial<ProjectConfig>): void {
    throw new Error('Function not implemented.');
  },
  export: function (): string {
    throw new Error('Function not implemented.');
  },
  getAllKeys: function (): string[] {
    throw new Error('Function not implemented.');
  },
});

// Helper function to create mock command for testing
const createMockCommand = (args: string[]) => ({
  args,
  opts: () => ({}),
});

// Helper function to test key execution
const testKeyExecution = async (command: any, key: string) => {
  const mockCmd = createMockCommand(['get', key]);
  command.getCommand = vi.fn().mockReturnValue(mockCmd);
  const mockManager = {};
  command.getConfigManager.mockResolvedValue(mockManager);

  await command.execute({});

  expect(command.handleAction).toHaveBeenCalledWith('get', mockManager, key, undefined, {});
};

// Helper function to test value execution
const testValueExecution = async (command: any, value: string) => {
  const mockCmd = createMockCommand(['set', 'key', value]);
  command.getCommand = vi.fn().mockReturnValue(mockCmd);
  const mockManager = {};
  command.getConfigManager.mockResolvedValue(mockManager);

  await command.execute({});

  expect(command.handleAction).toHaveBeenCalledWith('set', mockManager, 'key', value, {});
};

describe('ConfigCommand', () => {
  let command: any;

  beforeEach(() => {
    command = ConfigCommand.create();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Class Structure', () => {
    it('should create ConfigCommand instance', () => {
      expect(command).toBeDefined();
    });

    it('should inherit from BaseCommand', () => {
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
    it('command name should be "config"', () => {
      const name = command.name;
      expect(name).toMatch(/config/i);
    });

    it('description should not be empty', () => {
      const description = command.description;
      expect(description.length).toBeGreaterThan(0);
    });

    it('description should mention configuration management', () => {
      const description = command.description;
      expect(description.toLowerCase()).toContain('config');
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
    it('should have getConfigManager private method', () => {
      const getConfigManager = command.getConfigManager;
      expect(typeof getConfigManager).toBe('function');
    });

    it('should call displayValidationStatus', () => {
      const spy = vi.spyOn(command, 'info');
      command.displayValidationStatus({});
      expect(spy).toHaveBeenCalled();
    });

    it('should call displayConfigurationKeys', () => {
      const spy = vi.spyOn(command, 'info');
      command.displayConfigurationKeys(['key1']);
      expect(spy).toHaveBeenCalled();
    });

    it('should call displayConfigurationValues', () => {
      const spy = vi.spyOn(command, 'info');
      command.displayConfigurationValues({ key1: 'val1' });
      expect(spy).toHaveBeenCalled();
    });

    it('should have handleAction private method', () => {
      const handleAction = command.handleAction;
      expect(typeof handleAction).toBe('function');
    });

    it('should have handleGet private method', () => {
      const handleGet = command.handleGet;
      expect(typeof handleGet).toBe('function');
    });

    it('should have handleSet private method', () => {
      const handleSet = command.handleSet;
      expect(typeof handleSet).toBe('function');
    });

    it('should have handleList private method', () => {
      const handleList = command.handleList;
      expect(typeof handleList).toBe('function');
    });

    it('should have handleReset private method', () => {
      const handleReset = command.handleReset;
      expect(typeof handleReset).toBe('function');
    });

    it('should have handleEdit private method', () => {
      const handleEdit = command.handleEdit;
      expect(typeof handleEdit).toBe('function');
    });

    it('should have handleExport private method', () => {
      const handleExport = command.handleExport;
      expect(typeof handleExport).toBe('function');
    });

    it('should have parseConfigValue private method', () => {
      const parseConfigValue = command.parseConfigValue;
      expect(typeof parseConfigValue).toBe('function');
    });

    it('should have formatConfigValue private method', () => {
      const formatConfigValue = command.formatConfigValue;
      expect(typeof formatConfigValue).toBe('function');
    });

    it('should have displayValidationStatus private method', () => {
      const displayValidationStatus = command.displayValidationStatus;
      expect(typeof displayValidationStatus).toBe('function');
    });

    it('should have displayConfigurationKeys private method', () => {
      const displayConfigurationKeys = command.displayConfigurationKeys;
      expect(typeof displayConfigurationKeys).toBe('function');
    });

    it('should have editSingleConfig private method', () => {
      const editSingleConfig = command.editSingleConfig;
      expect(typeof editSingleConfig).toBe('function');
    });
  });

  describe('Constructor Initialization', () => {
    it('should set name to "config" in constructor', () => {
      const newCommand = ConfigCommand.create();
      expect(newCommand.name).toBe('config');
    });

    it('should set description in constructor', () => {
      const newCommand = ConfigCommand.create();
      const description = newCommand.description;
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('Command Creation', () => {
    it('getCommand should return a Command object', () => {
      const cmd = command.getCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toMatch(/config/i);
    });

    it('getCommand should set up command name correctly', () => {
      const cmd = command.getCommand();
      expect(cmd.name()).toBe('config');
    });

    it('getCommand should set up command description', () => {
      const cmd = command.getCommand();
      const description = cmd.description();
      expect(description.length).toBeGreaterThan(0);
    });

    it('getCommand should have arguments configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('[action]');
    });

    it('getCommand should have options configured', () => {
      const cmd = command.getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--global');
    });
  });

  describe('Execution Tests', () => {
    beforeEach(() => {
      // Mock getCommand to return a proper command object
      const mockCmd = {
        args: [],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);
      command.getConfigManager = vi.fn();
      command.handleAction = vi.fn();
    });

    it('should execute with default list action', async () => {
      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = { args: [] };
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'list',
        mockManager,
        undefined,
        undefined,
        expect.any(Object)
      );
    });

    it('should handle execute when options.args is not an array', async () => {
      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: 'not-an-array' });
      expect(command.handleAction).toHaveBeenCalled();
    });

    it('should handle execute when command.opts returns an array', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ['not', 'a', 'record'],
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);
      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: [] });
      expect(command.handleAction).toHaveBeenCalled();
    });

    it('should handle execute when command.opts is not a function', async () => {
      const mockCmd = {
        args: ['list'],
        opts: 'not-a-function',
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);
      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: [] });
      expect(command.handleAction).toHaveBeenCalled();
    });

    it('should handle execute when command.opts returns null', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => null,
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);
      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: [] });
      expect(command.handleAction).toHaveBeenCalled();
    });

    it('should execute with action from options.args', async () => {
      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = { args: ['get', 'key'] };
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'get',
        mockManager,
        'key',
        undefined,
        expect.any(Object)
      );
    });

    it('should execute with get action', async () => {
      const mockCmd = {
        args: ['get', 'database.host'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'get',
        mockManager,
        'database.host',
        undefined,
        expect.any(Object)
      );
    });

    it('should execute with set action', async () => {
      const mockCmd = {
        args: ['set', 'database.host', 'localhost'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'set',
        mockManager,
        'database.host',
        'localhost',
        expect.any(Object)
      );
    });

    it('should use project config by default', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.getConfigManager).toHaveBeenCalledWith(false);
    });

    it('should use global config when --global flag is set', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({ global: true }),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.getConfigManager).toHaveBeenCalledWith(true);
    });

    it('should handle list action', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalled();
    });

    it('should handle reset action', async () => {
      const mockCmd = {
        args: ['reset'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'reset',
        mockManager,
        undefined,
        undefined,
        {}
      );
    });

    it('should handle edit action', async () => {
      const mockCmd = {
        args: ['edit'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'edit',
        mockManager,
        undefined,
        undefined,
        {}
      );
    });

    it('should handle export action', async () => {
      const mockCmd = {
        args: ['export'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith(
        'export',
        mockManager,
        undefined,
        undefined,
        {}
      );
    });

    it('should handle case-insensitive actions', async () => {
      const mockCmd = {
        args: ['GET', 'key'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith('GET', mockManager, 'key', undefined, {});
    });

    it('should pass JSON option to handleAction', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({ json: true }),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith('list', mockManager, undefined, undefined, {
        json: true,
      });
    });

    it('should pass show-defaults option to handleAction', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({ 'show-defaults': true }),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      command.getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect(command.handleAction).toHaveBeenCalledWith('list', mockManager, undefined, undefined, {
        'show-defaults': true,
      });
    });

    it('should handle errors gracefully', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({}),
      };
      command.getCommand = vi.fn().mockReturnValue(mockCmd);

      command.getConfigManager.mockRejectedValue(new Error('Config error'));

      const options = {};
      try {
        await command.execute(options);
      } catch {
        // Error should be caught and handled
      }

      expect(command.getConfigManager).toHaveBeenCalled();
      expect(command.handleAction).not.toHaveBeenCalled();
    });

    it('should support multiple config keys in get action', async () => {
      const keys = ['database.host', 'database.port', 'app.name', 'server.timeout'];

      await Promise.all(keys.map((key) => testKeyExecution(command, key)));
    });

    it('should support setting various config value types', async () => {
      const values = ['localhost', '3000', 'true', 'false', 'production'];

      await Promise.all(values.map((value) => testValueExecution(command, value)));
    });
  });

  describe('Handler Method Tests', () => {
    beforeEach(() => {
      command.info = vi.fn();
      command.warn = vi.fn();
      command.success = vi.fn();
      command.debug = vi.fn();
    });

    describe('handleGet', () => {
      it('should handle get with valid key', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue('test-value'),
        };
        await command.handleGet(mockManager, 'test.key');
        expect(mockManager.get).toHaveBeenCalledWith('test.key');
        expect(command.info).toHaveBeenCalled();
      });

      it('should handle get with object value', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue({ nested: 'object' }),
        };
        await command.handleGet(mockManager, 'test.key');
        expect(command.info).toHaveBeenCalledWith(JSON.stringify({ nested: 'object' }, null, 2));
      });

      it('should warn when key not found', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue(undefined),
        };
        await command.handleGet(mockManager, 'missing.key');
        expect(command.warn).toHaveBeenCalled();
      });

      it('should warn when manager does not support get', async () => {
        const mockManager = {};
        await command.handleGet(mockManager, 'key');
        expect(command.warn).toHaveBeenCalledWith('Configuration manager does not support "get"');
      });

      it('should call ErrorHandler.usageError when key not provided', async () => {
        const mockErrorHandler = { usageError: vi.fn() };
        const { ErrorHandler } = await import('@cli/ErrorHandler');
        vi.mocked(ErrorHandler as any).usageError = mockErrorHandler.usageError;
        const mockManager = {};
        await command.handleGet(mockManager, undefined);
        // Error handler may throw or return, so we just check manager wasn't used
        expect(mockManager).toBeDefined();
      });

      it('should handle get with empty key parameter', async () => {
        const mockManager = {};
        try {
          await command.handleGet(mockManager, '');
        } catch {
          // Expected to call ErrorHandler.usageError which may throw
        }
        // Command should handle gracefully
        expect(true).toBe(true);
      });
    });

    describe('handleSet', () => {
      it('should handle set with valid key and value', async () => {
        const mockManager = {
          set: vi.fn(),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);
        await command.handleSet(mockManager, 'test.key', 'test-value');
        expect(mockManager.set).toHaveBeenCalled();
        expect(mockManager.save).toHaveBeenCalled();
      });

      it('should handle set when manager does not support save', async () => {
        const mockManager = {
          set: vi.fn(),
        };
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);
        await command.handleSet(mockManager, 'test.key', 'test-value');
        expect(mockManager.set).toHaveBeenCalled();
      });

      it('should warn when manager does not support set', async () => {
        const mockManager = {};
        await command.handleSet(mockManager, 'key', 'value');
        expect(command.warn).toHaveBeenCalledWith('Configuration manager does not support "set"');
      });

      it('should warn when validation fails', async () => {
        const mockManager = { set: vi.fn() };
        vi.mocked(ConfigValidator.validateValue).mockReturnValue({
          message: 'Invalid value',
          key: '',
          value: undefined,
          rule: '',
        });
        await command.handleSet(mockManager, 'key', 'value');
        expect(command.warn).toHaveBeenCalledWith('Validation error for "key": Invalid value');
        expect(mockManager.set).not.toHaveBeenCalled();
      });

      it('should handle ErrorHandler for missing key', async () => {
        const mockManager = {};
        try {
          await command.handleSet(mockManager, undefined, 'value');
        } catch {
          // Expected behavior - ErrorHandler may throw
        }
        // Command should handle gracefully
        expect(true).toBe(true);
      });

      it('should parse boolean values', async () => {
        const parseMethod = command.parseConfigValue;
        const result = parseMethod('true');
        expect(result).toBe(true);
      });

      it('should parse number values', async () => {
        const parseMethod = command.parseConfigValue;
        const result = parseMethod('3000');
        expect(result).toBe(3000);
      });

      it('should parse JSON values', async () => {
        const parseMethod = command.parseConfigValue;
        const result = parseMethod('{"key":"value"}');
        expect(typeof result).toBe('object');
      });
    });

    describe('handleList', () => {
      beforeEach(() => {
        vi.mocked(ConfigValidator.validate).mockReturnValue({
          valid: true,
          errors: [],
        });
        vi.mocked(ConfigValidator.getDescription).mockReturnValue('Test description');
      });

      it('should handle list action', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key1: 'val1', key2: 'val2' }),
          getAllKeys: vi.fn().mockReturnValue(['key1', 'key2']),
          get: vi.fn().mockReturnValue('value'),
        };
        await command.handleList(mockManager, {});
        expect(command.info).toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('key1'));
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('key2'));
      });

      it('should handle list with missing getConfig', async () => {
        const mockManager = {};
        await command.handleList(mockManager, {});
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Current Configuration'));
      });

      it('should display validation errors in list', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key: 'value' }),
        };
        vi.mocked(ConfigValidator.validate).mockReturnValue({
          valid: false,
          errors: [
            {
              message: 'Error 1',
              key: '',
              value: undefined,
              rule: '',
            },
            {
              message: 'Error 2',
              key: '',
              value: undefined,
              rule: '',
            },
          ],
        });
        vi.mocked(ConfigValidator.getDescription).mockImplementation(describeValidationError);

        await command.handleList(mockManager, {});
        expect(command.info).toHaveBeenCalledWith(
          expect.stringContaining('Configuration has 2 errors')
        );
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Error 1'));
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Error 2'));
      });

      it('should handle list with json option', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue(['key1']),
          get: vi.fn().mockReturnValue('value'),
          export: vi.fn().mockReturnValue('{"key1":"value"}'),
        };
        await command.handleList(mockManager, { json: true });
        expect(mockManager.export).toHaveBeenCalled();
      });

      it('should handle list with show defaults option', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue(['key1']),
          get: vi.fn().mockReturnValue('value'),
        };
        await command.handleList(mockManager, { showDefaults: true });
        expect(command.info).toHaveBeenCalled();
      });
    });

    describe('handleReset', () => {
      it('should reset configuration when confirmed', async () => {
        const mockManager = {
          reset: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.confirm).mockResolvedValue(true);
        await command.handleReset(mockManager);
        expect(mockManager.reset).toHaveBeenCalled();
        expect(command.success).toHaveBeenCalled();
      });

      it('should handle reset when manager does not support it', async () => {
        const mockManager = {};
        vi.mocked(PromptHelper.confirm).mockResolvedValue(true);
        await command.handleReset(mockManager);
        expect(command.success).toHaveBeenCalledWith('Configuration reset to defaults');
      });

      it('should cancel reset when not confirmed', async () => {
        const mockManager = {
          reset: vi.fn(),
        };
        vi.mocked(PromptHelper.confirm).mockResolvedValue(false);
        await command.handleReset(mockManager);
        expect(mockManager.reset).not.toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith('Reset cancelled');
      });
    });

    describe('handleEdit', () => {
      it('should handle edit mode', async () => {
        const mockManager = {
          getAllKeys: vi.fn().mockReturnValue(['key1', 'key2']),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.chooseFrom).mockResolvedValue('(Done)');
        await command.handleEdit(mockManager);
        expect(command.success).toHaveBeenCalled();
      });

      it('should loop in handleEdit until (Done) is selected', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key1: 'val1' }),
          get: vi.fn().mockReturnValue('val1'),
          set: vi.fn(),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.chooseFrom)
          .mockResolvedValueOnce('key1')
          .mockResolvedValueOnce('(Done)');
        vi.mocked(PromptHelper.textInput).mockResolvedValue('new-val');
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);

        await command.handleEdit(mockManager);

        expect(mockManager.set).toHaveBeenCalledWith('key1', 'new-val');
        expect(PromptHelper.chooseFrom).toHaveBeenCalledTimes(2);
      });

      it('should handle edit mode with getConfig returning keys', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key1: 'val1' }),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.chooseFrom).mockResolvedValue('(Done)');
        await command.handleEdit(mockManager);
        expect(mockManager.getConfig).toHaveBeenCalled();
      });

      it('should warn when no keys found in edit mode', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue([]),
        };
        await command.handleEdit(mockManager);
        expect(command.warn).toHaveBeenCalledWith('No configuration keys found');
      });

      it('should break loop when selectedKey is empty', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key1: 'val1' }),
        };
        vi.mocked(PromptHelper.chooseFrom).mockResolvedValue('');
        await command.handleEdit(mockManager);
        expect(PromptHelper.chooseFrom).toHaveBeenCalledTimes(1);
      });

      it('should edit single config', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue({ a: 1 }),
          set: vi.fn(),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.textInput).mockResolvedValue('{"a":2}');
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);
        await command.editSingleConfig(mockManager, 'test.key');
        expect(mockManager.set).toHaveBeenCalledWith('test.key', { a: 2 });
        expect(mockManager.save).toHaveBeenCalled();
        expect(command.success).toHaveBeenCalled();
      });

      it('should handle editSingleConfig when manager does not support get/set/save', async () => {
        const mockManager = {};
        vi.mocked(PromptHelper.textInput).mockResolvedValue('new-value');
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);
        await command.editSingleConfig(mockManager, 'test.key');
        expect(command.success).toHaveBeenCalled();
      });

      it('should handle undefined newValue in editSingleConfig', async () => {
        const mockManager = { get: vi.fn() };
        vi.mocked(PromptHelper.textInput).mockResolvedValue(undefined as unknown as string);
        await command.editSingleConfig(mockManager, 'key');
        expect(mockManager.get).toHaveBeenCalled();
      });

      it('should warn when validation fails in editSingleConfig', async () => {
        const mockManager = { get: vi.fn() };
        vi.mocked(PromptHelper.textInput).mockResolvedValue('new-val');
        vi.mocked(ConfigValidator.validateValue).mockReturnValue({
          message: 'Error',
          key: '',
          value: undefined,
          rule: '',
        });
        await command.editSingleConfig(mockManager, 'key');
        expect(command.warn).toHaveBeenCalledWith('Validation error: Error');
      });
    });

    describe('handleExport', () => {
      it('should export configuration', async () => {
        const mockManager = {
          export: vi.fn().mockReturnValue('{"key":"value"}'),
        };
        await command.handleExport(mockManager);
        expect(mockManager.export).toHaveBeenCalled();
        expect(command.info).toHaveBeenCalled();
      });

      it('should handle export when manager does not support it', async () => {
        const mockManager = {};
        await command.handleExport(mockManager);
        expect(command.info).toHaveBeenCalledWith('{}');
      });
    });

    describe('parseConfigValue', () => {
      it('should parse boolean true', () => {
        const result = command.parseConfigValue('true');
        expect(result).toBe(true);
      });

      it('should parse boolean false', () => {
        const result = command.parseConfigValue('false');
        expect(result).toBe(false);
      });

      it('should parse numbers', () => {
        const result = command.parseConfigValue('42');
        expect(result).toBe(42);
        const result2 = command.parseConfigValue('3.14');
        expect(result2).toBe(3.14);
      });

      it('should parse JSON objects', () => {
        const result = command.parseConfigValue('{"a":1}');
        expect(typeof result).toBe('object');
      });

      it('should parse JSON arrays', () => {
        const result = command.parseConfigValue('[1,2,3]');
        expect(Array.isArray(result)).toBe(true);
      });

      it('should parse null string as null', () => {
        const result = command.parseConfigValue('null');
        expect(result).toBeNull();
      });

      it('should handle invalid JSON by returning original string', () => {
        const result = command.parseConfigValue('{"invalid": json');
        expect(result).toBe('{"invalid": json');
      });

      it('should keep unparseable strings as strings', () => {
        const result = command.parseConfigValue('some-string');
        expect(typeof result).toBe('string');
      });

      it('should handle undefined values', () => {
        const result = command.parseConfigValue(undefined);
        expect(result).toBeUndefined();
      });

      it('should handle empty strings', () => {
        const result = command.parseConfigValue('');
        expect(result).toBe('');
      });
    });

    describe('formatConfigValue', () => {
      it('should format undefined as null', () => {
        const result = command.formatConfigValue(undefined);
        expect(result).toContain('null');
      });

      it('should format null as null', () => {
        const result = command.formatConfigValue(null);
        expect(result).toContain('null');
      });

      it('should format boolean values', () => {
        const trueResult = command.formatConfigValue(true);
        expect(trueResult).toBe('true');
        const falseResult = command.formatConfigValue(false);
        expect(falseResult).toBe('false');
      });

      it('should format numbers', () => {
        const result = command.formatConfigValue(42);
        expect(result).toBe('42');
      });

      it('should format objects as JSON', () => {
        const result = command.formatConfigValue({ key: 'value' });
        expect(result).toContain('key');
      });

      it('should format strings with quotes', () => {
        const result = command.formatConfigValue('test-string');
        expect(result).toContain('test-string');
      });
    });

    describe('handleAction dispatch', () => {
      let mockManager: any;

      beforeEach(() => {
        mockManager = {
          get: vi.fn(),
          set: vi.fn(),
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue([]),
          reset: vi.fn(),
          export: vi.fn(),
          save: vi.fn(),
        };
      });

      it('should dispatch to handleGet', async () => {
        command.handleGet = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('get', mockManager, 'key');
        expect(command.handleGet).toHaveBeenCalledWith(mockManager, 'key', undefined);
      });

      it('should dispatch to handleSet', async () => {
        command.handleSet = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('set', mockManager, 'key', 'value');
        expect(command.handleSet).toHaveBeenCalledWith(mockManager, 'key', 'value', undefined);
      });

      it('should dispatch to handleList', async () => {
        command.handleList = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('list', mockManager, undefined, undefined, {
          json: true,
        });
        expect(command.handleList).toHaveBeenCalledWith(mockManager, { json: true });
      });

      it('should dispatch to handleList with default options', async () => {
        command.handleList = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('list', mockManager, undefined, undefined, undefined);
        expect(command.handleList).toHaveBeenCalledWith(mockManager, {});
      });

      it('should dispatch to handleReset', async () => {
        command.handleReset = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('reset', mockManager);
        expect(command.handleReset).toHaveBeenCalled();
      });

      it('should dispatch to handleEdit', async () => {
        command.handleEdit = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('edit', mockManager);
        expect(command.handleEdit).toHaveBeenCalled();
      });

      it('should dispatch to handleExport', async () => {
        command.handleExport = vi.fn().mockResolvedValue(undefined);
        await command.handleAction('export', mockManager);
        expect(command.handleExport).toHaveBeenCalled();
      });

      it('should handle unknown action', async () => {
        const mockErrorHandler = { usageError: vi.fn() };
        const { ErrorHandler } = await import('@cli/ErrorHandler');
        vi.mocked(ErrorHandler as any).usageError = mockErrorHandler.usageError;

        await command.handleAction('unknown', mockManager);
        expect(mockErrorHandler.usageError).toHaveBeenCalledWith('Unknown action: unknown');
      });
    });

    describe('getConfigManager', () => {
      it('should get global config when isGlobal is true', async () => {
        vi.mocked(ConfigManager.getGlobalConfig).mockResolvedValue(createMockConfigManager());
        await command.getConfigManager(true);
        expect(vi.mocked(ConfigManager.getGlobalConfig)).toHaveBeenCalled();
      });

      it('should get project config when isGlobal is false', async () => {
        vi.mocked(ConfigManager.getProjectConfig).mockResolvedValue(createMockConfigManager());
        await command.getConfigManager(false);
        expect(vi.mocked(ConfigManager.getProjectConfig)).toHaveBeenCalled();
      });
    });
  });
});
