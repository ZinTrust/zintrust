/**
 * Workflow Generator
 * Generates GitHub Actions workflows for deployment and CI/CD
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface WorkflowOptions {
  name: string;
  platform: 'lambda' | 'fargate' | 'cloudflare' | 'deno' | 'all';
  branch?: string;
  nodeVersion?: string;
  projectRoot: string;
}

/**
 * Generate a deployment workflow
 */
export async function generateWorkflow(
  options: WorkflowOptions
): Promise<{ success: boolean; filePath: string; message: string }> {
  const workflowDir = path.join(options.projectRoot, '.github', 'workflows');
  const filePath = path.join(workflowDir, 'deploy-cloud.yml');
  const branch = options.branch ?? 'master';
  const nodeVersion = options.nodeVersion ?? '20.x';

  try {
    // Ensure directory exists
    await fs.mkdir(workflowDir, { recursive: true });

    const content = getWorkflowTemplate(options.platform, branch, nodeVersion);

    FileGenerator.writeFile(filePath, content, {
      overwrite: true,
    });

    return {
      success: true,
      filePath,
      message: `Workflow generated successfully at ${filePath}`,
    };
  } catch (error) {
    Logger.error('Workflow generation failed', error);
    return {
      success: false,
      filePath,
      message: `Failed to generate workflow: ${(error as Error).message}`,
    };
  }
}

/**
 * Get workflow template based on platform
 */
export function getWorkflowTemplate(platform: string, branch: string, nodeVersion: string): string {
  const isAll = platform === 'all';
  const isLambda = isAll || platform === 'lambda';
  const isFargate = isAll || platform === 'fargate';
  const isCloudflare = isAll || platform === 'cloudflare';
  const isDeno = isAll || platform === 'deno';

  let content = `name: Deploy Cloud

on:
  push:
    branches:
      - ${branch}
      - production
      - staging
  pull_request:
    branches:
      - ${branch}
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform to deploy (lambda,fargate,cloudflare,deno,all)'
        required: true
        default: '${platform}'

env:
  REGISTRY: ghcr.io
  AWS_REGION: us-east-1

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Type check
        run: npm run type-check

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
`;

  if (isLambda) {
    content += `
  deploy-lambda:
    needs: build
    runs-on: ubuntu-latest
    if: contains(github.event.inputs.platform || 'all', 'lambda') || github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - name: Deploy to AWS Lambda
        run: echo "Deploying to Lambda..."
`;
  }

  if (isFargate) {
    content += `
  deploy-fargate:
    needs: build
    runs-on: ubuntu-latest
    if: contains(github.event.inputs.platform || 'all', 'fargate') || github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Build and Push Docker Image
        run: echo "Pushing to GHCR..."
`;
  }

  if (isCloudflare) {
    content += `
  deploy-cloudflare:
    needs: build
    runs-on: ubuntu-latest
    if: contains(github.event.inputs.platform || 'all', 'cloudflare') || github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Cloudflare Workers
        run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`;
  }

  if (isDeno) {
    content += `
  deploy-deno:
    needs: build
    runs-on: ubuntu-latest
    if: contains(github.event.inputs.platform || 'all', 'deno') || github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Deno Deploy
        run: echo "Deploying to Deno..."
`;
  }

  return content;
}

/**
 * WorkflowGenerator object for backward compatibility
 */
export const WorkflowGenerator = {
  generate: generateWorkflow,
  getTemplate: getWorkflowTemplate,
};
