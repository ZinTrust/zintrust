import { describe, expect, it, vi } from 'vitest';

// Cover the fallback branches inside adapter-package `importCore()` helpers.
// Many register.ts files have a double try/catch to tolerate ESM resolution issues.

describe('adapter packages register.ts importCore fallbacks (coverage)', () => {
  it('executes importCore catch paths when core import fails', async () => {
    const registerFiles = [
      '../../../../packages/mail-mailgun/src/register',
      '../../../../packages/mail-sendgrid/src/register',
      '../../../../packages/mail-smtp/src/register',
      '../../../../packages/queue-redis/src/register',
      '../../../../packages/storage-gcs/src/register',
      '../../../../packages/storage-r2/src/register',
      '../../../../packages/storage-s3/src/register',
    ] as const;

    const mockCoreImportFailure = (): never => {
      throw new Error('mock import failure');
    };

    const importWithFailingCore = async (file: (typeof registerFiles)[number]): Promise<string> => {
      vi.resetModules();
      vi.doMock('@zintrust/core', mockCoreImportFailure);

      try {
        await import(file);
        return file;
      } finally {
        vi.unmock('@zintrust/core');
        vi.resetModules();
      }
    };

    const imported: string[] = [];
    await registerFiles.reduce(async (prev, file) => {
      await prev;
      imported.push(await importWithFailingCore(file));
    }, Promise.resolve());

    // Assertion: all register files imported without throwing.
    expect(imported).toHaveLength(registerFiles.length);
  });
});
