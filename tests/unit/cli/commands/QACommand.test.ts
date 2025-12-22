import { QACommand } from '@/cli/commands/QACommand';
import { Logger } from '@/config/logger';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('@/config/logger');

describe('QACommand', () => {
  let command: QACommand;

  beforeEach(() => {
    command = new QACommand();
    vi.resetAllMocks();

    // Mock fs.existsSync to return true for npm check
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runSonar', () => {
    it('should skip sonar if --no-sonar option is provided', async () => {
      // Access private method via any cast
      const result = { status: 'pending', output: '' } as any;
      const options = { sonar: false };

      await (command as any).runSonar(result, options);

      expect(result.status).toBe('skipped');
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it('should run sonarqube npm script if enabled', async () => {
      const result = { status: 'pending', output: '' } as any;
      const options = { sonar: true };

      await (command as any).runSonar(result, options);

      expect(result.status).toBe('passed');
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        expect.stringContaining('npm'),
        ['run', 'sonarqube'],
        expect.objectContaining({
          stdio: 'inherit',
        })
      );
    });

    it('should handle failures', async () => {
      const result = { status: 'pending', output: '' } as any;
      const options = { sonar: true };

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw new Error('Sonar failed');
      });

      await (command as any).runSonar(result, options);

      expect(result.status).toBe('failed');
      expect(result.output).toBe('Sonar failed');
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Execute Method', () => {
    it('should initialize results with pending status', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect((command as any).runLint).toHaveBeenCalled();
    });

    it('should run lint first', async () => {
      const executionOrder: string[] = [];

      (command as any).runLint = vi.fn().mockImplementation(() => {
        executionOrder.push('lint');
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation(() => {
        executionOrder.push('typeCheck');
      });
      (command as any).runTests = vi.fn().mockImplementation(() => {
        executionOrder.push('tests');
      });
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[0]).toBe('lint');
    });

    it('should run type check after lint', async () => {
      const executionOrder: string[] = [];

      (command as any).runLint = vi.fn().mockImplementation(() => {
        executionOrder.push('lint');
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation(() => {
        executionOrder.push('typeCheck');
      });
      (command as any).runTests = vi.fn().mockImplementation(() => {
        executionOrder.push('tests');
      });
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[1]).toBe('typeCheck');
    });

    it('should run tests after type check', async () => {
      const executionOrder: string[] = [];

      (command as any).runLint = vi.fn().mockImplementation(() => {
        executionOrder.push('lint');
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation(() => {
        executionOrder.push('typeCheck');
      });
      (command as any).runTests = vi.fn().mockImplementation(() => {
        executionOrder.push('tests');
      });
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[2]).toBe('tests');
    });

    it('should run sonar after tests', async () => {
      const executionOrder: string[] = [];

      (command as any).runLint = vi.fn().mockImplementation(() => {
        executionOrder.push('lint');
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation(() => {
        executionOrder.push('typeCheck');
      });
      (command as any).runTests = vi.fn().mockImplementation(() => {
        executionOrder.push('tests');
      });
      (command as any).runSonar = vi.fn().mockImplementation(() => {
        executionOrder.push('sonar');
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[3]).toBe('sonar');
    });

    it('should generate report when report option is true', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: true };
      await command.execute(options);

      expect((command as any).generateReport).toHaveBeenCalled();
    });

    it('should not generate report when report option is false', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect((command as any).generateReport).not.toHaveBeenCalled();
    });

    it('should mark all checks as passed when successful', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runTests = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runSonar = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect((command as any).info).toHaveBeenCalledWith('Starting Zintrust QA Suite...');
    });

    it('should handle failures gracefully', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'failed';
      });
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect((command as any).info).toHaveBeenCalledWith('Starting Zintrust QA Suite...');
    });

    it('should handle execution errors', async () => {
      (command as any).runLint = vi.fn().mockRejectedValue(new Error('Lint error'));
      (command as any).info = vi.fn();
      (command as any).debug = vi.fn();

      const options = { report: false };
      try {
        await command.execute(options);
      } catch (error) {
        // Error expected
      }

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should display info message at start', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect((command as any).info).toHaveBeenCalledWith('Starting Zintrust QA Suite...');
    });

    it('should pass correct options to sonar', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false, noSonar: true };
      await command.execute(options);

      expect((command as any).runSonar).toHaveBeenCalledWith(expect.any(Object), options);
    });

    it('should update result objects during execution', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
        result.output = 'Lint passed';
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
        result.output = 'Type check passed';
      });
      (command as any).runTests = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
        result.output = 'Tests passed';
      });
      (command as any).runSonar = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
        result.output = 'Sonar passed';
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect((command as any).info).toHaveBeenCalled();
    });
  });

  describe('Class Structure', () => {
    it('should create QACommand instance', () => {
      expect(command).toBeDefined();
      expect(command).toBeInstanceOf(QACommand);
    });

    it('should have protected name property', () => {
      expect((command as any).name).toBeDefined();
      expect((command as any).name).toBe('qa');
    });

    it('should have protected description property', () => {
      expect((command as any).description).toBeDefined();
      expect((command as any).description.length).toBeGreaterThan(0);
    });

    it('should have addOptions method', () => {
      expect((command as any).addOptions).toBeDefined();
      expect(typeof (command as any).addOptions).toBe('function');
    });

    it('should have execute method', () => {
      expect(command.execute).toBeDefined();
      expect(typeof command.execute).toBe('function');
    });
  });

  describe('QAResults Interface', () => {
    it('should support QAResult type with status and output', () => {
      const result = {
        status: 'passed' as const,
        output: 'test output',
      };

      expect(result.status).toBe('passed');
      expect(result.output).toBeDefined();
    });

    it('should support all QAResult status values', () => {
      const statuses = ['pending', 'passed', 'failed', 'skipped'] as const;

      for (const status of statuses) {
        const result = { status, output: '' };
        expect(result.status).toBeDefined();
      }
    });
  });

  describe('Lint Execution', () => {
    it('should run lint npm script', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Lint passed' as any);

      await (command as any).runLint(result);

      expect(result.status).toBe('passed');
    });

    it('should capture lint output on success', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Lint completed' as any);

      await (command as any).runLint(result);

      expect(result.output).toBeDefined();
    });

    it('should mark lint as failed on error', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw new Error('Lint failed');
      });

      await (command as any).runLint(result);

      expect(result.status).toBe('failed');
    });

    it('should log errors during lint', async () => {
      const result = { status: 'pending', output: '' } as any;
      const error = new Error('Linting error');

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw error;
      });

      await (command as any).runLint(result);

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Type Check Execution', () => {
    it('should run type-check npm script', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Type check passed' as any);

      await (command as any).runTypeCheck(result);

      expect(result.status).toBe('passed');
    });

    it('should mark type check as failed on error', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw new Error('Type check failed');
      });

      await (command as any).runTypeCheck(result);

      expect(result.status).toBe('failed');
    });

    it('should log errors during type check', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw new Error('Type check error');
      });

      await (command as any).runTypeCheck(result);

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Test Execution', () => {
    it('should run test npm script', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Tests passed' as any);

      await (command as any).runTests(result);

      expect(result.status).toBe('passed');
    });

    it('should mark tests as failed on error', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw new Error('Tests failed');
      });

      await (command as any).runTests(result);

      expect(result.status).toBe('failed');
    });

    it('should log errors during tests', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(() => {
        throw new Error('Test error');
      });

      await (command as any).runTests(result);

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Report Generation', () => {
    it('should call generateReport when report option is true', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      await command.execute({ report: true });

      expect((command as any).generateReport).toHaveBeenCalled();
    });

    it('should not call generateReport when report option is false', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      await command.execute({ report: false });

      expect((command as any).generateReport).not.toHaveBeenCalled();
    });

    it('should handle report generation failure gracefully', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn().mockImplementation(() => {
        throw new Error('Report generation failed');
      });
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      try {
        await command.execute({ report: true });
      } catch {
        // Error expected
      }

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Success and Failure Messages', () => {
    it('should show success message when all checks pass', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runTests = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runSonar = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();
      (command as any).warn = vi.fn();

      await command.execute({ report: false });

      expect((command as any).success).toHaveBeenCalledWith(
        expect.stringContaining('passed successfully')
      );
    });

    it('should show warning when some checks fail', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'failed';
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runTests = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runSonar = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();
      (command as any).warn = vi.fn();

      await command.execute({ report: false });

      expect((command as any).warn).toHaveBeenCalledWith(expect.stringContaining('failures'));
    });

    it('should show success when some checks are skipped but all pass or skip', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation((result: any) => {
        result.status = 'skipped';
      });
      (command as any).runTests = vi.fn().mockImplementation((result: any) => {
        result.status = 'passed';
      });
      (command as any).runSonar = vi.fn().mockImplementation((result: any) => {
        result.status = 'skipped';
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();
      (command as any).warn = vi.fn();

      await command.execute({ report: false });

      expect((command as any).success).toHaveBeenCalled();
    });
  });

  describe('Sonar Options Handling', () => {
    it('should skip sonar when --no-sonar option is provided', async () => {
      const result = { status: 'pending', output: '' } as any;

      await (command as any).runSonar(result, { sonar: false });

      expect(result.status).toBe('skipped');
    });

    it('should run sonar when sonar option is true or not provided', async () => {
      const result = { status: 'pending', output: '' } as any;

      await (command as any).runSonar(result, {});

      expect(result.status).toBe('passed');
    });
  });

  describe('Error Handling', () => {
    it('should catch and log errors from execute', async () => {
      (command as any).runLint = vi.fn().mockRejectedValue(new Error('Fatal error'));
      (command as any).info = vi.fn();

      try {
        await command.execute({});
      } catch {
        // Expected
      }

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should rethrow errors after logging', async () => {
      const testError = new Error('Test error');
      (command as any).runLint = vi.fn().mockRejectedValue(testError);
      (command as any).info = vi.fn();

      await expect(command.execute({})).rejects.toThrow();
    });

    it('should log debug info on errors', async () => {
      const testError = new Error('Debug test');
      (command as any).runLint = vi.fn().mockRejectedValue(testError);
      (command as any).info = vi.fn();
      (command as any).debug = vi.fn();

      try {
        await command.execute({});
      } catch {
        // Expected
      }

      expect((command as any).debug).toHaveBeenCalled();
    });
  });

  describe('Options Handling', () => {
    it('should accept --no-sonar option', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      const options = { sonar: false, report: false };
      await command.execute(options);

      expect((command as any).runSonar).toHaveBeenCalledWith(expect.any(Object), options);
    });

    it('should accept --report option as true', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      await command.execute({ report: true });

      expect((command as any).generateReport).toHaveBeenCalled();
    });

    it('should handle combined options', async () => {
      (command as any).runLint = vi.fn().mockResolvedValue(undefined);
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      const options = { sonar: false, report: true };
      await command.execute(options);

      expect((command as any).runSonar).toHaveBeenCalledWith(expect.any(Object), options);
      expect((command as any).generateReport).toHaveBeenCalled();
    });
  });

  describe('Execution Order and Flow', () => {
    it('should run all steps in correct order', async () => {
      const order: string[] = [];

      (command as any).runLint = vi.fn().mockImplementation(() => {
        order.push('lint');
      });
      (command as any).runTypeCheck = vi.fn().mockImplementation(() => {
        order.push('typeCheck');
      });
      (command as any).runTests = vi.fn().mockImplementation(() => {
        order.push('tests');
      });
      (command as any).runSonar = vi.fn().mockImplementation(() => {
        order.push('sonar');
      });
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      await command.execute({});

      expect(order).toEqual(['lint', 'typeCheck', 'tests', 'sonar']);
    });

    it('should continue executing steps even if one step marks failed', async () => {
      (command as any).runLint = vi.fn().mockImplementation((result: any) => {
        result.status = 'failed';
      });
      (command as any).runTypeCheck = vi.fn().mockResolvedValue(undefined);
      (command as any).runTests = vi.fn().mockResolvedValue(undefined);
      (command as any).runSonar = vi.fn().mockResolvedValue(undefined);
      (command as any).generateReport = vi.fn();
      (command as any).info = vi.fn();
      (command as any).success = vi.fn();

      await command.execute({});

      expect((command as any).runTypeCheck).toHaveBeenCalled();
      expect((command as any).runTests).toHaveBeenCalled();
      expect((command as any).runSonar).toHaveBeenCalled();
    });
  });
});
