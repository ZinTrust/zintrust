import { AddCommand } from '@cli/commands/AddCommand';
import { LogsCommand } from '@cli/commands/LogsCommand';
import { NewCommand } from '@cli/commands/NewCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { ControllerGenerator } from '@cli/scaffolding/ControllerGenerator';
import { FactoryGenerator } from '@cli/scaffolding/FactoryGenerator';
import { FeatureScaffolder } from '@cli/scaffolding/FeatureScaffolder';
import { MigrationGenerator } from '@cli/scaffolding/MigrationGenerator';
import { ModelGenerator } from '@cli/scaffolding/ModelGenerator';
import { RequestFactoryGenerator } from '@cli/scaffolding/RequestFactoryGenerator';
import { ResponseFactoryGenerator } from '@cli/scaffolding/ResponseFactoryGenerator';
import { RouteGenerator } from '@cli/scaffolding/RouteGenerator';
import { SeederGenerator } from '@cli/scaffolding/SeederGenerator';
import { ServiceScaffolder } from '@cli/scaffolding/ServiceScaffolder';
import { WorkflowGenerator } from '@cli/scaffolding/WorkflowGenerator';
import { Logger } from '@config/logger';
import fs from '@node-singletons/fs';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/PromptHelper');
vi.mock('@cli/scaffolding/WorkflowGenerator');
vi.mock('@cli/scaffolding/ControllerGenerator');
vi.mock('@cli/scaffolding/RouteGenerator');
vi.mock('@cli/scaffolding/RequestFactoryGenerator');
vi.mock('@cli/scaffolding/ResponseFactoryGenerator');
vi.mock('@cli/scaffolding/ServiceScaffolder');
vi.mock('@cli/scaffolding/FeatureScaffolder');
vi.mock('@cli/scaffolding/MigrationGenerator');
vi.mock('@cli/scaffolding/ModelGenerator');
vi.mock('@cli/scaffolding/FactoryGenerator');
vi.mock('@cli/scaffolding/SeederGenerator');
vi.mock('@config/logger');
vi.mock('@node-singletons/fs');

describe('CLI Coverage Boost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LogsCommand Branch Coverage', () => {
    it('should handle Buffer chunks in processLogChunk (Line 72)', async () => {
      const logsCmd = LogsCommand.create();
      const mockStream = new EventEmitter();

      vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const executePromise = logsCmd.execute({ file: 'test.log', tail: true });

      // Wait a bit for the stream to be attached
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Emit a Buffer chunk to trigger line 72: if (Buffer.isBuffer(chunk))
      mockStream.emit(
        'data',
        Buffer.from('{"timestamp":"2023-01-01","level":"info","message":"buffer test"}\n')
      );

      mockStream.emit('end');
      await executePromise;

      expect(Logger.info).toHaveBeenCalled();
    });

    it('should throw error if lines is NaN (Line 168)', async () => {
      const logsCmd = LogsCommand.create();
      expect(() => logsCmd.execute({ lines: 'not-a-number' })).toThrow('Lines must be a number');
    });
  });

  describe('NewCommand Branch Coverage', () => {
    it('should handle empty project name from prompt (Line 255)', async () => {
      const newCmd = NewCommand.create();
      vi.mocked(PromptHelper.projectName).mockResolvedValue('');

      await expect(newCmd.execute({})).rejects.toThrow();
    });
  });

  describe('AddCommand Branch Coverage', () => {
    const generators = [
      { type: 'service', mock: ServiceScaffolder.scaffold, args: { name: 'test' }, async: true },
      {
        type: 'feature',
        mock: FeatureScaffolder.addFeature,
        args: { name: 'test', service: 'test' },
        async: false,
      },
      {
        type: 'controller',
        mock: ControllerGenerator.generateController,
        args: { name: 'test' },
        async: true,
      },
      {
        type: 'migration',
        mock: MigrationGenerator.generateMigration,
        args: { name: 'test' },
        async: true,
      },
      { type: 'model', mock: ModelGenerator.generateModel, args: { name: 'test' }, async: true },
      { type: 'routes', mock: RouteGenerator.generateRoutes, args: { name: 'test' }, async: true },
      {
        type: 'factory',
        mock: FactoryGenerator.generateFactory,
        args: { name: 'test', model: 'test' },
        async: true,
      },
      {
        type: 'seeder',
        mock: SeederGenerator.generateSeeder,
        args: { name: 'test', model: 'test' },
        async: true,
      },
      { type: 'workflow', mock: WorkflowGenerator.generate, args: { name: 'test' }, async: true },
    ];

    generators.forEach(({ type, mock, args, async: isAsync }) => {
      it(`should handle ${type} generator failure`, async () => {
        const addCmd = AddCommand.create();
        const result = { success: false, message: 'Failed' };
        if (isAsync) {
          vi.mocked(mock).mockResolvedValue(result as any);
        } else {
          vi.mocked(mock).mockReturnValue(result as any);
        }

        await expect(
          addCmd.execute({ args: [type, args.name], ...args, noInteractive: true })
        ).rejects.toThrow();
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed'));
      });
    });

    it('should handle requestfactory generator failure', async () => {
      const addCmd = AddCommand.create();
      vi.mocked(RequestFactoryGenerator.generateRequestFactory).mockResolvedValue({
        success: false,
        message: 'Failed',
      } as any);

      await expect(
        addCmd.execute({ args: ['requestfactory', 'test'], name: 'test', noInteractive: true })
      ).rejects.toThrow();
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed'));
    });

    it('should handle responsefactory generator failure', async () => {
      const addCmd = AddCommand.create();
      vi.mocked(ResponseFactoryGenerator.generate).mockResolvedValue({
        success: false,
        message: 'Failed',
      } as any);

      await expect(
        addCmd.execute({ args: ['responsefactory', 'test'], name: 'test', noInteractive: true })
      ).rejects.toThrow();
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed'));
    });
  });
});
