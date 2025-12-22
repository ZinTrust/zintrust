import { PromptHelper } from '@/cli/PromptHelper';
import inquirer from 'inquirer';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

describe('PromptHelper', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('projectName', () => {
    it('should return default name if not interactive', async () => {
      const name = await PromptHelper.projectName('default-name', false);
      expect(name).toBe('default-name');
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should prompt when not interactive but default is missing/empty', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ projectName: 'my-app' });
      const name = await PromptHelper.projectName('', false);
      expect(name).toBe('my-app');
      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it('should prompt for name if interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ projectName: 'user-input' });
      const name = await PromptHelper.projectName('default', true);
      expect(name).toBe('user-input');
      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it('should use built-in default when defaultName is undefined', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ projectName: 'my-zintrust-app' });
      await PromptHelper.projectName(undefined, true);

      const [questions] = vi.mocked(inquirer.prompt).mock.calls[0] ?? [];
      const question = (questions as unknown as Array<{ default?: unknown }>)[0];
      expect(question.default).toBe('my-zintrust-app');
    });

    it('should validate project name rules', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ projectName: 'ignored' });
      await PromptHelper.projectName('default', true);

      const [questions] = vi.mocked(inquirer.prompt).mock.calls[0] ?? [];
      expect(Array.isArray(questions)).toBe(true);
      const question = (
        questions as unknown as Array<{ validate?: (input: string) => string | boolean }>
      )[0];
      expect(question?.validate).toBeTypeOf('function');

      const validate = question.validate as (input: string) => string | boolean;
      expect(validate('   ')).toBe('Project name cannot be empty');
      expect(validate('bad name!')).toBe(
        'Project name can only contain letters, numbers, hyphens, and underscores'
      );
      expect(validate('good_name-123')).toBe(true);
    });
  });

  describe('databaseType', () => {
    it('should return default db if not interactive', async () => {
      const db = await PromptHelper.databaseType('sqlite', false);
      expect(db).toBe('sqlite');
    });

    it('should prompt for db if interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ database: 'mysql' });
      const db = await PromptHelper.databaseType('postgresql', true);
      expect(db).toBe('mysql');
    });
  });

  describe('port', () => {
    it('should return default port if not interactive', async () => {
      const port = await PromptHelper.port(8080, false);
      expect(port).toBe(8080);
    });

    it('should prompt for port if interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ port: 9000 });
      const port = await PromptHelper.port(3000, true);
      expect(port).toBe(9000);
    });

    it('should validate port range', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ port: 1234 });
      await PromptHelper.port(3000, true);

      const [questions] = vi.mocked(inquirer.prompt).mock.calls[0] ?? [];
      const question = (
        questions as unknown as Array<{ validate?: (input: number) => string | boolean }>
      )[0];
      const validate = question.validate as (input: number) => string | boolean;

      expect(validate(0)).toBe('Port must be between 1 and 65535');
      expect(validate(70000)).toBe('Port must be between 1 and 65535');
      expect(validate(3000)).toBe(true);
    });
  });

  describe('selectFeatures', () => {
    it('should return first feature when not interactive', async () => {
      const features = await PromptHelper.selectFeatures(['auth', 'payments'], false);
      expect(features).toEqual(['auth']);
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should prompt for features when interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ features: ['payments'] });
      const features = await PromptHelper.selectFeatures(['auth', 'payments'], true);
      expect(features).toEqual(['payments']);
      expect(inquirer.prompt).toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('should return defaultConfirm when not interactive', async () => {
      await expect(PromptHelper.confirm('Proceed?', false, false)).resolves.toBe(false);
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should prompt for confirm when interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirmed: true });
      await expect(PromptHelper.confirm('Proceed?', false, true)).resolves.toBe(true);
    });
  });

  describe('chooseFrom', () => {
    it('should return defaultChoice when not interactive', async () => {
      await expect(PromptHelper.chooseFrom('Pick', ['a', 'b'], 'b', false)).resolves.toBe('b');
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should prompt for choice when interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ choice: 'b' });
      await expect(PromptHelper.chooseFrom('Pick', ['a', 'b'], 'a', true)).resolves.toBe('b');
    });
  });

  describe('textInput', () => {
    it('should return defaultValue when not interactive', async () => {
      await expect(PromptHelper.textInput('Enter', 'x', false)).resolves.toBe('x');
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should prompt for text when interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ text: 'hello' });
      await expect(PromptHelper.textInput('Enter', '', true)).resolves.toBe('hello');
    });
  });

  describe('instance method prompt', () => {
    it('should call inquirer.prompt', async () => {
      const helper = new PromptHelper();
      const questions = [{ name: 'q1' }];
      vi.mocked(inquirer.prompt).mockResolvedValue({ q1: 'a1' });

      const result = await helper.prompt(questions);
      expect(result).toEqual({ q1: 'a1' });
      expect(inquirer.prompt).toHaveBeenCalledWith(questions);
    });
  });
});
