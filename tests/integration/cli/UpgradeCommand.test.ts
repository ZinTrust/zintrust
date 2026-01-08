import { mkdtemp, readFile, rm, writeFile } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CLI } from '@cli/CLI';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('CLI → upgrade', () => {
  let tmp: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'zintrust-upgrade-'));
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('backfills HOST/PORT/LOG_LEVEL when missing', async () => {
    await writeFile(join(process.cwd(), '.env'), 'APP_NAME=test\n', 'utf8');

    const cli = CLI.create();
    await cli.run(['upgrade']);

    const raw = await readFile(join(process.cwd(), '.env'), 'utf8');
    expect(raw).toContain('HOST=localhost');
    expect(raw).toContain('PORT=7777');
    expect(raw).toContain('LOG_LEVEL=debug');
  });

  it('does not overwrite non-empty values', async () => {
    await writeFile(
      join(process.cwd(), '.env'),
      'HOST=0.0.0.0\nPORT=9999\nLOG_LEVEL=info\n',
      'utf8'
    );

    const cli = CLI.create();
    await cli.run(['upgrade']);

    const raw = await readFile(join(process.cwd(), '.env'), 'utf8');
    expect(raw).toContain('HOST=0.0.0.0');
    expect(raw).toContain('PORT=9999');
    expect(raw).toContain('LOG_LEVEL=info');
    expect(raw).not.toContain('HOST=localhost');
    expect(raw).not.toContain('PORT=7777');
    expect(raw).not.toContain('LOG_LEVEL=debug');
  });
});
