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
});
