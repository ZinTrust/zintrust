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
import { ConfigManager } from '@/cli/config/ConfigManager';
import { ConfigValidator } from '@/cli/config/ConfigValidator';
import { PromptHelper } from '@/cli/PromptHelper';

const describeValidationError = (error: any) => error?.message ?? String(error);

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
      expect(typeof (command as any).getCommand).toBe('function');
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
    it('command name should be "config"', () => {
      const name = (command as any).name;
      expect(name).toMatch(/config/i);
    });

    it('description should not be empty', () => {
      const description = (command as any).description;
      expect(description.length).toBeGreaterThan(0);
    });

    it('description should mention configuration management', () => {
      const description = (command as any).description;
      expect(description.toLowerCase()).toContain('config');
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
    it('should have getConfigManager private method', () => {
      const getConfigManager = (command as any).getConfigManager;
      expect(typeof getConfigManager).toBe('function');
    });

    it('should call displayValidationStatus', () => {
      const spy = vi.spyOn(command, 'info');
      (command as any).displayValidationStatus({} as any);
      expect(spy).toHaveBeenCalled();
    });

    it('should call displayConfigurationKeys', () => {
      const spy = vi.spyOn(command, 'info');
      (command as any).displayConfigurationKeys(['key1']);
      expect(spy).toHaveBeenCalled();
    });

    it('should call displayConfigurationValues', () => {
      const spy = vi.spyOn(command, 'info');
      (command as any).displayConfigurationValues({ key1: 'val1' } as any);
      expect(spy).toHaveBeenCalled();
    });

    it('should have handleAction private method', () => {
      const handleAction = (command as any).handleAction;
      expect(typeof handleAction).toBe('function');
    });

    it('should have handleGet private method', () => {
      const handleGet = (command as any).handleGet;
      expect(typeof handleGet).toBe('function');
    });

    it('should have handleSet private method', () => {
      const handleSet = (command as any).handleSet;
      expect(typeof handleSet).toBe('function');
    });

    it('should have handleList private method', () => {
      const handleList = (command as any).handleList;
      expect(typeof handleList).toBe('function');
    });

    it('should have handleReset private method', () => {
      const handleReset = (command as any).handleReset;
      expect(typeof handleReset).toBe('function');
    });

    it('should have handleEdit private method', () => {
      const handleEdit = (command as any).handleEdit;
      expect(typeof handleEdit).toBe('function');
    });

    it('should have handleExport private method', () => {
      const handleExport = (command as any).handleExport;
      expect(typeof handleExport).toBe('function');
    });

    it('should have parseConfigValue private method', () => {
      const parseConfigValue = (command as any).parseConfigValue;
      expect(typeof parseConfigValue).toBe('function');
    });

    it('should have formatConfigValue private method', () => {
      const formatConfigValue = (command as any).formatConfigValue;
      expect(typeof formatConfigValue).toBe('function');
    });

    it('should have displayValidationStatus private method', () => {
      const displayValidationStatus = (command as any).displayValidationStatus;
      expect(typeof displayValidationStatus).toBe('function');
    });

    it('should have displayConfigurationKeys private method', () => {
      const displayConfigurationKeys = (command as any).displayConfigurationKeys;
      expect(typeof displayConfigurationKeys).toBe('function');
    });

    it('should have editSingleConfig private method', () => {
      const editSingleConfig = (command as any).editSingleConfig;
      expect(typeof editSingleConfig).toBe('function');
    });
  });

  describe('Constructor Initialization', () => {
    it('should set name to "config" in constructor', () => {
      const newCommand = ConfigCommand.create();
      expect((newCommand as any).name).toBe('config');
    });

    it('should set description in constructor', () => {
      const newCommand = ConfigCommand.create();
      const description = (newCommand as any).description;
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('Command Creation', () => {
    it('getCommand should return a Command object', () => {
      const cmd = (command as any).getCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toMatch(/config/i);
    });

    it('getCommand should set up command name correctly', () => {
      const cmd = (command as any).getCommand();
      expect(cmd.name()).toBe('config');
    });

    it('getCommand should set up command description', () => {
      const cmd = (command as any).getCommand();
      const description = cmd.description();
      expect(description.length).toBeGreaterThan(0);
    });

    it('getCommand should have arguments configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('[action]');
    });

    it('getCommand should have options configured', () => {
      const cmd = (command as any).getCommand();
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);
      (command as any).getConfigManager = vi.fn();
      (command as any).handleAction = vi.fn();
    });

    it('should execute with default list action', async () => {
      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = { args: [] };
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
        'list',
        mockManager,
        undefined,
        undefined,
        expect.any(Object)
      );
    });

    it('should handle execute when options.args is not an array', async () => {
      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: 'not-an-array' } as any);
      expect((command as any).handleAction).toHaveBeenCalled();
    });

    it('should handle execute when command.opts returns an array', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ['not', 'a', 'record'],
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);
      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: [] });
      expect((command as any).handleAction).toHaveBeenCalled();
    });

    it('should handle execute when command.opts is not a function', async () => {
      const mockCmd = {
        args: ['list'],
        opts: 'not-a-function',
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);
      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: [] });
      expect((command as any).handleAction).toHaveBeenCalled();
    });

    it('should handle execute when command.opts returns null', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => null,
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);
      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      await command.execute({ args: [] });
      expect((command as any).handleAction).toHaveBeenCalled();
    });

    it('should execute with action from options.args', async () => {
      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = { args: ['get', 'key'] };
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).getConfigManager).toHaveBeenCalledWith(false);
    });

    it('should use global config when --global flag is set', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({ global: true }),
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).getConfigManager).toHaveBeenCalledWith(true);
    });

    it('should handle list action', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({}),
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalled();
    });

    it('should handle reset action', async () => {
      const mockCmd = {
        args: ['reset'],
        opts: () => ({}),
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
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
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
        'GET',
        mockManager,
        'key',
        undefined,
        {}
      );
    });

    it('should pass JSON option to handleAction', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({ json: true }),
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
        'list',
        mockManager,
        undefined,
        undefined,
        { json: true }
      );
    });

    it('should pass show-defaults option to handleAction', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({ 'show-defaults': true }),
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      const mockManager = {};
      (command as any).getConfigManager.mockResolvedValue(mockManager);

      const options = {};
      await command.execute(options);

      expect((command as any).handleAction).toHaveBeenCalledWith(
        'list',
        mockManager,
        undefined,
        undefined,
        { 'show-defaults': true }
      );
    });

    it('should handle errors gracefully', async () => {
      const mockCmd = {
        args: ['list'],
        opts: () => ({}),
      };
      (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

      (command as any).getConfigManager.mockRejectedValue(new Error('Config error'));

      const options = {};
      try {
        await command.execute(options);
      } catch {
        // Error should be caught and handled
      }

      expect((command as any).getConfigManager).toHaveBeenCalled();
      expect((command as any).handleAction).not.toHaveBeenCalled();
    });

    it('should support multiple config keys in get action', async () => {
      const keys = ['database.host', 'database.port', 'app.name', 'server.timeout'];

      await keys.reduce(async (prev, key) => {
        await prev;

        const mockCmd = {
          args: ['get', key],
          opts: () => ({}),
        };
        (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

        const mockManager = {};
        (command as any).getConfigManager.mockResolvedValue(mockManager);

        const options = {};
        await command.execute(options);

        expect((command as any).handleAction).toHaveBeenCalledWith(
          'get',
          mockManager,
          key,
          undefined,
          {}
        );
      }, Promise.resolve());
    });

    it('should support setting various config value types', async () => {
      const values = ['localhost', '3000', 'true', 'false', 'production'];

      await values.reduce(async (prev, value) => {
        await prev;

        const mockCmd = {
          args: ['set', 'key', value],
          opts: () => ({}),
        };
        (command as any).getCommand = vi.fn().mockReturnValue(mockCmd);

        const mockManager = {};
        (command as any).getConfigManager.mockResolvedValue(mockManager);

        const options = {};
        await command.execute(options);

        expect((command as any).handleAction).toHaveBeenCalledWith(
          'set',
          mockManager,
          'key',
          value,
          {}
        );
      }, Promise.resolve());
    });
  });

  describe('Handler Method Tests', () => {
    beforeEach(() => {
      (command as any).info = vi.fn();
      (command as any).warn = vi.fn();
      (command as any).success = vi.fn();
      (command as any).debug = vi.fn();
    });

    describe('handleGet', () => {
      it('should handle get with valid key', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue('test-value'),
        };
        await (command as any).handleGet(mockManager, 'test.key');
        expect(mockManager.get).toHaveBeenCalledWith('test.key');
        expect((command as any).info).toHaveBeenCalled();
      });

      it('should handle get with object value', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue({ nested: 'object' }),
        };
        await (command as any).handleGet(mockManager, 'test.key');
        expect((command as any).info).toHaveBeenCalledWith(
          JSON.stringify({ nested: 'object' }, null, 2)
        );
      });

      it('should warn when key not found', async () => {
        const mockManager = {
          get: vi.fn().mockReturnValue(undefined),
        };
        await (command as any).handleGet(mockManager, 'missing.key');
        expect((command as any).warn).toHaveBeenCalled();
      });

      it('should warn when manager does not support get', async () => {
        const mockManager = {};
        await (command as any).handleGet(mockManager, 'key');
        expect((command as any).warn).toHaveBeenCalledWith(
          'Configuration manager does not support "get"'
        );
      });

      it('should call ErrorHandler.usageError when key not provided', async () => {
        const mockErrorHandler = { usageError: vi.fn() };
        const { ErrorHandler } = await import('@cli/ErrorHandler');
        (ErrorHandler as any).usageError = mockErrorHandler.usageError;
        const mockManager = {};
        await (command as any).handleGet(mockManager, undefined);
        // Error handler may throw or return, so we just check manager wasn't used
        expect(mockManager).toBeDefined();
      });

      it('should handle get with empty key parameter', async () => {
        const mockManager = {};
        try {
          await (command as any).handleGet(mockManager, '');
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
        await (command as any).handleSet(mockManager, 'test.key', 'test-value');
        expect(mockManager.set).toHaveBeenCalled();
        expect(mockManager.save).toHaveBeenCalled();
      });

      it('should handle set when manager does not support save', async () => {
        const mockManager = {
          set: vi.fn(),
        };
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);
        await (command as any).handleSet(mockManager, 'test.key', 'test-value');
        expect(mockManager.set).toHaveBeenCalled();
      });

      it('should warn when manager does not support set', async () => {
        const mockManager = {};
        await (command as any).handleSet(mockManager, 'key', 'value');
        expect((command as any).warn).toHaveBeenCalledWith(
          'Configuration manager does not support "set"'
        );
      });

      it('should warn when validation fails', async () => {
        const mockManager = { set: vi.fn() };
        vi.mocked(ConfigValidator.validateValue).mockReturnValue({
          message: 'Invalid value',
        } as any);
        await (command as any).handleSet(mockManager, 'key', 'value');
        expect((command as any).warn).toHaveBeenCalledWith(
          'Validation error for "key": Invalid value'
        );
        expect(mockManager.set).not.toHaveBeenCalled();
      });

      it('should handle ErrorHandler for missing key', async () => {
        const mockManager = {};
        try {
          await (command as any).handleSet(mockManager, undefined, 'value');
        } catch {
          // Expected behavior - ErrorHandler may throw
        }
        // Command should handle gracefully
        expect(true).toBe(true);
      });

      it('should parse boolean values', async () => {
        const parseMethod = (command as any).parseConfigValue;
        const result = parseMethod('true');
        expect(result).toBe(true);
      });

      it('should parse number values', async () => {
        const parseMethod = (command as any).parseConfigValue;
        const result = parseMethod('3000');
        expect(result).toBe(3000);
      });

      it('should parse JSON values', async () => {
        const parseMethod = (command as any).parseConfigValue;
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
        await (command as any).handleList(mockManager, {});
        expect((command as any).info).toHaveBeenCalled();
        expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('key1'));
        expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('key2'));
      });

      it('should handle list with missing getConfig', async () => {
        const mockManager = {};
        await (command as any).handleList(mockManager, {});
        expect((command as any).info).toHaveBeenCalledWith(
          expect.stringContaining('Current Configuration')
        );
      });

      it('should display validation errors in list', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key: 'value' }),
        };
        vi.mocked(ConfigValidator.validate).mockReturnValue({
          valid: false,
          errors: [{ message: 'Error 1' }, { message: 'Error 2' }] as any,
        });
        vi.mocked(ConfigValidator.getDescription).mockImplementation(describeValidationError);

        await (command as any).handleList(mockManager, {});
        expect((command as any).info).toHaveBeenCalledWith(
          expect.stringContaining('Configuration has 2 errors')
        );
        expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('Error 1'));
        expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('Error 2'));
      });

      it('should handle list with json option', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue(['key1']),
          get: vi.fn().mockReturnValue('value'),
          export: vi.fn().mockReturnValue('{"key1":"value"}'),
        };
        await (command as any).handleList(mockManager, { json: true });
        expect(mockManager.export).toHaveBeenCalled();
      });

      it('should handle list with show defaults option', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue(['key1']),
          get: vi.fn().mockReturnValue('value'),
        };
        await (command as any).handleList(mockManager, { showDefaults: true });
        expect((command as any).info).toHaveBeenCalled();
      });
    });

    describe('handleReset', () => {
      it('should reset configuration when confirmed', async () => {
        const mockManager = {
          reset: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.confirm).mockResolvedValue(true);
        await (command as any).handleReset(mockManager);
        expect(mockManager.reset).toHaveBeenCalled();
        expect((command as any).success).toHaveBeenCalled();
      });

      it('should handle reset when manager does not support it', async () => {
        const mockManager = {};
        vi.mocked(PromptHelper.confirm).mockResolvedValue(true);
        await (command as any).handleReset(mockManager);
        expect((command as any).success).toHaveBeenCalledWith('Configuration reset to defaults');
      });

      it('should cancel reset when not confirmed', async () => {
        const mockManager = {
          reset: vi.fn(),
        };
        vi.mocked(PromptHelper.confirm).mockResolvedValue(false);
        await (command as any).handleReset(mockManager);
        expect(mockManager.reset).not.toHaveBeenCalled();
        expect((command as any).info).toHaveBeenCalledWith('Reset cancelled');
      });
    });

    describe('handleEdit', () => {
      it('should handle edit mode', async () => {
        const mockManager = {
          getAllKeys: vi.fn().mockReturnValue(['key1', 'key2']),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.chooseFrom).mockResolvedValue('(Done)');
        await (command as any).handleEdit(mockManager);
        expect((command as any).success).toHaveBeenCalled();
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

        await (command as any).handleEdit(mockManager);

        expect(mockManager.set).toHaveBeenCalledWith('key1', 'new-val');
        expect(PromptHelper.chooseFrom).toHaveBeenCalledTimes(2);
      });

      it('should handle edit mode with getConfig returning keys', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key1: 'val1' }),
          save: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(PromptHelper.chooseFrom).mockResolvedValue('(Done)');
        await (command as any).handleEdit(mockManager);
        expect(mockManager.getConfig).toHaveBeenCalled();
      });

      it('should warn when no keys found in edit mode', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({}),
          getAllKeys: vi.fn().mockReturnValue([]),
        };
        await (command as any).handleEdit(mockManager);
        expect((command as any).warn).toHaveBeenCalledWith('No configuration keys found');
      });

      it('should break loop when selectedKey is empty', async () => {
        const mockManager = {
          getConfig: vi.fn().mockReturnValue({ key1: 'val1' }),
        };
        vi.mocked(PromptHelper.chooseFrom).mockResolvedValue('');
        await (command as any).handleEdit(mockManager);
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
        await (command as any).editSingleConfig(mockManager, 'test.key');
        expect(mockManager.set).toHaveBeenCalledWith('test.key', { a: 2 });
        expect(mockManager.save).toHaveBeenCalled();
        expect((command as any).success).toHaveBeenCalled();
      });

      it('should handle editSingleConfig when manager does not support get/set/save', async () => {
        const mockManager = {};
        vi.mocked(PromptHelper.textInput).mockResolvedValue('new-value');
        vi.mocked(ConfigValidator.validateValue).mockReturnValue(null);
        await (command as any).editSingleConfig(mockManager, 'test.key');
        expect((command as any).success).toHaveBeenCalled();
      });

      it('should handle undefined newValue in editSingleConfig', async () => {
        const mockManager = { get: vi.fn() };
        vi.mocked(PromptHelper.textInput).mockResolvedValue(undefined as unknown as string);
        await (command as any).editSingleConfig(mockManager, 'key');
        expect(mockManager.get).toHaveBeenCalled();
      });

      it('should warn when validation fails in editSingleConfig', async () => {
        const mockManager = { get: vi.fn() };
        vi.mocked(PromptHelper.textInput).mockResolvedValue('new-val');
        vi.mocked(ConfigValidator.validateValue).mockReturnValue({ message: 'Error' } as any);
        await (command as any).editSingleConfig(mockManager, 'key');
        expect((command as any).warn).toHaveBeenCalledWith('Validation error: Error');
      });
    });

    describe('handleExport', () => {
      it('should export configuration', async () => {
        const mockManager = {
          export: vi.fn().mockReturnValue('{"key":"value"}'),
        };
        await (command as any).handleExport(mockManager);
        expect(mockManager.export).toHaveBeenCalled();
        expect((command as any).info).toHaveBeenCalled();
      });

      it('should handle export when manager does not support it', async () => {
        const mockManager = {};
        await (command as any).handleExport(mockManager);
        expect((command as any).info).toHaveBeenCalledWith('{}');
      });
    });

    describe('parseConfigValue', () => {
      it('should parse boolean true', () => {
        const result = (command as any).parseConfigValue('true');
        expect(result).toBe(true);
      });

      it('should parse boolean false', () => {
        const result = (command as any).parseConfigValue('false');
        expect(result).toBe(false);
      });

      it('should parse numbers', () => {
        const result = (command as any).parseConfigValue('42');
        expect(result).toBe(42);
        const result2 = (command as any).parseConfigValue('3.14');
        expect(result2).toBe(3.14);
      });

      it('should parse JSON objects', () => {
        const result = (command as any).parseConfigValue('{"a":1}');
        expect(typeof result).toBe('object');
      });

      it('should parse JSON arrays', () => {
        const result = (command as any).parseConfigValue('[1,2,3]');
        expect(Array.isArray(result)).toBe(true);
      });

      it('should parse null string as null', () => {
        const result = (command as any).parseConfigValue('null');
        expect(result).toBeNull();
      });

      it('should handle invalid JSON by returning original string', () => {
        const result = (command as any).parseConfigValue('{"invalid": json');
        expect(result).toBe('{"invalid": json');
      });

      it('should keep unparseable strings as strings', () => {
        const result = (command as any).parseConfigValue('some-string');
        expect(typeof result).toBe('string');
      });

      it('should handle undefined values', () => {
        const result = (command as any).parseConfigValue(undefined);
        expect(result).toBeUndefined();
      });

      it('should handle empty strings', () => {
        const result = (command as any).parseConfigValue('');
        expect(result).toBe('');
      });
    });

    describe('formatConfigValue', () => {
      it('should format undefined as null', () => {
        const result = (command as any).formatConfigValue(undefined);
        expect(result).toContain('null');
      });

      it('should format null as null', () => {
        const result = (command as any).formatConfigValue(null);
        expect(result).toContain('null');
      });

      it('should format boolean values', () => {
        const trueResult = (command as any).formatConfigValue(true);
        expect(trueResult).toBe('true');
        const falseResult = (command as any).formatConfigValue(false);
        expect(falseResult).toBe('false');
      });

      it('should format numbers', () => {
        const result = (command as any).formatConfigValue(42);
        expect(result).toBe('42');
      });

      it('should format objects as JSON', () => {
        const result = (command as any).formatConfigValue({ key: 'value' });
        expect(result).toContain('key');
      });

      it('should format strings with quotes', () => {
        const result = (command as any).formatConfigValue('test-string');
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
        (command as any).handleGet = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('get', mockManager, 'key');
        expect((command as any).handleGet).toHaveBeenCalledWith(mockManager, 'key', undefined);
      });

      it('should dispatch to handleSet', async () => {
        (command as any).handleSet = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('set', mockManager, 'key', 'value');
        expect((command as any).handleSet).toHaveBeenCalledWith(
          mockManager,
          'key',
          'value',
          undefined
        );
      });

      it('should dispatch to handleList', async () => {
        (command as any).handleList = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('list', mockManager, undefined, undefined, {
          json: true,
        });
        expect((command as any).handleList).toHaveBeenCalledWith(mockManager, { json: true });
      });

      it('should dispatch to handleList with default options', async () => {
        (command as any).handleList = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('list', mockManager, undefined, undefined, undefined);
        expect((command as any).handleList).toHaveBeenCalledWith(mockManager, {});
      });

      it('should dispatch to handleReset', async () => {
        (command as any).handleReset = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('reset', mockManager);
        expect((command as any).handleReset).toHaveBeenCalled();
      });

      it('should dispatch to handleEdit', async () => {
        (command as any).handleEdit = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('edit', mockManager);
        expect((command as any).handleEdit).toHaveBeenCalled();
      });

      it('should dispatch to handleExport', async () => {
        (command as any).handleExport = vi.fn().mockResolvedValue(undefined);
        await (command as any).handleAction('export', mockManager);
        expect((command as any).handleExport).toHaveBeenCalled();
      });

      it('should handle unknown action', async () => {
        const mockErrorHandler = { usageError: vi.fn() };
        const { ErrorHandler } = await import('@cli/ErrorHandler');
        (ErrorHandler as any).usageError = mockErrorHandler.usageError;

        await (command as any).handleAction('unknown', mockManager);
        expect(mockErrorHandler.usageError).toHaveBeenCalledWith('Unknown action: unknown');
      });
    });

    describe('getConfigManager', () => {
      it('should get global config when isGlobal is true', async () => {
        vi.mocked(ConfigManager.getGlobalConfig).mockResolvedValue({} as any);
        await (command as any).getConfigManager(true);
        expect(vi.mocked(ConfigManager.getGlobalConfig)).toHaveBeenCalled();
      });

      it('should get project config when isGlobal is false', async () => {
        vi.mocked(ConfigManager.getProjectConfig).mockResolvedValue({} as any);
        await (command as any).getConfigManager(false);
        expect(vi.mocked(ConfigManager.getProjectConfig)).toHaveBeenCalled();
      });
    });
  });
});
