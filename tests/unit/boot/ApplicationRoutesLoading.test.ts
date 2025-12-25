import { Application } from '@boot/Application';
import { Router } from '@routing/Router';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Application route loading', () => {
  let originalCwd: string;
  let tempDir: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('prefers app-local routes over framework routes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zintrust-app-routes-'));
    await mkdir(join(tempDir, 'routes'), { recursive: true });

    // Write a minimal app-local routes module that does not rely on path aliases.
    await writeFile(
      join(tempDir, 'routes', 'api.js'),
      [
        'export function registerRoutes(router) {',
        '  const route = {',
        "    method: 'GET',",
        "    path: '/app-health',",
        '    pattern: /^\\/app-health$/,',
        '    paramNames: [],',
        '    handler: async (_req, res) => {',
        '      res.setStatus(200).json({ ok: true });',
        '    },',
        '  };',
        '  router.routes.push(route);',
        "  if (!router.routeIndex.has('GET')) router.routeIndex.set('GET', []);",
        "  router.routeIndex.get('GET').push(route);",
        '}',
        '',
      ].join('\n'),
      'utf8'
    );

    process.chdir(tempDir);

    const app = Application.create();
    await app.boot();

    const match = Router.match(app.getRouter(), 'GET', '/app-health');
    expect(match).not.toBeNull();
  });
});
