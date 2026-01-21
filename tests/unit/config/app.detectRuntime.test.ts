import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appConfig } from '@config/app';

describe('appConfig.detectRuntime', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const originalCF = (globalThis as { CF?: unknown }).CF;
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    Object.assign(process.env, {});
    Object.assign(process.env, originalEnv);
    if (originalCF === undefined) {
      delete (globalThis as { CF?: unknown }).CF;
    } else {
      (globalThis as { CF?: unknown }).CF = originalCF;
    }
    if (originalDeno === undefined) {
      delete (globalThis as { Deno?: unknown }).Deno;
    } else {
      (globalThis as { Deno?: unknown }).Deno = originalDeno;
    }
  });

  it('detects lambda runtime', () => {
    process.env['RUNTIME'] = '';
    process.env['LAMBDA_TASK_ROOT'] = '1';
    expect(appConfig.detectRuntime()).toBe('lambda');
  });

  it('detects cloudflare runtime', () => {
    process.env['RUNTIME'] = '';
    delete process.env['LAMBDA_TASK_ROOT'];
    (globalThis as { CF?: unknown }).CF = {};
    expect(appConfig.detectRuntime()).toBe('cloudflare');
  });

  it('detects deno runtime', () => {
    process.env['RUNTIME'] = '';
    delete process.env['LAMBDA_TASK_ROOT'];
    delete (globalThis as { CF?: unknown }).CF;
    (globalThis as { Deno?: unknown }).Deno = {};
    expect(appConfig.detectRuntime()).toBe('deno');
  });
});
