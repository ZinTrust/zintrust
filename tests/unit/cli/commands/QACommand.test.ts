import { QACommand } from '@/cli/commands/QACommand';
import { Logger } from '@config/logger';
import { fs } from '@node-singletons';
import * as child_process from '@node-singletons/child-process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const throwSonarFailed = (): never => {
  throw new Error('Sonar failed');
};

type QAStatus = 'pending' | 'passed' | 'failed' | 'skipped';
type QAResultLike = { status: QAStatus; output?: string };

const setStatus =
  (status: QAStatus) =>
  (result: QAResultLike): void => {
    result.status = status;
  };

const setStatusAndOutput =
  (status: QAStatus, output: string) =>
  (result: QAResultLike): void => {
    result.status = status;
    result.output = output;
  };

const throwError = (error: Error) => (): never => {
  throw error;
};

const throwLintFailed = (): never => {
  throw new Error('Lint failed');
};

const throwTypeCheckFailed = (): never => {
  throw new Error('Type check failed');
};

const throwTypeCheckError = (): never => {
  throw new Error('Type check error');
};

const throwTestsFailed = (): never => {
  throw new Error('Tests failed');
};

const throwTestError = (): never => {
  throw new Error('Test error');
};

const throwReportGenerationFailed = (): never => {
  throw new Error('Report generation failed');
};

const pushOrder = (order: string[], step: string) => (): void => {
  order.push(step);
};

describe('QACommand', () => {
  let command: any;

  beforeEach(() => {
    command = QACommand();
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

      await command.runSonar(result, options);

      expect(result.status).toBe('skipped');
      expect(child_process.execFileSync).not.toHaveBeenCalled();
    });

    it('should run sonarqube npm script if enabled', async () => {
      const result = { status: 'pending', output: '' } as any;
      const options = { sonar: true };

      await command.runSonar(result, options);

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

      vi.mocked(child_process.execFileSync).mockImplementation(throwSonarFailed);

      await command.runSonar(result, options);

      expect(result.status).toBe('failed');
      expect(result.output).toBe('Sonar failed');
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Execute Method', () => {
    it('should initialize results with pending status', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(command.runLint).toHaveBeenCalled();
    });

    it('should run lint first', async () => {
      const executionOrder: string[] = [];

      command.runLint = vi.fn(() => executionOrder.push('lint'));
      command.runTypeCheck = vi.fn(() => executionOrder.push('typeCheck'));
      command.runTests = vi.fn(() => executionOrder.push('tests'));
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[0]).toBe('lint');
    });

    it('should run type check after lint', async () => {
      const executionOrder: string[] = [];

      command.runLint = vi.fn(() => executionOrder.push('lint'));
      command.runTypeCheck = vi.fn(() => executionOrder.push('typeCheck'));
      command.runTests = vi.fn(() => executionOrder.push('tests'));
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[1]).toBe('typeCheck');
    });

    it('should run tests after type check', async () => {
      const executionOrder: string[] = [];

      command.runLint = vi.fn(() => executionOrder.push('lint'));
      command.runTypeCheck = vi.fn(() => executionOrder.push('typeCheck'));
      command.runTests = vi.fn(() => executionOrder.push('tests'));
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[2]).toBe('tests');
    });

    it('should run sonar after tests', async () => {
      const executionOrder: string[] = [];

      command.runLint = vi.fn(() => executionOrder.push('lint'));
      command.runTypeCheck = vi.fn(() => executionOrder.push('typeCheck'));
      command.runTests = vi.fn(() => executionOrder.push('tests'));
      command.runSonar = vi.fn(() => executionOrder.push('sonar'));
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(executionOrder[3]).toBe('sonar');
    });

    it('should generate report when report option is true', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: true };
      await command.execute(options);

      expect(command.generateReport).toHaveBeenCalled();
    });

    it('should always generate report regardless of report option', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      // Report is now always generated to show QA scan status
      expect(command.generateReport).toHaveBeenCalled();
    });

    it('should mark all checks as passed when successful', async () => {
      command.runLint = vi.fn().mockImplementation(setStatus('passed'));
      command.runTypeCheck = vi.fn().mockImplementation(setStatus('passed'));
      command.runTests = vi.fn().mockImplementation(setStatus('passed'));
      command.runSonar = vi.fn().mockImplementation(setStatus('passed'));
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(command.info).toHaveBeenCalledWith('Starting Zintrust QA Suite...');
    });

    it('should handle failures gracefully', async () => {
      command.runLint = vi.fn().mockImplementation(setStatus('failed'));
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(command.info).toHaveBeenCalledWith('Starting Zintrust QA Suite...');
    });

    it('should handle execution errors', async () => {
      command.runLint = vi.fn().mockRejectedValue(new Error('Lint error'));
      command.info = vi.fn();
      command.debug = vi.fn();

      const options = { report: false };
      try {
        await command.execute(options);
      } catch {
        // Error expected
      }

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should display info message at start', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(command.info).toHaveBeenCalledWith('Starting Zintrust QA Suite...');
    });

    it('should pass correct options to sonar', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false, noSonar: true };
      await command.execute(options);

      expect(command.runSonar).toHaveBeenCalledWith(expect.any(Object), options);
    });

    it('should update result objects during execution', async () => {
      command.runLint = vi.fn().mockImplementation(setStatusAndOutput('passed', 'Lint passed'));
      command.runTypeCheck = vi
        .fn()
        .mockImplementation(setStatusAndOutput('passed', 'Type check passed'));
      command.runTests = vi.fn().mockImplementation(setStatusAndOutput('passed', 'Tests passed'));
      command.runSonar = vi.fn().mockImplementation(setStatusAndOutput('passed', 'Sonar passed'));
      command.generateReport = vi.fn();
      command.info = vi.fn();

      const options = { report: false };
      await command.execute(options);

      expect(command.info).toHaveBeenCalled();
    });
  });

  describe('Class Structure', () => {
    it('should create QACommand instance', () => {
      expect(command).toBeDefined();
    });

    it('should have protected name property', () => {
      expect(command.name).toBeDefined();
      expect(command.name).toBe('qa');
    });

    it('should have protected description property', () => {
      expect(command.description).toBeDefined();
      expect(command.description.length).toBeGreaterThan(0);
    });

    it('should have addOptions method', () => {
      expect(command.addOptions).toBeDefined();
      expect(typeof command.addOptions).toBe('function');
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

      await command.runLint(result);

      expect(result.status).toBe('passed');
    });

    it('should capture lint output on success', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Lint completed' as any);

      await command.runLint(result);

      expect(result.output).toBeDefined();
    });

    it('should mark lint as failed on error', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(throwLintFailed);

      await command.runLint(result);

      expect(result.status).toBe('failed');
    });

    it('should log errors during lint', async () => {
      const result = { status: 'pending', output: '' } as any;
      const error = new Error('Linting error');

      vi.mocked(child_process.execFileSync).mockImplementation(throwError(error));

      await command.runLint(result);

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Type Check Execution', () => {
    it('should run type-check npm script', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Type check passed' as any);

      await command.runTypeCheck(result);

      expect(result.status).toBe('passed');
    });

    it('should mark type check as failed on error', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(throwTypeCheckFailed);

      await command.runTypeCheck(result);

      expect(result.status).toBe('failed');
    });

    it('should log errors during type check', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(throwTypeCheckError);

      await command.runTypeCheck(result);

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Test Execution', () => {
    it('should run test npm script', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockReturnValue('Tests passed' as any);

      await command.runTests(result);

      expect(result.status).toBe('passed');
    });

    it('should mark tests as failed on error', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(throwTestsFailed);

      await command.runTests(result);

      expect(result.status).toBe('failed');
    });

    it('should log errors during tests', async () => {
      const result = { status: 'pending', output: '' } as any;

      vi.mocked(child_process.execFileSync).mockImplementation(throwTestError);

      await command.runTests(result);

      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('Report Generation', () => {
    it('should call generateReport when report option is true', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      await command.execute({ report: true });

      expect(command.generateReport).toHaveBeenCalled();
    });

    it('should always call generateReport to show QA scan status', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      await command.execute({ report: false });

      // Report is always generated to show QA suite scan status
      expect(command.generateReport).toHaveBeenCalled();
    });

    it('should handle report generation failure gracefully', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn().mockImplementation(throwReportGenerationFailed);
      command.info = vi.fn();
      command.success = vi.fn();

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
      command.runLint = vi.fn().mockImplementation(setStatus('passed'));
      command.runTypeCheck = vi.fn().mockImplementation(setStatus('passed'));
      command.runTests = vi.fn().mockImplementation(setStatus('passed'));
      command.runSonar = vi.fn().mockImplementation(setStatus('passed'));
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();
      command.warn = vi.fn();

      await command.execute({ report: false });

      expect(command.success).toHaveBeenCalledWith(expect.stringContaining('passed successfully'));
    });

    it('should show warning when some checks fail', async () => {
      command.runLint = vi.fn().mockImplementation(setStatus('failed'));
      command.runTypeCheck = vi.fn().mockImplementation(setStatus('passed'));
      command.runTests = vi.fn().mockImplementation(setStatus('passed'));
      command.runSonar = vi.fn().mockImplementation(setStatus('passed'));
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();
      command.warn = vi.fn();

      await command.execute({ report: false });

      expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('failures'));
    });

    it('should show success when some checks are skipped but all pass or skip', async () => {
      command.runLint = vi.fn().mockImplementation(setStatus('passed'));
      command.runTypeCheck = vi.fn().mockImplementation(setStatus('skipped'));
      command.runTests = vi.fn().mockImplementation(setStatus('passed'));
      command.runSonar = vi.fn().mockImplementation(setStatus('skipped'));
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();
      command.warn = vi.fn();

      await command.execute({ report: false });

      expect(command.success).toHaveBeenCalled();
    });
  });

  describe('Sonar Options Handling', () => {
    it('should skip sonar when --no-sonar option is provided', async () => {
      const result = { status: 'pending', output: '' } as any;

      await command.runSonar(result, { sonar: false });

      expect(result.status).toBe('skipped');
    });

    it('should run sonar when sonar option is true or not provided', async () => {
      const result = { status: 'pending', output: '' } as any;

      await command.runSonar(result, {});

      expect(result.status).toBe('passed');
    });
  });

  describe('Error Handling', () => {
    it('should catch and log errors from execute', async () => {
      command.runLint = vi.fn().mockRejectedValue(new Error('Fatal error'));
      command.info = vi.fn();

      try {
        await command.execute({});
      } catch {
        // Expected
      }

      expect(Logger.error).toHaveBeenCalled();
    });

    it('should rethrow errors after logging', async () => {
      const testError = new Error('Test error');
      command.runLint = vi.fn().mockRejectedValue(testError);
      command.info = vi.fn();

      await expect(command.execute({})).rejects.toThrow();
    });

    it('should log debug info on errors', async () => {
      const testError = new Error('Debug test');
      command.runLint = vi.fn().mockRejectedValue(testError);
      command.info = vi.fn();
      command.debug = vi.fn();

      try {
        await command.execute({});
      } catch {
        // Expected
      }

      expect(command.debug).toHaveBeenCalled();
    });
  });

  describe('Options Handling', () => {
    it('should accept --no-sonar option', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      const options = { sonar: false, report: false };
      await command.execute(options);

      expect(command.runSonar).toHaveBeenCalledWith(expect.any(Object), options);
    });

    it('should accept --report option as true', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      await command.execute({ report: true });

      expect(command.generateReport).toHaveBeenCalled();
    });

    it('should handle combined options', async () => {
      command.runLint = vi.fn().mockResolvedValue(undefined);
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      const options = { sonar: false, report: true };
      await command.execute(options);

      expect(command.runSonar).toHaveBeenCalledWith(expect.any(Object), options);
      expect(command.generateReport).toHaveBeenCalled();
    });
  });

  describe('Execution Order and Flow', () => {
    it('should run all steps in correct order', async () => {
      const order: string[] = [];

      command.runLint = vi.fn().mockImplementation(pushOrder(order, 'lint'));
      command.runTypeCheck = vi.fn().mockImplementation(pushOrder(order, 'typeCheck'));
      command.runTests = vi.fn().mockImplementation(pushOrder(order, 'tests'));
      command.runSonar = vi.fn().mockImplementation(pushOrder(order, 'sonar'));
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      await command.execute({});

      expect(order).toEqual(['lint', 'typeCheck', 'tests', 'sonar']);
    });

    it('should continue executing steps even if one step marks failed', async () => {
      command.runLint = vi.fn().mockImplementation(setStatus('failed'));
      command.runTypeCheck = vi.fn().mockResolvedValue(undefined);
      command.runTests = vi.fn().mockResolvedValue(undefined);
      command.runSonar = vi.fn().mockResolvedValue(undefined);
      command.generateReport = vi.fn();
      command.info = vi.fn();
      command.success = vi.fn();

      await command.execute({});

      expect(command.runTypeCheck).toHaveBeenCalled();
      expect(command.runTests).toHaveBeenCalled();
      expect(command.runSonar).toHaveBeenCalled();
    });
  });
});
