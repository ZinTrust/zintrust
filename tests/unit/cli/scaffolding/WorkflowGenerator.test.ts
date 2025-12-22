import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises');
vi.mock('node:path');
vi.mock('node:fs');
vi.mock('@/cli/scaffolding/FileGenerator');
vi.mock('@/config/logger');

import { FileGenerator } from '@/cli/scaffolding/FileGenerator';
import {
  generateWorkflow,
  getWorkflowTemplate,
  WorkflowOptions,
} from '@/cli/scaffolding/WorkflowGenerator';
import { Logger } from '@/config/logger';

describe('WorkflowGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(path.join).mockImplementation((...args: string[]) => args.join('/'));
    vi.mocked(FileGenerator.writeFile).mockReturnValue(undefined as any);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getWorkflowTemplate', () => {
    it('should generate workflow template for lambda platform', () => {
      const template = getWorkflowTemplate('lambda', 'main', '20.x');

      expect(template).toContain('name: Deploy Cloud');
      expect(template).toContain('ubuntu-latest');
      expect(template).toContain('node-version: 20.x');
      expect(template).toContain('main');
    });

    it('should generate workflow template for fargate platform', () => {
      const template = getWorkflowTemplate('fargate', 'main', '20.x');

      expect(template).toContain('name: Deploy Cloud');
      expect(template).toContain('fargate');
    });

    it('should generate workflow template for cloudflare platform', () => {
      const template = getWorkflowTemplate('cloudflare', 'main', '20.x');

      expect(template).toContain('name: Deploy Cloud');
      expect(template).toContain('cloudflare');
    });

    it('should generate workflow template for deno platform', () => {
      const template = getWorkflowTemplate('deno', 'main', '20.x');

      expect(template).toContain('name: Deploy Cloud');
      expect(template).toContain('deno');
    });

    it('should generate workflow template for all platforms', () => {
      const template = getWorkflowTemplate('all', 'main', '20.x');

      expect(template).toContain('name: Deploy Cloud');
      expect(template).toContain('lambda');
      expect(template).toContain('fargate');
      expect(template).toContain('cloudflare');
      expect(template).toContain('deno');
    });

    it('should include correct branch in workflow', () => {
      const template = getWorkflowTemplate('lambda', 'develop', '20.x');

      expect(template).toContain('- develop');
    });

    it('should include correct node version in workflow', () => {
      const template = getWorkflowTemplate('lambda', 'main', '18.x');

      expect(template).toContain('node-version: 18.x');
    });

    it('should include production and staging branches', () => {
      const template = getWorkflowTemplate('lambda', 'main', '20.x');

      expect(template).toContain('- production');
      expect(template).toContain('- staging');
    });

    it('should include checkout action', () => {
      const template = getWorkflowTemplate('lambda', 'main', '20.x');

      expect(template).toContain('actions/checkout');
    });

    it('should include build and test steps', () => {
      const template = getWorkflowTemplate('lambda', 'main', '20.x');

      expect(template).toContain('npm ci');
      expect(template).toContain('npm run type-check');
      expect(template).toContain('npm test');
      expect(template).toContain('npm run build');
    });

    it('should include artifact upload step', () => {
      const template = getWorkflowTemplate('lambda', 'main', '20.x');

      expect(template).toContain('actions/upload-artifact');
    });

    it('should set correct environment variables', () => {
      const template = getWorkflowTemplate('lambda', 'main', '20.x');

      expect(template).toContain('REGISTRY: ghcr.io');
      expect(template).toContain('AWS_REGION: us-east-1');
    });
  });

  describe('generateWorkflow', () => {
    it('should generate workflow successfully', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      const result = await generateWorkflow(options);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.message).toContain('successfully');
    });

    it('should create .github/workflows directory', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('should write workflow file', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'fargate',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      expect(FileGenerator.writeFile).toHaveBeenCalled();
    });

    it('should use default branch if not specified', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      const writeCall = vi.mocked(FileGenerator.writeFile).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('- master');
    });

    it('should use custom branch if specified', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        branch: 'main',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      const writeCall = vi.mocked(FileGenerator.writeFile).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('- main');
    });

    it('should use default node version if not specified', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      const writeCall = vi.mocked(FileGenerator.writeFile).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('node-version: 20.x');
    });

    it('should use custom node version if specified', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        nodeVersion: '18.x',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      const writeCall = vi.mocked(FileGenerator.writeFile).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('node-version: 18.x');
    });

    it('should handle workflow generation for all platforms', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'all',
        projectRoot: '/project',
      };

      const result = await generateWorkflow(options);

      expect(result.success).toBe(true);
      const writeCall = vi.mocked(FileGenerator.writeFile).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('lambda');
      expect(content).toContain('fargate');
      expect(content).toContain('cloudflare');
      expect(content).toContain('deno');
    });

    it('should handle cloudflare platform', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'cloudflare',
        projectRoot: '/project',
      };

      const result = await generateWorkflow(options);

      expect(result.success).toBe(true);
    });

    it('should handle deno platform', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'deno',
        projectRoot: '/project',
      };

      const result = await generateWorkflow(options);

      expect(result.success).toBe(true);
    });

    it('should handle errors during workflow generation', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      const result = await generateWorkflow(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should set correct workflow file path', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      const result = await generateWorkflow(options);

      expect(result.filePath).toContain('.github');
      expect(result.filePath).toContain('workflows');
      expect(result.filePath).toContain('deploy-cloud.yml');
    });

    it('should include platform in default platform input', async () => {
      const options: WorkflowOptions = {
        name: 'deploy',
        platform: 'lambda',
        projectRoot: '/project',
      };

      await generateWorkflow(options);

      const writeCall = vi.mocked(FileGenerator.writeFile).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain("default: 'lambda'");
    });
  });
});
