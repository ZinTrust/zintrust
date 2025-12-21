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

    it('should prompt for name if interactive', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ projectName: 'user-input' });
      const name = await PromptHelper.projectName('default', true);
      expect(name).toBe('user-input');
      expect(inquirer.prompt).toHaveBeenCalled();
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
